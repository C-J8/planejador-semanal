import { afterEach, describe, expect, it, vi } from "vitest";
import { startOptionalGym, stopServices } from "./lifecycle.mjs";

afterEach(() => vi.restoreAllMocks());

describe("independent service lifecycle", () => {
  it("stops Planner even when Academia shutdown fails", async () => {
    const planner = vi.fn().mockResolvedValue(undefined);
    const gym = vi.fn().mockRejectedValue(new Error("Gym shutdown failed"));
    await expect(stopServices(planner, gym)).rejects.toThrow(
      "Gym shutdown failed",
    );
    expect(planner).toHaveBeenCalledOnce();
    expect(gym).toHaveBeenCalledOnce();
  });
  it("stops Academia even when Planner shutdown fails", async () => {
    const gym = vi.fn().mockResolvedValue(undefined);
    await expect(
      stopServices(vi.fn().mockRejectedValue(new Error("Planner failed")), gym),
    ).rejects.toThrow("Planner failed");
    expect(gym).toHaveBeenCalledOnce();
  });
  it("waits for both and reports both errors", async () => {
    await expect(
      stopServices(
        vi.fn().mockRejectedValue(new Error("Planner failed")),
        vi.fn().mockRejectedValue(new Error("Gym failed")),
      ),
    ).rejects.toThrow("Planner failed\nGym failed");
  });
  it("returns failure to the CLI while keeping Planner available", async () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await startOptionalGym(async () => {
        throw new Error("Not configured");
      }),
    ).toBe(false);
    expect(report).toHaveBeenCalledWith("Academia: Not configured");
  });
  it("accepts an optional or successfully started Gym", async () => {
    expect(await startOptionalGym(async () => {})).toBe(true);
  });
});
