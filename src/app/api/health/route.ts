import { NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ok",
      database: "connected",
      timezone: process.env.APP_TIMEZONE ?? "America/Sao_Paulo",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        database: "unavailable",
        message: "Banco de dados indisponível",
      },
      { status: 503 },
    );
  }
}
