import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { prisma } from "@/shared/lib/prisma";
import { getPlannerStatus } from "./system-status";

afterEach(async () => {
  await prisma.progressSource.deleteMany({ where: { provider: "CHESS_COM" } });
});

describe("saved Chess operational status on PostgreSQL", () => {
  it("reads mapped table/columns and preserves the exact UTC timestamp", async () => {
    const at = new Date("2026-01-01T12:34:56.123Z");
    await prisma.progressSource.upsert({
      where: { provider: "CHESS_COM" },
      create: {
        provider: "CHESS_COM",
        externalAccountId: "status-fixture",
        lastSyncedAt: at,
        lastSyncStatus: "SUCCESS",
      },
      update: { lastSyncedAt: at, lastSyncStatus: "SUCCESS" },
    });
    expect(await getPlannerStatus()).toEqual({
      database: true,
      chessAvailable: true,
      chess: { lastSyncedAt: at.toISOString(), lastSyncStatus: "SUCCESS" },
    });
  });
  it("reports an empty connection as not configured rather than a database failure", async () => {
    await prisma.progressSource.deleteMany({
      where: { provider: "CHESS_COM" },
    });
    expect(await getPlannerStatus()).toEqual({
      database: true,
      chessAvailable: true,
      chess: null,
    });
  });
});
