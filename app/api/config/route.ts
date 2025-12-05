import { NextResponse } from "next/server";
import { getWhatsAppManager } from "@/lib/whatsappManager";
import type { StoredConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBody(input: unknown): StoredConfig {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid payload");
  }

  const body = input as Partial<Record<keyof StoredConfig, unknown>>;

  return {
    recipientsRaw:
      typeof body.recipientsRaw === "string" ? body.recipientsRaw : "",
    message: typeof body.message === "string" ? body.message : "",
    minDelaySec: Number(body.minDelaySec ?? 0),
    maxDelaySec: Number(body.maxDelaySec ?? 0),
    intervalMinutes: Number(body.intervalMinutes ?? 0),
  };
}

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

export async function GET() {
  const manager = getWhatsAppManager();
  const status = manager.getStatus();
  return NextResponse.json({ ok: true, config: status.config });
}

export async function POST(request: Request) {
  const manager = getWhatsAppManager();
  let payload: StoredConfig;

  try {
    const data = await request.json();
    payload = parseBody(data);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: toMessage(error) },
      { status: 400 }
    );
  }

  try {
    await manager.updateConfig(payload);
    const status = manager.getStatus();
    return NextResponse.json({ ok: true, config: status.config });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: toMessage(error) },
      { status: 500 }
    );
  }
}
