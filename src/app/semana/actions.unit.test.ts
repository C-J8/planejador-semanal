import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  moveOccurrence: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/services/activity-occurrences", () => ({
  createOccurrenceAtEnd: vi.fn(),
  deleteOccurrence: vi.fn(),
  editOccurrence: vi.fn(),
  moveOccurrence: mocks.moveOccurrence,
}));
vi.mock("@/services/calendar-events", () => ({
  cancelCalendarEvent: vi.fn(),
  createCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
}));

import { moveOccurrenceAction } from "@/app/semana/actions";

describe("invalidação das ações da semana", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invalida todas as telas de ocorrências, inclusive /dia, após sucesso", async () => {
    const result = await moveOccurrenceAction({
      occurrenceId: "9bd50fd4-cce5-4d17-a54a-d319a62e11b7",
      targetDate: "2026-08-03",
      targetIndex: 0,
    });

    expect(result.ok).toBe(true);
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/semana",
      "/dia",
      "/mes",
      "/acompanhamento",
      "/repeticoes",
    ]);
  });

  it("não invalida nenhuma rota quando a mutação falha", async () => {
    mocks.moveOccurrence.mockRejectedValueOnce(new Error("falha"));
    const result = await moveOccurrenceAction({
      occurrenceId: "9bd50fd4-cce5-4d17-a54a-d319a62e11b7",
      targetDate: "2026-08-03",
      targetIndex: 0,
    });

    expect(result.ok).toBe(false);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
