import { NextResponse } from "next/server";
import { getWhatsAppManager } from "@/lib/whatsappManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

export async function POST() {
  const manager = getWhatsAppManager();
  try {
    await manager.logout();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: toMessage(error) },
      { status: 500 }
    );
  }
}
