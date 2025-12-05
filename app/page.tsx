"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";

type ConfigResponse = {
  recipientsRaw: string;
  recipients: string[];
  message: string;
  minDelaySec: number;
  maxDelaySec: number;
  intervalMinutes: number;
};

type StatusResponse = {
  ok: boolean;
  connected: boolean;
  hasAuth: boolean;
  timerActive: boolean;
  nextRun: string | null;
  config: ConfigResponse;
  recipientCount: number;
};

type LogEntry = {
  id: string;
  timestamp: string;
  recipients: string[];
  success: number;
  failed: number;
  messagePreview: string;
};

type FormState = {
  recipientsRaw: string;
  message: string;
  minDelaySec: string;
  maxDelaySec: string;
  intervalMinutes: string;
};

const initialForm: FormState = {
  recipientsRaw: "",
  message: "",
  minDelaySec: "1",
  maxDelaySec: "3",
  intervalMinutes: "0",
};

const styles = {
  container: {
    maxWidth: "960px",
    margin: "0 auto",
    padding: "24px 16px",
  },
  card: {
    background: "#fff",
    border: "1px solid #ddd",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "16px",
  },
  titleRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "8px 12px",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: (color: string, bg: string) => ({
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: 600,
    color,
    background: bg,
  }),
  button: (variant: "primary" | "secondary") => {
    const base = {
      padding: "10px 14px",
      borderRadius: "6px",
      border: "1px solid transparent",
      fontWeight: 600,
      fontSize: "14px",
      cursor: "pointer",
    } as const;

    if (variant === "primary") {
      return {
        ...base,
        background: "#2563eb",
        color: "#fff",
        borderColor: "#2563eb",
      };
    }
    return {
      ...base,
      background: "#e5e7eb",
      color: "#111",
      borderColor: "#d1d5db",
    };
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
  },
  labelRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap" as const,
  },
  label: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
    flex: 1,
    minWidth: "200px",
    fontSize: "14px",
    fontWeight: 600,
  },
  textarea: {
    width: "100%",
    minHeight: "140px",
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
  },
  thtd: {
    border: "1px solid #e5e7eb",
    padding: "8px 10px",
    fontSize: "13px",
    textAlign: "left" as const,
  },
  footerRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap" as const,
    alignItems: "center",
  },
};

const parseNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatLocalDateTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
};

const countRecipients = (input: string) => {
  const normalized = new Set<string>();
  input
    .split(/[;\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((chunk) => {
      const digitsOnly = chunk.replace(/\D/g, "");
      if (!digitsOnly) return;

      let candidate = digitsOnly;
      if (candidate.startsWith("0")) {
        candidate = `62${candidate.slice(1)}`;
      }

      if (!/^\d{6,15}$/.test(candidate)) return;
      normalized.add(candidate);
    });

  return normalized.size;
};

export default function Home() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [isDirty, setIsDirty] = useState(false);
  const [connected, setConnected] = useState(false);
  const [hasAuth, setHasAuth] = useState(false);
  const [timerActive, setTimerActive] = useState(false);
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [recipientCount, setRecipientCount] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetAlerts = useCallback(() => {
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  const mapConfigToForm = useCallback(
    (config: ConfigResponse): FormState => ({
      recipientsRaw: config.recipientsRaw ?? "",
      message: config.message ?? "",
      minDelaySec: String(config.minDelaySec ?? ""),
      maxDelaySec: String(config.maxDelaySec ?? ""),
      intervalMinutes: String(config.intervalMinutes ?? ""),
    }),
    []
  );

  const fetchStatus = useCallback(
    async (silent = false) => {
      if (!silent) resetAlerts();

      try {
        const response = await fetch("/api/session/status", {
          cache: "no-store",
        });
        const data: StatusResponse = await response.json();
        if (!data.ok) throw new Error("Unable to retrieve status");

        setConnected(data.connected);
        setHasAuth(data.hasAuth);
        setTimerActive(data.timerActive);
        setNextRun(data.nextRun);
        setRecipientCount(data.recipientCount);

        if (!isDirty) {
          setForm(mapConfigToForm(data.config));
          setRecipientCount(countRecipients(data.config.recipientsRaw ?? ""));
        }

        if (data.connected) setQrDataUrl(null);
      } catch (error) {
        if (!silent) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load status"
          );
        }
      }
    },
    [isDirty, mapConfigToForm, resetAlerts]
  );

  const fetchLogs = useCallback(async () => {
    try {
      const response = await fetch("/api/logs", { cache: "no-store" });
      const data = await response.json();
      if (data.ok) setLogs(data.logs as LogEntry[]);
    } catch (error) {
      console.warn("Failed to load logs", error);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    void fetchLogs();

    const statusInterval = setInterval(() => {
      void fetchStatus(true);
    }, 5000);

    const logsInterval = setInterval(() => {
      void fetchLogs();
    }, 20000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(logsInterval);
    };
  }, [fetchLogs, fetchStatus]);

  useEffect(() => {
    setRecipientCount(countRecipients(form.recipientsRaw));
  }, [form.recipientsRaw]);

  const handleInputChange = useCallback(
    (field: keyof FormState, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setIsDirty(true);
    },
    []
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    resetAlerts();

    const payload = {
      recipientsRaw: form.recipientsRaw,
      message: form.message,
      minDelaySec: parseNumber(form.minDelaySec),
      maxDelaySec: parseNumber(form.maxDelaySec),
      intervalMinutes: parseNumber(form.intervalMinutes),
    };

    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!data.ok)
        throw new Error(data.error ?? "Failed to save configuration");
      setForm(mapConfigToForm(data.config as ConfigResponse));
      setIsDirty(false);
      setStatusMessage("Configuration saved");
      setRecipientCount(countRecipients(data.config.recipientsRaw ?? ""));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save configuration"
      );
    } finally {
      setIsSaving(false);
    }
  }, [form, mapConfigToForm, resetAlerts]);

  const handleLogin = useCallback(async () => {
    setIsLoggingIn(true);
    resetAlerts();
    try {
      const response = await fetch("/api/session/login", { method: "POST" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error ?? "Login failed");
      if (data.status === "qr") {
        setQrDataUrl(data.qr as string);
        setStatusMessage("Scan the QR code with your WhatsApp device");
      } else {
        setQrDataUrl(null);
        setStatusMessage("WhatsApp connected");
      }
      await fetchStatus(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsLoggingIn(false);
    }
  }, [fetchStatus, resetAlerts]);

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    resetAlerts();
    try {
      const response = await fetch("/api/session/logout", { method: "POST" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error ?? "Logout failed");
      setQrDataUrl(null);
      setStatusMessage("Session cleared");
      await fetchStatus(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Logout failed");
    } finally {
      setIsLoggingOut(false);
    }
  }, [fetchStatus, resetAlerts]);

  const handleSend = useCallback(async () => {
    resetAlerts();
    if (!connected) {
      setErrorMessage("Connect to WhatsApp first");
      return;
    }

    setIsSending(true);
    try {
      if (timerActive) {
        const response = await fetch("/api/broadcast/stop", { method: "POST" });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error ?? "Failed to stop schedule");
        setStatusMessage("Auto broadcast stopped");
      } else {
        const schedule = parseNumber(form.intervalMinutes) > 0;
        const response = await fetch("/api/broadcast/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sendNow: true, schedule }),
        });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error ?? "Broadcast failed");
        setStatusMessage(
          schedule ? "Broadcast sent and timer started" : "Broadcast sent"
        );
      }

      await fetchStatus(true);
      await fetchLogs();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Broadcast failed"
      );
    } finally {
      setIsSending(false);
    }
  }, [
    connected,
    fetchLogs,
    fetchStatus,
    form.intervalMinutes,
    resetAlerts,
    timerActive,
  ]);

  const nextRunLabel = useMemo(() => {
    if (!nextRun) return "";
    return formatLocalDateTime(nextRun);
  }, [nextRun]);

  const disableSend =
    !connected ||
    (!timerActive && !form.message.trim()) ||
    (!timerActive && recipientCount === 0);

  return (
    <main style={styles.container}>
      <div style={styles.titleRow}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px" }}>
            WhatsApp Broadcast Console
          </h1>
          <p style={{ margin: "6px 0 0", color: "#444" }}>
            Configure recipients, compose the message, and send or schedule.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span
            style={styles.badge(
              connected ? "#065f46" : "#374151",
              connected ? "#d1fae5" : "#e5e7eb"
            )}
          >
            {connected
              ? "Connected"
              : hasAuth
              ? "Awaiting connection"
              : "Not connected"}
          </span>
          {timerActive && (
            <span style={styles.badge("#1e3a8a", "#dbeafe")}>
              Auto broadcast
            </span>
          )}
        </div>
      </div>

      {(statusMessage || errorMessage) && (
        <div
          style={{
            ...styles.card,
            borderColor: errorMessage ? "#fecaca" : "#bbf7d0",
            background: errorMessage ? "#fef2f2" : "#ecfdf3",
            color: errorMessage ? "#991b1b" : "#166534",
          }}
        >
          {errorMessage ?? statusMessage}
        </div>
      )}

      <section style={styles.card}>
        <div style={{ ...styles.titleRow, marginBottom: "12px" }}>
          <h2 style={{ margin: 0, fontSize: "18px" }}>Session</h2>
          <div style={{ fontSize: "14px", color: "#444" }}>
            Next run: {nextRunLabel || "-"}
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            style={styles.button("primary")}
            onClick={handleLogin}
            disabled={isLoggingIn || connected}
          >
            {connected
              ? "Connected"
              : isLoggingIn
              ? "Requesting QR…"
              : "Login with WhatsApp"}
          </button>
          <button
            style={styles.button("secondary")}
            onClick={handleLogout}
            disabled={isLoggingOut || (!connected && !hasAuth)}
          >
            {isLoggingOut ? "Logging out…" : "Logout"}
          </button>
          <button
            style={styles.button("primary")}
            onClick={handleSend}
            disabled={isSending || disableSend}
          >
            {isSending
              ? "Working…"
              : timerActive
              ? "Stop Auto Broadcast"
              : "Send / Start Auto"}
          </button>
        </div>

        {!connected && qrDataUrl && (
          <div style={{ marginTop: "12px" }}>
            <p style={{ fontSize: "14px", margin: "0 0 8px", color: "#444" }}>
              Scan this QR code to login:
            </p>
            <img
              src={qrDataUrl}
              alt="WhatsApp QR Code"
              width={200}
              height={200}
              style={{ border: "1px solid #ddd", borderRadius: "6px" }}
            />
          </div>
        )}
      </section>

      <section style={styles.card}>
        <div style={{ ...styles.titleRow, marginBottom: "12px" }}>
          <h2 style={{ margin: 0, fontSize: "18px" }}>Broadcast Settings</h2>
          <div style={{ fontSize: "14px", color: "#444" }}>
            Recipients: {recipientCount}
          </div>
        </div>

        <label style={styles.label}>
          <span>Recipients (one per line or separated by semicolons)</span>
          <textarea
            style={styles.textarea}
            value={form.recipientsRaw}
            onChange={(e) => handleInputChange("recipientsRaw", e.target.value)}
            placeholder="62812xxxxx; 0812xxxxx"
          />
        </label>

        <label style={{ ...styles.label, marginTop: "12px" }}>
          <span>Message</span>
          <textarea
            style={styles.textarea}
            value={form.message}
            onChange={(e) => handleInputChange("message", e.target.value)}
            placeholder="Your message..."
          />
        </label>

        <div style={{ ...styles.labelRow, marginTop: "12px" }}>
          <label style={styles.label}>
            <span>Min delay (sec)</span>
            <input
              type="number"
              style={styles.input}
              value={form.minDelaySec}
              onChange={(e) => handleInputChange("minDelaySec", e.target.value)}
              min={0}
            />
          </label>
          <label style={styles.label}>
            <span>Max delay (sec)</span>
            <input
              type="number"
              style={styles.input}
              value={form.maxDelaySec}
              onChange={(e) => handleInputChange("maxDelaySec", e.target.value)}
              min={0}
            />
          </label>
          <label style={styles.label}>
            <span>Interval (minutes)</span>
            <input
              type="number"
              style={styles.input}
              value={form.intervalMinutes}
              onChange={(e) =>
                handleInputChange("intervalMinutes", e.target.value)
              }
              min={0}
            />
          </label>
        </div>

        <div style={{ ...styles.footerRow, marginTop: "12px" }}>
          <button
            style={styles.button("primary")}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save Settings"}
          </button>
          {isDirty && (
            <span style={{ color: "#92400e", fontSize: "14px" }}>
              You have unsaved changes
            </span>
          )}
        </div>
      </section>

      <section style={styles.card}>
        <div style={{ ...styles.titleRow, marginBottom: "12px" }}>
          <h2 style={{ margin: 0, fontSize: "18px" }}>Recent Activity</h2>
          <div style={{ fontSize: "14px", color: "#444" }}>Latest logs</div>
        </div>

        {!logs.length && (
          <div style={{ fontSize: "14px", color: "#555" }}>No logs yet.</div>
        )}

        {logs.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.thtd, background: "#f3f4f6" }}>
                    Time
                  </th>
                  <th style={{ ...styles.thtd, background: "#f3f4f6" }}>
                    Recipients
                  </th>
                  <th style={{ ...styles.thtd, background: "#f3f4f6" }}>
                    Success
                  </th>
                  <th style={{ ...styles.thtd, background: "#f3f4f6" }}>
                    Failed
                  </th>
                  <th style={{ ...styles.thtd, background: "#f3f4f6" }}>
                    Message
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={styles.thtd}>
                      {formatLocalDateTime(log.timestamp)}
                    </td>
                    <td style={styles.thtd}>{log.recipients.length}</td>
                    <td style={{ ...styles.thtd, color: "#065f46" }}>
                      {log.success}
                    </td>
                    <td style={{ ...styles.thtd, color: "#b91c1c" }}>
                      {log.failed}
                    </td>
                    <td style={styles.thtd}>{log.messagePreview || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
