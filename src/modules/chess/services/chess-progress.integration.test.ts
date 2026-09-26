import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ChessProgress } from "@/modules/chess/integrations/chess-com";
import * as chessApi from "@/modules/chess/integrations/chess-com";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/shared/lib/prisma", () => ({
  get prisma() {
    return state.db;
  },
}));
import {
  getChessDashboard,
  saveChessProgress,
  syncChessProgress,
} from "@/modules/chess/services/chess-progress";

const schema = `test_chess_${randomUUID().replaceAll("-", "")}`;
const admin = new Client({ connectionString: process.env.DATABASE_URL });
const now = new Date("2026-09-15T12:00:00Z");
const fixture: ChessProgress = {
  username: "test-player",
  playerId: 1001,
  months: ["2026/09"],
  stats: { rapid: { last: { rating: 1008, date: 1789000000 } } },
  observations: [
    {
      externalKey: "game-1",
      observedAt: "2026-09-01T12:00:00Z",
      value: 1000,
      timeClass: "rapid",
    },
    {
      externalKey: "game-2",
      observedAt: "2026-09-02T12:00:00Z",
      value: 1008,
      timeClass: "rapid",
    },
  ],
};

beforeAll(async () => {
  await admin.connect();
  // Every table and enum lives in a fresh, test-owned schema, never in personal data.
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`SET search_path TO "${schema}"`);
  const migrations = resolve("prisma/migrations");
  for (const dir of readdirSync(migrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    await admin.query(
      readFileSync(resolve(migrations, dir.name, "migration.sql"), "utf8"),
    );
  }
  state.db = new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: process.env.DATABASE_URL },
      { schema },
    ),
  });
}, 30000);

afterAll(async () => {
  await state.db?.$disconnect();
  if (!/^test_chess_[a-f0-9]{32}$/.test(schema))
    throw new Error("Unexpected test schema");
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
});

describe("progress persistence in an isolated PostgreSQL schema", () => {
  it("imports idempotently and keeps modalities separate", async () => {
    await saveChessProgress(fixture, now);
    await saveChessProgress(fixture, now);
    expect(await state.db.progressObservation.count()).toBe(2);
    expect(await state.db.progressMetric.count()).toBe(4);
    expect((await getChessDashboard())?.lastSyncStatus).toBe("SUCCESS");
  });
  it("reflects corrections and removed games while retaining older imported history", async () => {
    const rapid = await state.db.progressMetric.findFirstOrThrow({
      where: { key: "rapid" },
    });
    await state.db.progressObservation.create({
      data: {
        metricId: rapid.id,
        externalKey: "old-game",
        observedAt: new Date("2025-01-01"),
        value: 900,
      },
    });
    await saveChessProgress(
      {
        ...fixture,
        observations: [{ ...fixture.observations[0], value: 1010 }],
      },
      now,
    );
    const points = await state.db.progressObservation.findMany({
      orderBy: { observedAt: "asc" },
    });
    expect(points.map((p) => Number(p.value))).toEqual([900, 1010]);
  });
  it("rolls back the complete update when an observation violates the schema", async () => {
    const before = await state.db.progressObservation.findMany({
      orderBy: { externalKey: "asc" },
    });
    await expect(
      saveChessProgress(
        {
          ...fixture,
          observations: [
            { ...fixture.observations[0], externalKey: "x".repeat(301) },
          ],
        },
        now,
      ),
    ).rejects.toThrow();
    expect(
      await state.db.progressObservation.findMany({
        orderBy: { externalKey: "asc" },
      }),
    ).toEqual(before);
  });
  it("prevents mixing accounts but supports a renamed account with the same player ID", async () => {
    await expect(
      saveChessProgress({ ...fixture, playerId: 9999 }, now),
    ).rejects.toThrow("outra conta");
    await saveChessProgress({ ...fixture, username: "renamed-player" }, now);
    expect((await getChessDashboard())?.displayName).toBe("renamed-player");
  });
  it("ignores an older sync that completes after a newer one", async () => {
    await saveChessProgress(fixture, new Date(now.getTime() - 1000));
    expect((await getChessDashboard())?.displayName).toBe("renamed-player");
  });
  it("keeps all saved observations when an upstream refresh fails", async () => {
    const before = await state.db.progressObservation.findMany({
      orderBy: { externalKey: "asc" },
    });
    const remote = vi
      .spyOn(chessApi, "fetchChessComProgress")
      .mockRejectedValue(new chessApi.ChessComApiError("Falha temporária"));
    try {
      await expect(syncChessProgress("renamed-player")).rejects.toThrow(
        "Falha temporária",
      );
      expect(
        await state.db.progressObservation.findMany({
          orderBy: { externalKey: "asc" },
        }),
      ).toEqual(before);
      expect((await getChessDashboard())?.lastSyncStatus).toBe("ERROR");
    } finally {
      remote.mockRestore();
    }
  });
  it("enforces the refresh interval before making HTTP requests", async () => {
    await saveChessProgress(fixture, new Date());
    const remote = vi.spyOn(chessApi, "fetchChessComProgress");
    try {
      await expect(syncChessProgress(fixture.username)).rejects.toThrow(
        "cinco minutos",
      );
      expect(remote).not.toHaveBeenCalled();
    } finally {
      remote.mockRestore();
    }
  });
});
