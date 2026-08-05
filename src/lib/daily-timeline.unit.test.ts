import { describe, expect, it } from "vitest";
import {
  durationToClock,
  timelinePosition,
  TIMELINE_HOUR_HEIGHT,
} from "./daily-timeline";

describe("daily timeline", () => {
  it("posiciona um item de acordo com a hora", () => {
    expect(timelinePosition("09:30", 60)).toEqual({
      top: 9.5 * TIMELINE_HOUR_HEIGHT,
      height: TIMELINE_HOUR_HEIGHT,
    });
  });
  it("limita a duração ao fim do dia", () => {
    expect(timelinePosition("23:30", 120).height).toBe(38);
  });
  it("formata duração como relógio", () => {
    expect(durationToClock(120)).toBe("02:00");
    expect(durationToClock(30)).toBe("00:30");
  });
});
