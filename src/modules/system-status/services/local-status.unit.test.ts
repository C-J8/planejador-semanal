import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getBackupStatus, getGymStatus, readSmallJson } from "./local-status";

let root: string;
const token = "12345678-abcd-abcd-abcd-123456789abc";
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "planner-status-test-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function json(relative: string, value: unknown) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value));
}
async function runtime() {
  await json("gym/.gym-tracker/desktop.json", { control_port: 54321, token });
  await json("gym/.gym-tracker/status.json", {
    checked_at: "2026-10-01T10:00:00Z",
    last_import_at: "2026-10-01T09:00:00Z",
    phase: "imported",
    running: true,
    source: "SECRET",
    pid: 42,
  });
}

describe("local status privacy and stale-state handling", () => {
  it("does not access any service when Gym is not configured", async () => {
    const fetcher = vi.fn();
    expect((await getGymStatus(root, {}, fetcher)).configured).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not trust a stale status file or PID", async () => {
    await runtime();
    const result = await getGymStatus(
      root,
      { GYM_TRACKER_PATH: "gym" },
      vi.fn().mockRejectedValue(new Error("SECRET")),
    );
    expect(result.running).toBeNull();
    expect(result.lastImportAt).toBe("2026-10-01T09:00:00.000Z");
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
  it("accepts only an authenticated response for the configured project", async () => {
    await runtime();
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        token,
        root: path.join(root, "gym"),
        phase: "ready",
        importer: { running: false, phase: "stopped" },
        database: "connected",
        pending_reviews: 3,
        raw_content: "SECRET",
      }),
    );
    const result = await getGymStatus(
      root,
      { GYM_TRACKER_PATH: "gym" },
      fetcher,
    );
    expect(result.running).toBe(false);
    expect(result.pendingReviews).toBe(3);
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
      `Bearer ${token}`,
    );
    expect(JSON.stringify(result)).not.toMatch(/SECRET|12345678|control_port/);
  });
  it.each([
    { token: "wrong", root: "gym" },
    { token, root: "other" },
  ])("rejects identity mismatch %j", async (identity) => {
    await runtime();
    const result = await getGymStatus(
      root,
      { GYM_TRACKER_PATH: "gym" },
      vi.fn().mockResolvedValue(
        Response.json({
          ...identity,
          root: path.join(root, identity.root),
          importer: { running: true },
        }),
      ),
    );
    expect(result.running).toBeNull();
  });
  it("supports an old supervisor without inventing a current pending count", async () => {
    await runtime();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({
          token,
          root: path.join(root, "gym"),
          phase: "ready",
          importer: { running: true },
        }),
      );
    const result = await getGymStatus(
      root,
      { GYM_TRACKER_PATH: "gym" },
      fetcher,
    );
    expect(result.running).toBe(true);
    expect(result.pendingReviews).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects invalid ports before making a request", async () => {
    await json("gym/.gym-tracker/desktop.json", { control_port: 0, token });
    const fetcher = vi.fn();
    await getGymStatus(root, { GYM_TRACKER_PATH: "gym" }, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("ignores oversized and malformed JSON", async () => {
    await writeFile(path.join(root, "large.json"), " ".repeat(131073));
    await writeFile(path.join(root, "bad.json"), "{broken");
    expect(await readSmallJson(path.join(root, "large.json"))).toBeNull();
    expect(await readSmallJson(path.join(root, "bad.json"))).toBeNull();
  });
});

describe("complete backup manifests", () => {
  async function manifest(
    gym: string | null,
    createdAt = "2026-10-01T12:00:00Z",
  ) {
    await json("backups/planner-test.dump.json", {
      planner: "planner-test.dump",
      gym,
      createdAt,
    });
    await writeFile(path.join(root, "backups/planner-test.dump"), "archive");
  }
  it("requires both completed files when Gym is configured", async () => {
    await manifest("gym-test.dump");
    expect((await getBackupStatus(root, true)).createdAt).toBeNull();
    await writeFile(
      path.join(root, "backups/gym-test.dump.partial"),
      "partial",
    );
    expect((await getBackupStatus(root, true)).createdAt).toBeNull();
    await writeFile(path.join(root, "backups/gym-test.dump"), "archive");
    expect(await getBackupStatus(root, true)).toEqual({
      createdAt: "2026-10-01T12:00:00.000Z",
      gymIncluded: true,
    });
  });
  it("accepts Planner-only backups only when Gym is optional", async () => {
    await manifest(null);
    expect((await getBackupStatus(root, false)).createdAt).not.toBeNull();
    expect((await getBackupStatus(root, true)).createdAt).toBeNull();
  });
  it("blocks manifest path traversal and empty files", async () => {
    await manifest("../private.dump");
    expect((await getBackupStatus(root, true)).createdAt).toBeNull();
    await manifest("gym-test.dump");
    await writeFile(path.join(root, "backups/gym-test.dump"), "");
    expect((await getBackupStatus(root, true)).createdAt).toBeNull();
  });
});
