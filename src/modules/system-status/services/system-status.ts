import "server-only";
import { Client } from "pg";
import {
  buildStatusSnapshot,
  safeTimestamp,
  type PlannerState,
} from "../lib/status-values";
import { getBackupStatus, getGymStatus } from "./local-status";

export async function getPlannerStatus(): Promise<PlannerState> {
  const result: PlannerState = {
    database: false,
    chessAvailable: false,
    chess: null,
  };
  let client: Client | undefined;
  try {
    client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 2000,
      query_timeout: 3000,
      options: "-c default_transaction_read_only=on -c statement_timeout=2500",
    });
    await client.connect();
    await client.query("SELECT 1");
    result.database = true;
    const rows = await client.query<{
      lastSyncedAt: Date | null;
      lastSyncStatus: string;
    }>(
      'SELECT last_synced_at AS "lastSyncedAt", last_sync_status AS "lastSyncStatus" FROM progress_sources WHERE provider = $1 LIMIT 1',
      ["CHESS_COM"],
    );
    result.chessAvailable = true;
    const source = rows.rows[0];
    if (source)
      result.chess = {
        lastSyncedAt: safeTimestamp(source.lastSyncedAt?.toISOString()),
        lastSyncStatus: source.lastSyncStatus,
      };
  } catch {
    /* Fixed UI messages only; never send database or exception details. */
  } finally {
    await client?.end().catch(() => {});
  }
  return result;
}

export async function getSystemStatus() {
  const root = process.cwd();
  const [planner, gym, backup] = await Promise.all([
    getPlannerStatus(),
    getGymStatus(root),
    getBackupStatus(root, Boolean(process.env.GYM_TRACKER_PATH?.trim())),
  ]);
  return buildStatusSnapshot(planner, gym, backup);
}
