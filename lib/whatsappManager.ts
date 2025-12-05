import path from "path";
import { randomUUID } from "crypto";
import { setTimeout as delay } from "timers/promises";
import { promises as fs } from "fs";
import QRCode from "qrcode";
import {
  Browsers,
  DisconnectReason,
  type WASocket,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState as createAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import type {
  AuthenticationCreds,
  SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { dataDirectory, readJson, writeJson } from "./storage";
import type { BroadcastConfig, BroadcastLogEntry, StoredConfig } from "./types";

const defaultStoredConfig: StoredConfig = {
  recipientsRaw: "",
  message: "",
  minDelaySec: 1,
  maxDelaySec: 3,
  intervalMinutes: 0,
};

const logsFile = "logs.json";
const configFile = "config.json";
const authDir = path.join(dataDirectory, "auth");
const baseLogger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "silent",
});

const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

type LinkPreviewData = Awaited<ReturnType<WASocket["generateLinkPreview"]>>;

type LoginUpdate =
  | { type: "qr"; qr: string }
  | { type: "connected" }
  | { type: "logged-out" };

type BroadcastTrigger = "manual" | "scheduled";

type ManagerStatus = {
  connected: boolean;
  hasAuth: boolean;
};

class WhatsAppManager {
  private static instance: WhatsAppManager;

  private socket: ReturnType<typeof makeWASocket> | null = null;
  private status: ManagerStatus = { connected: false, hasAuth: false };
  private loginQr: string | null = null;
  private loginResolvers: Array<(value: LoginUpdate) => void> = [];
  private readyPromise: Promise<void> | null = null;
  private authState?: {
    state: {
      creds: AuthenticationCreds;
      keys: SignalDataTypeMap;
    };
    saveCreds: () => Promise<void>;
  };
  private config: BroadcastConfig = {
    ...defaultStoredConfig,
    recipients: [],
  };
  private logs: BroadcastLogEntry[] = [];
  private timer: NodeJS.Timeout | null = null;
  private nextRun: number | null = null;
  private sending = false;

  private constructor() {
    void this.bootstrap();
  }

  static getInstance(): WhatsAppManager {
    if (!this.instance) {
      this.instance = new WhatsAppManager();
    }
    return this.instance;
  }

  private async bootstrap() {
    await this.loadConfig();
    await this.loadLogs();
  }

  private async ensureAuthState() {
    if (this.authState) return;

    try {
      await fs.mkdir(authDir, { recursive: true });
      this.authState = await createAuthState(authDir);
      const credsPath = path.join(authDir, "creds.json");
      const hasCreds = await fs
        .access(credsPath)
        .then(() => true)
        .catch(() => false);
      this.status.hasAuth = hasCreds;
    } catch (error) {
      console.warn("Failed to prepare auth state", error);
      this.status.hasAuth = false;
    }
  }

  private sanitizeRecipients(raw: string): string[] {
    const chunks = raw
      .split(/[;\n\r]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const normalized = new Set<string>();

    for (const chunk of chunks) {
      const digitsOnly = chunk.replace(/\D/g, "");
      if (!digitsOnly) continue;

      let candidate = digitsOnly;
      if (candidate.startsWith("0")) {
        candidate = `62${candidate.slice(1)}`;
      }

      if (candidate.startsWith("+")) {
        candidate = candidate.slice(1);
      }

      if (!/^\d{6,15}$/.test(candidate)) continue;

      normalized.add(candidate);
    }

    return Array.from(normalized);
  }

  private containsUrl(text: string) {
    return /(https?:\/\/\S+)/i.test(text);
  }

  private extractFirstUrl(text: string): string | null {
    const match = text.match(/https?:\/\/\S+/i);
    if (!match) return null;
    return match[0].replace(/[)\]\}>,.?!]+$/, "");
  }

  private async buildLinkPreview(
    message: string
  ): Promise<LinkPreviewData | undefined> {
    if (!this.socket) return undefined;
    const url = this.extractFirstUrl(message);
    if (!url) return undefined;

    try {
      return await this.socket.generateLinkPreview(url);
    } catch (error) {
      console.warn("Failed to build link preview", error);
      return undefined;
    }
  }

  private async loadConfig() {
    const stored = await readJson(configFile, defaultStoredConfig);
    this.applyConfig(stored);
  }

  private applyConfig(stored: StoredConfig) {
    this.config = {
      ...stored,
      recipients: this.sanitizeRecipients(stored.recipientsRaw),
    };
  }

  private async loadLogs() {
    const fallback: { entries: BroadcastLogEntry[] } = { entries: [] };
    const payload = await readJson(logsFile, fallback);
    this.logs = (payload.entries ?? []).map((entry) => ({
      ...entry,
      timestamp: entry.timestamp,
    }));
    this.pruneLogs();
  }

  private async persistLogs() {
    await writeJson(logsFile, { entries: this.logs });
  }

  private pruneLogs() {
    const cutoff = Date.now() - sevenDaysMs;
    this.logs = this.logs.filter(
      (entry) => new Date(entry.timestamp).getTime() >= cutoff
    );
  }

  private emitLoginUpdate(update: LoginUpdate) {
    const listeners = [...this.loginResolvers];
    this.loginResolvers = [];
    for (const resolve of listeners) {
      try {
        resolve(update);
      } catch (error) {
        console.warn("Login resolver failed", error);
      }
    }
  }

  private async initSocket() {
    if (this.socket || this.readyPromise) {
      if (this.readyPromise) await this.readyPromise;
      return;
    }

    this.readyPromise = (async () => {
      await this.ensureAuthState();
      const auth = this.authState ?? (await createAuthState(authDir));
      this.authState = auth;
      const { state, saveCreds } = auth;
      let version: [number, number, number];
      try {
        ({ version } = await fetchLatestBaileysVersion());
      } catch (error) {
        console.warn("Falling back to default Baileys version", error);
        version = [2, 3000, 0];
      }
      this.socket = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        logger: baseLogger.child({ class: "baileys" }),
        browser: Browsers.macOS("Chrome"),
      });
      this.socket.ev.on("creds.update", async () => {
        if (!saveCreds) return;
        try {
          await saveCreds();
        } catch (error) {
          console.warn("Failed to persist creds", error);
        }
      });
      this.socket.ev.on("connection.update", (update) => {
        void this.handleConnectionUpdate(update);
      });
      this.status.connected = false;
    })();

    try {
      await this.readyPromise;
    } finally {
      this.readyPromise = null;
    }
  }

  private async handleConnectionUpdate(update: {
    connection?: "open" | "close" | "connecting";
    qr?: string;
    lastDisconnect?: { error?: unknown };
  }) {
    if (update.qr) {
      this.loginQr = update.qr;
      this.emitLoginUpdate({ type: "qr", qr: update.qr });
    }

    if (update.connection === "open") {
      this.status = { connected: true, hasAuth: true };
      this.loginQr = null;
      this.emitLoginUpdate({ type: "connected" });
    }

    if (update.connection === "close") {
      this.status = { connected: false, hasAuth: this.status.hasAuth };
      this.socket = null;
      const error = update.lastDisconnect?.error as {
        output?: { statusCode?: number };
      };
      const statusCode = error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        await this.clearAuth();
        this.emitLoginUpdate({ type: "logged-out" });
      } else {
        await delay(1000);
        void this.initSocket();
      }
    }
  }

  private async clearAuth() {
    try {
      await fs.rm(authDir, { recursive: true, force: true });
    } catch (error) {
      console.warn("Failed clearing auth file", error);
    }
    this.authState = undefined;
    this.status.hasAuth = false;
    this.loginQr = null;
  }

  private async waitForLoginUpdate(timeoutMs = 20000): Promise<LoginUpdate> {
    return new Promise<LoginUpdate>((resolve) => {
      const timer = setTimeout(() => {
        const qr = this.loginQr;
        if (qr) {
          resolve({ type: "qr", qr });
        } else {
          resolve({ type: "logged-out" });
        }
      }, timeoutMs);
      this.loginResolvers.push((value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
  }

  async requestLogin(): Promise<
    { status: "connected" } | { status: "qr"; qrDataUrl: string }
  > {
    try {
      await this.initSocket();

      if (this.status.connected) {
        return { status: "connected" };
      }

      if (this.loginQr) {
        return {
          status: "qr",
          qrDataUrl: await QRCode.toDataURL(this.loginQr, { scale: 8 }),
        };
      }

      const update = await this.waitForLoginUpdate();
      if (update.type === "qr") {
        return {
          status: "qr",
          qrDataUrl: await QRCode.toDataURL(update.qr, { scale: 8 }),
        };
      }

      if (update.type === "connected") {
        return { status: "connected" };
      }

      return {
        status: "qr",
        qrDataUrl: await QRCode.toDataURL(this.loginQr ?? "", { scale: 8 }),
      };
    } catch (error) {
      console.error("requestLogin failed", error);
      throw error;
    }
  }

  async logout() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.nextRun = null;

    try {
      await this.socket?.logout();
    } catch (error) {
      console.warn("Error during logout", error);
    }
    this.socket = null;
    await this.clearAuth();
    this.status.connected = false;
  }

  getStatus() {
    return {
      connected: this.status.connected,
      hasAuth: this.status.hasAuth,
      timerActive: Boolean(this.timer),
      nextRun: this.nextRun,
      config: this.config,
    };
  }

  async getLogs() {
    return this.logs;
  }

  private async addLog(entry: Omit<BroadcastLogEntry, "id" | "timestamp">) {
    const logEntry: BroadcastLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.logs.unshift(logEntry);
    this.pruneLogs();
    await this.persistLogs();
  }

  async updateConfig(partial: StoredConfig) {
    const sanitized = this.sanitizeRecipients(partial.recipientsRaw);

    const safeConfig: StoredConfig = {
      recipientsRaw: partial.recipientsRaw ?? "",
      message: partial.message ?? "",
      minDelaySec: Math.max(0, Number(partial.minDelaySec ?? 0)),
      maxDelaySec: Math.max(0, Number(partial.maxDelaySec ?? 0)),
      intervalMinutes: Math.max(0, Number(partial.intervalMinutes ?? 0)),
    };

    if (safeConfig.maxDelaySec < safeConfig.minDelaySec) {
      safeConfig.maxDelaySec = safeConfig.minDelaySec;
    }

    this.config = {
      ...safeConfig,
      recipients: sanitized,
    };

    await writeJson(configFile, safeConfig);
  }

  async sendNow() {
    return this.sendBroadcast("manual");
  }

  startSchedule() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.config.intervalMinutes <= 0) {
      this.nextRun = null;
      return;
    }

    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    this.timer = setInterval(() => {
      void this.sendBroadcast("scheduled")
        .then(() => {
          this.nextRun = Date.now() + intervalMs;
        })
        .catch((error) => {
          console.error("Scheduled broadcast failed", error);
        });
    }, intervalMs);
    this.timer.unref?.();
    this.nextRun = Date.now() + intervalMs;
  }

  stopSchedule() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.nextRun = null;
  }
}

const manager = WhatsAppManager.getInstance();

export function getWhatsAppManager() {
  return manager;
}
