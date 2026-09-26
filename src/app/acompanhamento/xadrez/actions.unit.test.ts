import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/modules/chess/services/chess-progress", () => ({
  syncChessProgress: vi.fn(),
}));
import { syncChessProgress } from "@/modules/chess/services/chess-progress";
import { ChessComApiError } from "@/modules/chess/integrations/chess-com";
import { syncChessAction } from "./actions";
beforeEach(() => vi.resetAllMocks());
const data = () => {
  const form = new FormData();
  form.set("username", "ceiios");
  return form;
};
describe("Chess sync action feedback", () => {
  it("returns completion without coupling it to a route revalidation", async () => {
    vi.mocked(syncChessProgress).mockResolvedValue(149);
    expect(await syncChessAction({}, data())).toMatchObject({
      ok: true,
      message: expect.stringContaining("149 partidas"),
    });
    expect(syncChessProgress).toHaveBeenCalledWith("ceiios");
  });
  it("returns provider and cooldown errors to the form", async () => {
    vi.mocked(syncChessProgress).mockRejectedValue(
      new ChessComApiError("Aguarde cinco minutos"),
    );
    expect(await syncChessAction({}, data())).toEqual({
      ok: false,
      message: "Aguarde cinco minutos",
    });
  });
  it("returns a safe message when storage fails", async () => {
    vi.mocked(syncChessProgress).mockRejectedValue(new Error("private detail"));
    const result = await syncChessAction({}, data());
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain("private detail");
  });
});
