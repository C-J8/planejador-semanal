import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForChessSync } from "./sync-request";

afterEach(() => vi.useRealTimers());
describe("Chess sync response lifecycle", () => {
  it("returns a successful response and releases the timer", async () => {
    vi.useFakeTimers();
    await expect(
      waitForChessSync(Promise.resolve({ ok: true })),
    ).resolves.toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("propagates a rejected request and releases the timer", async () => {
    vi.useFakeTimers();
    await expect(
      waitForChessSync(Promise.reject(new Error("offline"))),
    ).rejects.toThrow("offline");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("ends waiting even if the response never arrives", async () => {
    vi.useFakeTimers();
    const request = waitForChessSync(new Promise(() => {}), 100);
    const rejected = expect(request).rejects.toMatchObject({
      name: "ChessSyncTimeoutError",
    });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});
