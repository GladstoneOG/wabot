import { NextResponse } from "next/server";
import { getWhatsAppManager } from "@/lib/whatsappManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const manager = getWhatsAppManager();
  manager.stopSchedule();
  const status = manager.getStatus();
  return NextResponse.json({ ok: true, status });
}
