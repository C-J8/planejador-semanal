import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildStatusSnapshot,
  safeTimestamp,
  statusSnapshotSchema,
  type GymState,
  type PlannerState,
} from "./status-values";

const planner: PlannerState = {
  database: true,
  chessAvailable: true,
  chess: {
    lastSyncedAt: "2026-10-10T12:00:00.000Z",
    lastSyncStatus: "SUCCESS",
  },
};
const gym: GymState = {
  configured: true,
  dashboard: "ready",
  running: true,
  phase: "unchanged",
  checkedAt: "2026-10-11T12:00:00.000Z",
  lastImportAt: "2026-10-10T12:00:00.000Z",
  database: "connected",
  pendingReviews: 0,
  lastBackupAt: "2026-10-10T12:00:00.000Z",
};
afterEach(() => vi.useRealTimers());

describe("operational status presentation", () => {
  it("renders six valid cards without exporting tokens or conversation fields", () => {
    const status = buildStatusSnapshot(planner, gym, {
      createdAt: new Date().toISOString(),
      gymIncluded: true,
    });
    expect(statusSnapshotSchema.safeParse(status).success).toBe(true);
    expect(status.cards).toHaveLength(6);
    expect(JSON.stringify(status)).not.toMatch(
      /DATABASE_URL|control_port|Bearer|raw_content|pid/,
    );
  });
  it("does not infer execution from an old import date", () => {
    const card = buildStatusSnapshot(
      planner,
      { ...gym, running: null, dashboard: "unknown" },
      { createdAt: null, gymIncluded: false },
    ).cards.find((c) => c.id === "importer")!;
    expect(card.label).toBe("Não foi possível confirmar");
    expect(card.level).toBe("warning");
    expect(card.facts[1].at).toBe(gym.lastImportAt);
  });
  it("reports a stopped worker even if its last cycle succeeded", () => {
    expect(
      buildStatusSnapshot(
        planner,
        { ...gym, running: false },
        { createdAt: null, gymIncluded: false },
      ).cards.find((c) => c.id === "importer")?.label,
    ).toBe("Parada");
  });
  it("preserves the previous successful Chess timestamp after a failed update", () => {
    const card = buildStatusSnapshot(
      { ...planner, chess: { ...planner.chess!, lastSyncStatus: "ERROR" } },
      gym,
      { createdAt: null, gymIncluded: false },
    ).cards.find((c) => c.id === "chess")!;
    expect(card.level).toBe("warning");
    expect(card.facts[0].at).toBe(planner.chess!.lastSyncedAt);
  });
  it("does not represent an unavailable pending count as zero", () => {
    const cards = buildStatusSnapshot(
      planner,
      { ...gym, database: "unavailable", pendingReviews: null },
      { createdAt: null, gymIncluded: false },
    ).cards;
    expect(cards.find((c) => c.id === "reviews")?.label).toBe(
      "Consulta indisponível",
    );
  });
  it("flags real pending reviews", () => {
    const card = buildStatusSnapshot(
      planner,
      { ...gym, pendingReviews: 4 },
      { createdAt: null, gymIncluded: false },
    ).cards.find((c) => c.id === "reviews")!;
    expect(card.label).toBe("4 pendências");
    expect(card.level).toBe("warning");
  });
  it("keeps unrelated service cards available when the Planner DB is down", () => {
    const cards = buildStatusSnapshot(
      { database: false, chessAvailable: false, chess: null },
      gym,
      { createdAt: null, gymIncluded: false },
    ).cards;
    expect(cards[0].level).toBe("error");
    expect(cards.find((c) => c.id === "gym")?.level).toBe("ok");
  });
  it("labels an unconfigured optional Gym neutrally", () => {
    const cards = buildStatusSnapshot(
      planner,
      { ...gym, configured: false },
      { createdAt: null, gymIncluded: false },
    ).cards;
    expect(cards.find((c) => c.id === "gym")?.label).toBe("Não configurada");
    expect(cards.find((c) => c.id === "reviews")?.level).toBe("neutral");
  });
  it("flags backups older than seven days without deleting them", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-10-11T12:00:00Z"));
    const card = buildStatusSnapshot(planner, gym, {
      createdAt: "2026-10-01T12:00:00Z",
      gymIncluded: true,
    }).cards.find((c) => c.id === "backups")!;
    expect(card.level).toBe("warning");
  });
  it.each([
    null,
    "",
    "invalid",
    "2026-99-99T12:00:00Z",
    "2999-01-01T00:00:00Z",
  ])("rejects malformed or future timestamps %s", (value) => {
    expect(safeTimestamp(value)).toBeNull();
  });
});
