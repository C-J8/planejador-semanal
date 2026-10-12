import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
}));
vi.mock("pg", () => ({
  Client: class {
    constructor(public options: object) {
      optionsRead.push(options);
    }
    connect = calls.connect;
    query = calls.query;
    end = calls.end;
  },
}));
const optionsRead: object[] = [];
import { getPlannerStatus } from "./system-status";
afterEach(() => {
  vi.resetAllMocks();
  optionsRead.length = 0;
});

describe("read-only Planner health", () => {
  it("uses bounded read-only queries and only reads saved Chess metadata", async () => {
    calls.connect.mockResolvedValue(undefined);
    calls.end.mockResolvedValue(undefined);
    calls.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [
        {
          lastSyncedAt: new Date("2026-10-01T12:00:00Z"),
          lastSyncStatus: "SUCCESS",
        },
      ],
    });
    expect((await getPlannerStatus()).database).toBe(true);
    expect(optionsRead[0]).toMatchObject({
      connectionTimeoutMillis: 2000,
      query_timeout: 3000,
      options: expect.stringContaining("default_transaction_read_only=on"),
    });
    expect(
      calls.query.mock.calls.every(([sql]) => sql.startsWith("SELECT")),
    ).toBe(true);
    expect(calls.end).toHaveBeenCalledOnce();
  });
  it("returns safe unavailability and closes the connection after errors", async () => {
    calls.connect.mockRejectedValue(new Error("SECRET DATABASE URL"));
    calls.end.mockResolvedValue(undefined);
    expect(await getPlannerStatus()).toEqual({
      database: false,
      chessAvailable: false,
      chess: null,
    });
    expect(calls.end).toHaveBeenCalledOnce();
  });
  it("distinguishes a missing Chess table from a down database", async () => {
    calls.connect.mockResolvedValue(undefined);
    calls.end.mockResolvedValue(undefined);
    calls.query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("schema missing"));
    expect(await getPlannerStatus()).toEqual({
      database: true,
      chessAvailable: false,
      chess: null,
    });
  });
});
