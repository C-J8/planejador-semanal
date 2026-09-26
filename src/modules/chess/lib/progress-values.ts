export const DEFAULT_PROGRESS_RANGE = "90";

export const PROGRESS_RANGES = [
  { value: "30", label: "30 dias", days: 30 },
  { value: "90", label: "90 dias", days: 90 },
  { value: "365", label: "1 ano", days: 365 },
  { value: "all", label: "Todo o período", days: null },
] as const;

export type ProgressRange = (typeof PROGRESS_RANGES)[number]["value"];

export const CHESS_TIME_CLASS_VALUES = [
  "rapid",
  "blitz",
  "bullet",
  "daily",
] as const;

export type ChessTimeClass = (typeof CHESS_TIME_CLASS_VALUES)[number];

export const CHESS_TIME_CLASS_META = {
  rapid: { label: "Rápida", color: "#2563EB" },
  blitz: { label: "Blitz", color: "#F59E0B" },
  bullet: { label: "Bullet", color: "#EF4444" },
  daily: { label: "Diária", color: "#7C3AED" },
} as const satisfies Record<ChessTimeClass, { label: string; color: string }>;

export const CHESS_TIME_CLASSES = CHESS_TIME_CLASS_VALUES.map((value) => ({
  value,
  ...CHESS_TIME_CLASS_META[value],
}));

export type ProgressObservation = {
  capturedAt: Date | string;
  value: number;
};

export type ProgressStats = {
  count: number;
  start: number | null;
  current: number | null;
  change: number | null;
  best: number | null;
  min: number | null;
  max: number | null;
};

export type ProgressChartPoint = {
  capturedAt: string;
  value: number;
  x: number;
  y: number;
  dateLabel: string;
  valueLabel: string;
  ariaLabel: string;
};

export type ProgressChartOptions = {
  width?: number;
  height?: number;
  padding?: Partial<ProgressChartPadding>;
  locale?: string;
  timeZone?: string;
  seriesLabel?: string;
};

export type ProgressChartPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

const DEFAULT_TIME_ZONE = "America/Sao_Paulo";
const DEFAULT_CHART_PADDING: ProgressChartPadding = {
  top: 20,
  right: 20,
  bottom: 32,
  left: 48,
};

export function normalizeProgressRange(value: unknown): ProgressRange {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized =
    typeof candidate === "number"
      ? String(candidate)
      : typeof candidate === "string"
        ? candidate.trim().toLowerCase()
        : "";

  return PROGRESS_RANGES.some((range) => range.value === normalized)
    ? (normalized as ProgressRange)
    : DEFAULT_PROGRESS_RANGE;
}

export function groupLastProgressObservationPerDay<
  T extends ProgressObservation,
>(observations: readonly T[], timeZone = DEFAULT_TIME_ZONE): T[] {
  const byDay = new Map<string, { observation: T; timestamp: number }>();

  observations.forEach((observation) => {
    const timestamp = observationTimestamp(observation);
    if (timestamp === null) return;

    const day = dateInTimeZone(new Date(timestamp), timeZone);
    const current = byDay.get(day);
    if (current === undefined || timestamp >= current.timestamp)
      byDay.set(day, { observation, timestamp });
  });

  return [...byDay.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(({ observation }) => observation);
}

export function selectProgressObservations<T extends ProgressObservation>(
  observations: readonly T[],
  rangeValue: unknown,
  reference: Date | string = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): T[] {
  const range = normalizeProgressRange(rangeValue);
  const referenceTimestamp = parseTimestamp(reference);
  if (referenceTimestamp === null)
    throw new RangeError("Data de referência inválida");

  const referenceDay = dateInTimeZone(new Date(referenceTimestamp), timeZone);
  const days = PROGRESS_RANGES.find((item) => item.value === range)!.days;
  const firstDay = days === null ? null : addIsoDays(referenceDay, -(days - 1));

  const eligible = observations.filter((observation) => {
    const timestamp = observationTimestamp(observation);
    if (timestamp === null || timestamp > referenceTimestamp) return false;
    const day = dateInTimeZone(new Date(timestamp), timeZone);
    return firstDay === null || day >= firstDay;
  });
  return groupLastProgressObservationPerDay(eligible, timeZone);
}

export function calculateProgressStats(
  observations: readonly ProgressObservation[],
): ProgressStats {
  const valid = validProgressObservations(observations);
  if (valid.length === 0)
    return {
      count: 0,
      start: null,
      current: null,
      change: null,
      best: null,
      min: null,
      max: null,
    };

  const start = valid[0].observation.value;
  const current = valid.at(-1)!.observation.value;
  const values = valid.map(({ observation }) => observation.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    count: valid.length,
    start,
    current,
    change: current - start,
    best: max,
    min,
    max,
  };
}

export function buildProgressChart(
  observations: readonly ProgressObservation[],
  options: ProgressChartOptions = {},
) {
  const width = options.width ?? 720;
  const height = options.height ?? 240;
  const padding = { ...DEFAULT_CHART_PADDING, ...options.padding };
  const locale = options.locale ?? "pt-BR";
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const seriesLabel = options.seriesLabel?.trim() || "Pontuação";
  validateChartDimensions(width, height, padding);

  const valid = validProgressObservations(observations);
  const values = valid.map(({ observation }) => observation.value);
  const minValue = values.length === 0 ? null : Math.min(...values);
  const maxValue = values.length === 0 ? null : Math.max(...values);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const firstTimestamp = valid[0]?.timestamp ?? null;
  const lastTimestamp = valid.at(-1)?.timestamp ?? null;
  const timestampSpan =
    firstTimestamp === null || lastTimestamp === null
      ? 0
      : lastTimestamp - firstTimestamp;
  const valueSpan =
    minValue === null || maxValue === null ? 0 : maxValue - minValue;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const valueFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  });

  const points: ProgressChartPoint[] = valid.map(
    ({ observation, timestamp }, index) => {
      const x =
        valid.length === 1
          ? padding.left + plotWidth / 2
          : timestampSpan === 0
            ? padding.left + (index / (valid.length - 1)) * plotWidth
            : padding.left +
              ((timestamp - firstTimestamp!) / timestampSpan) * plotWidth;
      const y =
        valueSpan === 0
          ? padding.top + plotHeight / 2
          : padding.top +
            ((maxValue! - observation.value) / valueSpan) * plotHeight;
      const dateLabel = dateFormatter.format(new Date(timestamp));
      const valueLabel = valueFormatter.format(observation.value);
      return {
        capturedAt: new Date(timestamp).toISOString(),
        value: observation.value,
        x: roundSvgNumber(x),
        y: roundSvgNumber(y),
        dateLabel,
        valueLabel,
        ariaLabel: `${seriesLabel}: ${valueLabel} em ${dateLabel}`,
      };
    },
  );
  const pointsAttribute = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const pathData = points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  const stats = calculateProgressStats(
    valid.map(({ observation }) => observation),
  );
  const ariaLabel =
    stats.count === 0
      ? `Evolução de ${seriesLabel.toLocaleLowerCase(locale)}: sem dados.`
      : `Evolução de ${seriesLabel.toLocaleLowerCase(locale)}: ${stats.count} ${stats.count === 1 ? "ponto" : "pontos"}, de ${valueFormatter.format(stats.start!)} para ${valueFormatter.format(stats.current!)}.`;

  return {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    padding,
    plot: {
      x: padding.left,
      y: padding.top,
      width: plotWidth,
      height: plotHeight,
    },
    minValue,
    maxValue,
    points,
    pointsAttribute,
    pathData,
    ariaLabel,
  };
}

function validProgressObservations(
  observations: readonly ProgressObservation[],
) {
  return observations
    .flatMap((observation, inputIndex) => {
      const timestamp = observationTimestamp(observation);
      return timestamp === null ? [] : [{ observation, timestamp, inputIndex }];
    })
    .sort((a, b) => a.timestamp - b.timestamp || a.inputIndex - b.inputIndex);
}

function observationTimestamp(observation: ProgressObservation) {
  if (!Number.isFinite(observation.value)) return null;
  return parseTimestamp(observation.capturedAt);
}

function parseTimestamp(value: Date | string) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function dateInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const fields = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function addIsoDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function validateChartDimensions(
  width: number,
  height: number,
  padding: ProgressChartPadding,
) {
  const paddingValues = Object.values(padding);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    paddingValues.some((value) => !Number.isFinite(value) || value < 0) ||
    padding.left + padding.right >= width ||
    padding.top + padding.bottom >= height
  )
    throw new RangeError("Dimensões do gráfico inválidas");
}

function roundSvgNumber(value: number) {
  return Number(value.toFixed(2));
}
