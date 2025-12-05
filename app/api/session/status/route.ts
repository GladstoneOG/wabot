import { NextResponse } from "next/server";
import { getWhatsAppManager } from "@/lib/whatsappManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const manager = getWhatsAppManager();
  const status = manager.getStatus();

  const nextRunIso = status.nextRun
    ? new Date(status.nextRun).toISOString()
    : null;

  return NextResponse.json({
    ok: true,
    connected: status.connected,
    hasAuth: status.hasAuth,
    timerActive: status.timerActive,
    nextRun: nextRunIso,
    config: status.config,
    recipientCount: status.config.recipients.length,
  });
}
