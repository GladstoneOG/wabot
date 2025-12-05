import { NextResponse } from "next/server";
import { getWhatsAppManager } from "@/lib/whatsappManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatError(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: "Unexpected error", stack: String(error) };
}

export async function POST() {
  const manager = getWhatsAppManager();

  try {
    const result = await manager.requestLogin();
    if (result.status === "qr") {
      return NextResponse.json({
        ok: true,
        status: "qr",
        qr: result.qrDataUrl,
      });
    }
    return NextResponse.json({ ok: true, status: "connected" });
  } catch (error) {
    console.error("/api/session/login failed", error);
    const formatted = formatError(error);
    return NextResponse.json({ ok: false, error: formatted }, { status: 500 });
  }
}
