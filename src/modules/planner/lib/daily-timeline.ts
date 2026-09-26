export const TIMELINE_HOUR_HEIGHT = 72;

export function timelinePosition(
  startTime: string,
  durationMinutes: number | null,
) {
  const [hours, minutes] = startTime.split(":").map(Number);
  const start = hours * 60 + minutes;
  const duration = durationMinutes ?? 60;
  const available = Math.max(1, 1440 - start);
  return {
    top: (start / 60) * TIMELINE_HOUR_HEIGHT,
    height: Math.max(
      38,
      (Math.min(duration, available) / 60) * TIMELINE_HOUR_HEIGHT,
    ),
  };
}

export function durationToClock(minutes: number | null) {
  if (minutes === null) return "Sem duração";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
