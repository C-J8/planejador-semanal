import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const port = Number(process.env.GYM_TRACKER_PORT || 8501);
  if (
    !process.env.GYM_TRACKER_PATH?.trim() ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  ) {
    return new Response(
      "Academia não configurada. Confira as instruções em docs/uso-local.md.",
      {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }
  return NextResponse.redirect(`http://127.0.0.1:${port}`, {
    status: 307,
    headers: { "Cache-Control": "no-store" },
  });
}
