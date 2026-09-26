import Link from "next/link";
import { ChessSyncForm } from "@/modules/chess/components/chess-sync-form";
import { getChessDashboard } from "@/modules/chess/services/chess-progress";
import { chessStatsSchema } from "@/modules/chess/integrations/chess-com";
import {
  buildProgressChart,
  calculateProgressStats,
  CHESS_TIME_CLASSES,
  normalizeProgressRange,
  PROGRESS_RANGES,
  selectProgressObservations,
} from "@/modules/chess/lib/progress-values";

export default async function ChessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const range = normalizeProgressRange(params.range);
  const source = await getChessDashboard();
  const latestMetric = source?.metrics.toSorted(
    (a, b) =>
      (b.observations.at(-1)?.observedAt.getTime() ?? 0) -
      (a.observations.at(-1)?.observedAt.getTime() ?? 0),
  )[0];
  const mode =
    CHESS_TIME_CLASSES.find((item) => item.value === params.mode) ??
    CHESS_TIME_CLASSES.find((item) => item.value === latestMetric?.key) ??
    CHESS_TIME_CLASSES[0];
  const metric = source?.metrics.find((item) => item.key === mode.value);
  const allPoints =
    metric?.observations.map((point) => ({
      capturedAt: point.observedAt,
      value: Number(point.value),
    })) ?? [];
  const points = selectProgressObservations(allPoints, range);
  const summary = calculateProgressStats(points);
  const chart = buildProgressChart(points, { seriesLabel: mode.label });
  const parsedStats = chessStatsSchema.safeParse(metric?.metadata);
  const stats = parsedStats.success ? parsedStats.data : null;
  return (
    <div className="chess-page">
      <section className="tracking-panel chess-connection">
        <div>
          <span className="eyebrow">EVOLUÇÃO PESSOAL</span>
          <h2>Xadrez</h2>
          <p>
            Acompanhe sua pontuação por modalidade e veja como ela muda ao longo
            do tempo.
          </p>
          {source?.displayName && (
            <a
              href={`https://www.chess.com/member/${encodeURIComponent(source.displayName)}`}
              target="_blank"
              rel="noreferrer"
            >
              {source.displayName} no Chess.com ↗
            </a>
          )}
        </div>
        <ChessSyncForm username={source?.displayName ?? undefined} />
        <p className="chess-footnote">
          Importação dos últimos 12 meses de calendário. Os dados do Chess.com
          podem levar até 24 horas para refletir suas partidas.
        </p>
        {source?.lastSyncedAt && (
          <p className="chess-footnote">
            Última atualização: {formatDate(source.lastSyncedAt, true)}
          </p>
        )}
        {source?.lastSyncStatus === "ERROR" && (
          <p role="alert" className="form-error">
            {source.lastSyncError} Exibindo a última atualização salva.
          </p>
        )}
      </section>
      {!source ? (
        <section className="empty-state">
          <h2>Seu próximo ponto de partida</h2>
          <p>
            Informe seu usuário acima para importar as partidas públicas e
            montar seu gráfico. Nenhuma senha é necessária.
          </p>
        </section>
      ) : (
        <>
          <nav className="chess-mode-tabs" aria-label="Modalidade de xadrez">
            {CHESS_TIME_CLASSES.map((item) => (
              <Link
                key={item.value}
                aria-current={mode.value === item.value ? "page" : undefined}
                href={`/acompanhamento/xadrez?mode=${item.value}&range=${range}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="tracking-summary chess-summary">
            <div>
              <strong>{stats?.last?.rating ?? "—"}</strong>
              <span>Rating atual · {mode.label}</span>
            </div>
            <div>
              <strong>
                {summary.count < 2
                  ? "—"
                  : `${summary.change! > 0 ? "+" : ""}${summary.change}`}
              </strong>
              <span>Variação no gráfico</span>
            </div>
            <div>
              <strong>{stats?.best?.rating ?? "—"}</strong>
              <span>Recorde da modalidade</span>
            </div>
            <div>
              <strong>
                {stats?.record
                  ? `${stats.record.win} / ${stats.record.loss} / ${stats.record.draw}`
                  : "—"}
              </strong>
              <span>Vitórias / derrotas / empates · total</span>
            </div>
          </div>
          <section className="tracking-panel chess-chart-panel">
            <div className="chess-chart-heading">
              <h2>Evolução · {mode.label}</h2>
              <form method="get" className="chess-range-form">
                <input type="hidden" name="mode" value={mode.value} />
                <label htmlFor="progress-range">Período</label>
                <select id="progress-range" name="range" defaultValue={range}>
                  {PROGRESS_RANGES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.value === "all"
                        ? "Todo o histórico importado"
                        : item.label}
                    </option>
                  ))}
                </select>
                <button className="button secondary">Aplicar</button>
              </form>
            </div>
            {points.length === 0 ? (
              <p className="empty-state">
                Nenhuma partida avaliada dessa modalidade no período.
                Experimente ampliar o período ou atualizar o histórico.
              </p>
            ) : (
              <>
                <svg
                  className="chess-chart"
                  viewBox={chart.viewBox}
                  role="img"
                  aria-label={chart.ariaLabel}
                >
                  <title>{chart.ariaLabel}</title>
                  {[0, 0.5, 1].map((ratio) => {
                    const y = chart.plot.y + chart.plot.height * ratio;
                    const value = Math.round(
                      chart.maxValue! -
                        (chart.maxValue! - chart.minValue!) * ratio,
                    );
                    return (
                      <g key={ratio}>
                        <line
                          x1={chart.plot.x}
                          x2={chart.plot.x + chart.plot.width}
                          y1={y}
                          y2={y}
                          stroke="var(--border)"
                        />
                        <text x={chart.plot.x - 8} y={y + 4} textAnchor="end">
                          {value}
                        </text>
                      </g>
                    );
                  })}
                  <polyline
                    fill="none"
                    stroke={mode.color}
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={chart.pointsAttribute}
                  />
                  {chart.points.map((point) => (
                    <circle
                      key={point.capturedAt}
                      cx={point.x}
                      cy={point.y}
                      r="3"
                      fill={mode.color}
                    >
                      <title>{point.ariaLabel}</title>
                    </circle>
                  ))}
                  <text x={chart.plot.x} y={chart.height - 5}>
                    {chart.points[0].dateLabel}
                  </text>
                  {points.length > 1 && (
                    <text
                      x={chart.plot.x + chart.plot.width}
                      y={chart.height - 5}
                      textAnchor="end"
                    >
                      {chart.points.at(-1)!.dateLabel}
                    </text>
                  )}
                </svg>
                <p className="chess-footnote">
                  Última pontuação registrada por dia com partida. Variação
                  entre o primeiro e o último dia exibidos; cada modalidade tem
                  seu próprio rating.
                </p>
                <details className="chess-history">
                  <summary>
                    Ver valores do gráfico ({points.length} dias)
                  </summary>
                  <div className="chess-table-scroll">
                    <table>
                      <caption>Pontuação diária · {mode.label}</caption>
                      <thead>
                        <tr>
                          <th scope="col">Data</th>
                          <th scope="col">Rating</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...chart.points].reverse().map((point) => (
                          <tr key={point.capturedAt}>
                            <td>{point.dateLabel}</td>
                            <td>{point.valueLabel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
          </section>
        </>
      )}
      <section className="tracking-panel gym-integration-note">
        <h2>Academia · próxima integração</h2>
        <p>
          O Gym Tracker poderá trazer frequência de treinos e evolução de cargas
          por exercício para esta área. A conexão ainda depende de um recurso de
          exportação naquele projeto.
        </p>
      </section>
    </div>
  );
}

function formatDate(date: Date, time = false) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    ...(time ? { timeStyle: "short" as const } : {}),
  }).format(date);
}
