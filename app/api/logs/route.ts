import { NextResponse } from "next/server";
import { getWhatsAppManager } from "@/lib/whatsappManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const manager = getWhatsAppManager();
  const logs = await manager.getLogs();
  return NextResponse.json({ ok: true, logs });
}
