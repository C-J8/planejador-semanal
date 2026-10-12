import { NextResponse } from "next/server";
import { getSystemStatus } from "@/modules/system-status/services/system-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getSystemStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar o status." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
