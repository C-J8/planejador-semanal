import { describe, expect, it } from "vitest";
import {
  calculateWeekSummary,
  formatPlannerDay,
  getDefaultSelectedDay,
} from "./planner-presentation";

describe("planner presentation", () => {
  it("seleciona hoje quando ele pertence à semana", () => {
    expect(
      getDefaultSelectedDay(["2026-08-03", "2026-08-04"], "2026-08-04"),
    ).toBe("2026-08-04");
  });
  it("seleciona o primeiro dia quando hoje está fora da semana", () => {
    expect(
      getDefaultSelectedDay(["2026-08-03", "2026-08-04"], "2026-08-10"),
    ).toBe("2026-08-03");
  });
  it("resume as ocorrências", () => {
    const values = ["PLANNED", "COMPLETED", "COMPLETED", "SKIPPED"].map(
      (status, index) => ({ id: String(index), status }),
    ) as never;
    expect(calculateWeekSummary(values)).toEqual({
      total: 4,
      planned: 1,
      completed: 2,
      skipped: 1,
      percentage: 50,
      skippedPercentage: 25,
    });
  });
  it("formata as partes do dia em português", () => {
    expect(formatPlannerDay("2026-08-03")).toEqual({
      weekday: "seg",
      day: "03",
      month: "ago",
    });
  });
});
