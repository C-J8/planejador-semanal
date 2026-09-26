import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fetchChessComProgress } from "@/modules/chess/integrations/chess-com";

const now = new Date("2026-09-15T12:00:00Z");
const game = (id: number, extra = {}) => ({
  url: `https://www.chess.com/game/live/${id}`,
  end_time: 1789000000 + id,
  rated: true,
  rules: "chess",
  time_class: "rapid",
  white: { username: "CELLOS", rating: 1200 + id, result: "win" },
  black: { username: "opponent", rating: 1300, result: "resigned" },
  ...extra,
});
function api(monthGames: unknown[] = [game(1)], archives = ["2026/09"]) {
  return vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input);
    const data = url.endsWith("/stats")
      ? { chess_rapid: { last: { rating: 1201, date: 1789000001 } } }
      : url.endsWith("/archives")
        ? {
            archives: archives.map(
              (m) => `https://api.chess.com/pub/player/cellos/games/${m}`,
            ),
          }
        : url.includes("/games/")
          ? { games: monthGames }
          : { username: "cellos", player_id: 42 };
    return new Response(JSON.stringify(data));
  });
}
describe("Chess.com adapter", () => {
  it("filters unrated games/variants, selects own side and deduplicates games", async () => {
    const fetchImpl = api([
      game(2),
      game(1),
      game(1),
      game(3, { rated: false }),
      game(4, { rules: "chess960" }),
      game(5, {
        time_class: "blitz",
        white: { username: "other", rating: 900, result: "win" },
        black: { username: "cellos", rating: 800, result: "resigned" },
      }),
    ]);
    const result = await fetchChessComProgress("CeLLoS", { fetchImpl, now });
    expect(result.observations.map((p) => [p.timeClass, p.value])).toEqual([
      ["rapid", 1201],
      ["rapid", 1202],
      ["blitz", 800],
    ]);
    expect(result.playerId).toBe(42);
    expect(result.stats.rapid?.last?.rating).toBe(1201);
  });
  it("restricts imports to twelve calendar months and serializes requests", async () => {
    let active = 0;
    let maximum = 0;
    const responder = api(
      [],
      ["2025/09", "2025/10", "2026/01", "2026/09", "2026/10"],
    );
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async (...args) => {
        active++;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        const result = await responder(...args);
        active--;
        return result;
      });
    const result = await fetchChessComProgress("cellos", { fetchImpl, now });
    expect(result.months).toEqual(["2025/10", "2026/01", "2026/09"]);
    expect(maximum).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });
  it("rejects malformed usernames before network access", async () => {
    const fetchImpl = api();
    await expect(
      fetchChessComProgress("../../secrets", { fetchImpl }),
    ).rejects.toThrow("usuário válido");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("never follows arbitrary archive URLs or redirects", async () => {
    const fetchImpl = api();
    fetchImpl
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ username: "cellos", player_id: 42 })),
      )
      .mockImplementationOnce(async () => new Response("{}"))
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({ archives: ["http://localhost/secrets"] }),
          ),
      );
    await expect(
      fetchChessComProgress("cellos", { fetchImpl, now }),
    ).rejects.toThrow("Lista de arquivos inválida");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      redirect: "error",
      cache: "no-store",
    });
  });
  it.each([
    [404, "não encontrado"],
    [429, "limitou"],
    [503, "indisponível"],
  ])("reports status %s", async (status, message) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status }));
    await expect(
      fetchChessComProgress("cellos", { fetchImpl, now }),
    ).rejects.toThrow(message);
  });
  it("fails atomically on malformed eligible games instead of silently truncating history", async () => {
    await expect(
      fetchChessComProgress("cellos", {
        fetchImpl: api([
          game(1),
          game(2, { white: { username: "cellos", rating: "oops" } }),
        ]),
        now,
      }),
    ).rejects.toThrow("Partida inválida");
  });
  it("handles an account with no rated games", async () => {
    const result = await fetchChessComProgress("cellos", {
      fetchImpl: api([], []),
      now,
    });
    expect(result.observations).toEqual([]);
  });
  it("reports network failures without disclosing upstream details", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private connection detail"));
    await expect(
      fetchChessComProgress("cellos", { fetchImpl, now }),
    ).rejects.toThrow("Verifique a conexão");
  });
});
