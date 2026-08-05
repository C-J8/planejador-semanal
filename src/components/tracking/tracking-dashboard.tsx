import Link from "next/link";
import type { TrackingDashboardDto } from "@/services/tracking-dashboard";

export function TrackingDashboard({
  dashboard,
  toWasLimited,
}: {
  dashboard: TrackingDashboardDto;
  toWasLimited: boolean;
}) {
  const selectedActivities = dashboard.activityOptions.filter(({ id }) =>
    dashboard.filters.activities.includes(id),
  );
  return (
    <>
      <form className="tracking-filters" action="/acompanhamento" method="get">
        <div className="form-field">
          <label htmlFor="tracking-from">Data inicial</label>
          <input
            id="tracking-from"
            name="from"
            type="date"
            defaultValue={dashboard.filters.from}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="tracking-to">Data final</label>
          <input
            id="tracking-to"
            name="to"
            type="date"
            defaultValue={dashboard.filters.to}
            required
          />
        </div>
        <div className="form-field">
          <span className="filter-label">Atividade</span>
          <details className="multi-filter">
            <summary>
              {selectedActivities.length === 0
                ? "Todas as atividades"
                : `${selectedActivities.length} selecionadas`}
            </summary>
            <div className="multi-filter-options">
              {dashboard.activityOptions.map((activity) => (
                <label key={activity.id}>
                  <input
                    type="checkbox"
                    name="activity"
                    value={activity.id}
                    defaultChecked={dashboard.filters.activities.includes(
                      activity.id,
                    )}
                  />
                  <span>
                    {activity.name}
                    {activity.archived ? " — arquivada" : ""}
                  </span>
                </label>
              ))}
            </div>
          </details>
        </div>
        <div className="form-field">
          <span className="filter-label">Status</span>
          <details className="multi-filter">
            <summary>
              {dashboard.filters.statuses.length === 0
                ? "Todos os estados"
                : `${dashboard.filters.statuses.length} selecionados`}
            </summary>
            <div className="multi-filter-options">
              <label>
                <input
                  type="checkbox"
                  name="status"
                  value="PLANNED"
                  defaultChecked={dashboard.filters.statuses.includes(
                    "PLANNED",
                  )}
                />
                <span>Planejada</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  name="status"
                  value="COMPLETED"
                  defaultChecked={dashboard.filters.statuses.includes(
                    "COMPLETED",
                  )}
                />
                <span>Concluída</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  name="status"
                  value="SKIPPED"
                  defaultChecked={dashboard.filters.statuses.includes(
                    "SKIPPED",
                  )}
                />
                <span>Pulada</span>
              </label>
            </div>
          </details>
        </div>
        <div className="tracking-filter-actions">
          <button className="button primary" type="submit">
            Aplicar filtros
          </button>
          <Link className="button secondary" href="/acompanhamento">
            Limpar filtros
          </Link>
        </div>
      </form>

      {toWasLimited && (
        <p className="notice">
          A data final futura foi limitada ao dia atual em São Paulo.
        </p>
      )}

      <TrackingSummary dashboard={dashboard} />
      {dashboard.summary.totalCount === 0 && (
        <div className="empty-state tracking-empty" role="status">
          <h2>Nenhuma ocorrência encontrada</h2>
          <p>Nenhuma ocorrência corresponde aos filtros selecionados.</p>
          <Link className="button primary" href="/semana">
            Abrir planejador semanal
          </Link>
        </div>
      )}
      <div className="tracking-analytics-grid">
        <MinutesByActivity dashboard={dashboard} />
        <FrequencySection
          title="Atividades por semana do mês"
          items={dashboard.monthWeekFrequency.map((item) => ({
            key: String(item.weekNumber),
            label: `${item.label} · ${item.rangeLabel}`,
            count: item.count,
            partial: false,
          }))}
        />
        <FrequencySection
          title="Atividades por mês"
          items={dashboard.monthlyFrequency.map((item) => ({
            key: item.month,
            label: item.label,
            count: item.count,
            partial: item.partial,
          }))}
        />
      </div>
    </>
  );
}

function TrackingSummary({ dashboard }: { dashboard: TrackingDashboardDto }) {
  const cards = [
    ["Planejadas", dashboard.summary.plannedCount],
    ["Concluídas", dashboard.summary.completedCount],
    ["Puladas", dashboard.summary.skippedCount],
    [
      "Taxa de conclusão",
      dashboard.summary.completionRate === null
        ? "—"
        : `${dashboard.summary.completionRate.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
    ],
  ] as const;
  return (
    <section aria-labelledby="tracking-summary-title">
      <h2 id="tracking-summary-title">Resumo</h2>
      <div className="tracking-summary">
        {cards.map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MinutesByActivity({ dashboard }: { dashboard: TrackingDashboardDto }) {
  return (
    <section className="tracking-panel" aria-labelledby="minutes-title">
      <h2 id="minutes-title">Tempo investido por atividade</h2>
      {dashboard.minutesByActivity.length === 0 ? (
        <p>Sem atividades neste recorte.</p>
      ) : (
        <ul className="tracking-bars">
          {dashboard.minutesByActivity.map((item) => (
            <li key={item.activityId}>
              <div className="tracking-bar-label">
                <strong>
                  {item.icon} {item.activityName}
                  {item.archived ? " — Arquivada" : ""}
                </strong>
                <span>
                  {item.investedMinutes} de {item.plannedMinutes} min ·{" "}
                  {item.completedCount} de {item.occurrenceCount} concluídas
                  {item.occurrencesWithoutDuration
                    ? ` · ${item.occurrencesWithoutDuration} sem duração`
                    : ""}
                </span>
              </div>
              <div className="tracking-bar-track" aria-hidden="true">
                <span
                  style={{
                    width: `${item.plannedMinutes === 0 ? 0 : (item.investedMinutes / item.plannedMinutes) * 100}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FrequencySection({
  title,
  items,
}: {
  title: string;
  items: Array<{
    key: string;
    label: string;
    count: number;
    partial: boolean;
  }>;
}) {
  const maximum = Math.max(0, ...items.map(({ count }) => count));
  return (
    <section className="tracking-panel">
      <h2>{title}</h2>
      <ul className="tracking-bars frequency-bars">
        {items.map((item) => (
          <li key={item.key}>
            <div className="tracking-bar-label">
              <strong>{item.label}</strong>
              <span>
                {item.count} ocorrências
                {item.partial ? " · período parcial" : ""}
              </span>
            </div>
            <div className="tracking-bar-track" aria-hidden="true">
              <span
                style={{
                  width: `${maximum === 0 ? 0 : (item.count / maximum) * 100}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
