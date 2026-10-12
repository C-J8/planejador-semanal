import "server-only";
import path from "node:path";
import { lstat, readFile, readdir } from "node:fs/promises";
import {
  safeTimestamp,
  type GymState,
  type BackupState,
} from "../lib/status-values";

export async function readSmallJson(
  file: string,
): Promise<Record<string, unknown> | null> {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.size > 131072) return null;
    const result: unknown = JSON.parse(await readFile(file, "utf8"));
    return typeof result === "object" &&
      result !== null &&
      !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function getGymStatus(
  root: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<GymState> {
  const configured = Boolean(env.GYM_TRACKER_PATH?.trim());
  const result: GymState = {
    configured,
    dashboard: "unknown",
    running: null,
    phase: null,
    checkedAt: null,
    lastImportAt: null,
    database: "unavailable",
    pendingReviews: null,
    lastBackupAt: null,
  };
  if (!configured) return result;
  const directory = path.resolve(root, env.GYM_TRACKER_PATH!);
  const stored = await readSmallJson(
    path.join(directory, ".gym-tracker/status.json"),
  );
  result.checkedAt = safeTimestamp(stored?.checked_at);
  result.lastImportAt = safeTimestamp(stored?.last_import_at);
  const state = await readSmallJson(
    path.join(directory, ".gym-tracker/desktop.json"),
  );
  if (
    !state ||
    !Number.isInteger(state.control_port) ||
    Number(state.control_port) < 1 ||
    Number(state.control_port) > 65535 ||
    typeof state.token !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      state.token,
    )
  )
    return result;
  try {
    const request = (action: string) =>
      fetcher(`http://127.0.0.1:${state.control_port}/${action}`, {
        headers: { Authorization: `Bearer ${state.token}` },
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });
    let response = await request("overview");
    // An older supervisor may still be running while its code has been updated.
    if (response.status === 404) response = await request("status");
    if (!response.ok) return result;
    const live = await response.json();
    if (
      !live ||
      live.token !== state.token ||
      typeof live.root !== "string" ||
      path.resolve(live.root) !== directory
    )
      return result;
    result.dashboard =
      live.phase === "ready" || live.phase === "degraded"
        ? "ready"
        : live.phase === "starting"
          ? "starting"
          : live.phase === "stopping"
            ? "stopping"
            : "unknown";
    const importer = live.importer;
    if (importer && typeof importer === "object") {
      result.running =
        typeof importer.running === "boolean" ? importer.running : null;
      result.phase = typeof importer.phase === "string" ? importer.phase : null;
      result.checkedAt = safeTimestamp(importer.checked_at) ?? result.checkedAt;
      result.lastImportAt =
        safeTimestamp(importer.last_import_at) ?? result.lastImportAt;
    }
    result.database =
      live.database === "connected"
        ? "connected"
        : live.database === "user_required"
          ? "user_required"
          : "unavailable";
    result.pendingReviews =
      result.database === "connected" &&
      Number.isSafeInteger(live.pending_reviews) &&
      live.pending_reviews >= 0
        ? live.pending_reviews
        : null;
    result.lastBackupAt = safeTimestamp(live.last_backup_at);
  } catch {
    /* Live status is unknown, even if a stale file says it was running. */
  }
  return result;
}

export async function getBackupStatus(
  root: string,
  requireGym: boolean,
): Promise<BackupState> {
  const empty = { createdAt: null, gymIncluded: false };
  const directory = path.join(root, "backups");
  try {
    const files = (await readdir(directory)).filter((name) =>
      /^planner-[\w.-]+\.dump\.json$/.test(name),
    );
    let latest: BackupState = empty;
    for (const file of files) {
      const manifest = await readSmallJson(path.join(directory, file));
      const at = safeTimestamp(manifest?.createdAt);
      if (
        !at ||
        typeof manifest?.planner !== "string" ||
        !/^planner-[\w.-]+\.dump$/.test(manifest.planner)
      )
        continue;
      const gymIncluded =
        typeof manifest.gym === "string" &&
        /^gym-[\w.-]+\.dump$/.test(manifest.gym);
      if (requireGym && !gymIncluded) continue;
      const names = [
        manifest.planner,
        ...(gymIncluded ? [manifest.gym as string] : []),
      ];
      const complete = await Promise.all(
        names.map(async (name) => {
          try {
            const stat = await lstat(path.join(directory, name));
            return stat.isFile() && stat.size > 0;
          } catch {
            return false;
          }
        }),
      );
      if (
        complete.every(Boolean) &&
        (!latest.createdAt || at > latest.createdAt)
      )
        latest = { createdAt: at, gymIncluded };
    }
    return latest;
  } catch {
    return empty;
  }
}
