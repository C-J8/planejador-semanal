import { describe, expect, it } from "vitest";
import {
  buildProgressChart,
  calculateProgressStats,
  CHESS_TIME_CLASSES,
  CHESS_TIME_CLASS_META,
  groupLastProgressObservationPerDay,
  normalizeProgressRange,
  selectProgressObservations,
  type ProgressObservation,
} from "@/modules/chess/lib/progress-values";

describe("modalidades do Chess.com", () => {
  it("define rótulos e cores para todas as modalidades acompanhadas", () => {
    expect(CHESS_TIME_CLASSES.map(({ value }) => value)).toEqual([
      "rapid",
      "blitz",
      "bullet",
      "daily",
    ]);
    expect(CHESS_TIME_CLASS_META.rapid.label).toBe("Rápida");
    expect(CHESS_TIME_CLASS_META.daily.label).toBe("Diária");
    expect(new Set(CHESS_TIME_CLASSES.map(({ color }) => color)).size).toBe(4);
    for (const modality of CHESS_TIME_CLASSES)
      expect(modality.color).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("intervalo da evolução", () => {
  it.each([
    ["30", "30"],
    [90, "90"],
    [" 365 ", "365"],
    ["ALL", "all"],
    [["30", "90"], "30"],
  ])("normaliza %j como %s", (value, expected) => {
    expect(normalizeProgressRange(value)).toBe(expected);
  });

  it.each([undefined, null, "", "7", 0, ["inválido"]])(
    "usa 90 dias para o valor inválido %j",
    (value) => expect(normalizeProgressRange(value)).toBe("90"),
  );
});

describe("seleção das observações", () => {
  const observations: ProgressObservation[] = [
    observation("2026-08-16T12:00:00.000Z", 1000),
    observation("2026-08-17T03:00:00.000Z", 1010),
    observation("2026-08-17T22:00:00.000Z", 1020),
    observation("2026-09-15T10:00:00.000Z", 1060),
    observation("2026-09-15T14:00:00.000Z", 1070),
    observation("2026-09-15T20:00:00.000Z", 1080),
  ];

  it("mantém somente a observação mais recente de cada dia local", () => {
    const input = [
      observation("2026-09-15T04:00:00.000Z", 1210),
      observation("2026-09-14T23:00:00.000Z", 1200),
      observation("2026-09-15T02:00:00.000Z", 1190),
    ];

    const result = groupLastProgressObservationPerDay(input);

    expect(result.map(({ value }) => value)).toEqual([1190, 1210]);
    expect(input.map(({ value }) => value)).toEqual([1210, 1200, 1190]);
  });

  it("considera 30 dias de calendário incluindo o dia de referência", () => {
    const result = selectProgressObservations(
      observations,
      "30",
      "2026-09-15T15:00:00.000Z",
    );

    expect(result.map(({ value }) => value)).toEqual([1020, 1070]);
  });

  it("inclui observações antigas quando o intervalo é completo", () => {
    const result = selectProgressObservations(
      observations,
      "all",
      "2026-09-15T15:00:00.000Z",
    );

    expect(result.map(({ value }) => value)).toEqual([1000, 1020, 1070]);
  });

  it("ignora data, valor e pontos futuros inválidos", () => {
    const invalid = [
      ...observations,
      observation("inválida", 2000),
      observation("2026-09-14T12:00:00.000Z", Number.NaN),
    ];

    expect(
      selectProgressObservations(
        invalid,
        "all",
        "2026-09-15T15:00:00.000Z",
      ).map(({ value }) => value),
    ).toEqual([1000, 1020, 1070]);
  });

  it("rejeita a data de referência inválida", () => {
    expect(() => selectProgressObservations([], "30", "inválida")).toThrow(
      RangeError,
    );
  });
});

describe("resumo da evolução", () => {
  it("calcula início, atual, variação e extremos em ordem cronológica", () => {
    expect(
      calculateProgressStats([
        observation("2026-09-03T00:00:00.000Z", 1180),
        observation("2026-09-01T00:00:00.000Z", 1200),
        observation("2026-09-02T00:00:00.000Z", 1150),
      ]),
    ).toEqual({
      count: 3,
      start: 1200,
      current: 1180,
      change: -20,
      best: 1200,
      min: 1150,
      max: 1200,
    });
  });

  it("representa uma série vazia sem inventar valores", () => {
    expect(calculateProgressStats([])).toEqual({
      count: 0,
      start: null,
      current: null,
      change: null,
      best: null,
      min: null,
      max: null,
    });
  });
});

describe("coordenadas SVG", () => {
  it("escala datas e valores e fornece textos acessíveis", () => {
    const chart = buildProgressChart(
      [
        observation("2026-09-01T12:00:00.000Z", 1000),
        observation("2026-09-02T12:00:00.000Z", 1100),
        observation("2026-09-03T12:00:00.000Z", 1050),
      ],
      {
        width: 300,
        height: 160,
        padding: { top: 10, right: 10, bottom: 10, left: 10 },
        seriesLabel: "Rápida",
      },
    );

    expect(chart.viewBox).toBe("0 0 300 160");
    expect(chart.points.map(({ x, y }) => [x, y])).toEqual([
      [10, 150],
      [150, 10],
      [290, 80],
    ]);
    expect(chart.pointsAttribute).toBe("10,150 150,10 290,80");
    expect(chart.pathData).toBe("M 10 150 L 150 10 L 290 80");
    expect(chart.points[0].ariaLabel).toBe("Rápida: 1.000 em 01/09/2026");
    expect(chart.ariaLabel).toBe(
      "Evolução de rápida: 3 pontos, de 1.000 para 1.050.",
    );
  });

  it("centraliza uma série constante sem produzir coordenadas inválidas", () => {
    const chart = buildProgressChart(
      [observation("2026-09-01T12:00:00.000Z", 1200)],
      { width: 200, height: 100, padding: { top: 10, bottom: 10 } },
    );

    expect(chart.points[0]).toMatchObject({ x: 114, y: 50 });
    expect(chart.pointsAttribute).toBe("114,50");
    expect(chart.minValue).toBe(1200);
    expect(chart.maxValue).toBe(1200);
  });

  it("descreve um gráfico vazio", () => {
    const chart = buildProgressChart([], { seriesLabel: "Blitz" });
    expect(chart.points).toEqual([]);
    expect(chart.pathData).toBe("");
    expect(chart.ariaLabel).toBe("Evolução de blitz: sem dados.");
  });

  it("rejeita uma área de desenho inexistente", () => {
    expect(() =>
      buildProgressChart([], {
        width: 40,
        padding: { left: 20, right: 20 },
      }),
    ).toThrow(RangeError);
  });
});

function observation(capturedAt: string, value: number): ProgressObservation {
  return { capturedAt, value };
}
