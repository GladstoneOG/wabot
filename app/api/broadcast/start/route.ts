import { NextResponse } from "next/server";
import { getWhatsAppManager } from "@/lib/whatsappManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

export async function POST(request: Request) {
  const manager = getWhatsAppManager();

  let body: { sendNow?: boolean; schedule?: boolean } = {};
  try {
    if (request.body) {
      const parsed = await request.json();
      if (parsed && typeof parsed === "object") {
        body = {
          sendNow:
            typeof parsed.sendNow === "boolean" ? parsed.sendNow : undefined,
          schedule:
            typeof parsed.schedule === "boolean" ? parsed.schedule : undefined,
        };
      }
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: toMessage(error) },
      { status: 400 }
    );
  }

  const sendNow = body.sendNow !== false;
  const schedule = body.schedule === true;

  try {
    if (sendNow) {
      await manager.sendNow();
    }
    if (schedule) {
      manager.startSchedule();
    } else {
      manager.stopSchedule();
    }
    const status = manager.getStatus();
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: toMessage(error) },
      { status: 500 }
    );
  }
}
