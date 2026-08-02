import Link from "next/link";
import {
  formatCalendarDateLong,
  formatSaoPauloInstant,
} from "@/lib/calendar-values";
import { occurrenceStatusLabels } from "@/lib/occurrence-status";
import { trackingSearchParams } from "@/lib/tracking-values";
import type { TrackingDashboardDto } from "@/services/tracking-dashboard";

export function TrackingDashboard({
  dashboard,
  toWasLimited,
}: {
  dashboard: TrackingDashboardDto;
  toWasLimited: boolean;
}) {
  const selectedActivity = dashboard.activityOptions.find(
    ({ id }) => id === dashboard.filters.activity,
  );
  const statusLabel =
    dashboard.filters.status === "ALL"
      ? "Todos os estados"
      : occurrenceStatusLabels[dashboard.filters.status];
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
          <label htmlFor="tracking-activity">Atividade</label>
          <select
            id="tracking-activity"
            name="activity"
            defaultValue={dashboard.filters.activity}
          >
            <option value="all">Todas as atividades</option>
            {dashboard.activityOptions.map((activity) => (
              <option value={activity.id} key={activity.id}>
                {activity.name}
                {activity.archived ? " — arquivada" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="tracking-status">Status</label>
          <select
            id="tracking-status"
            name="status"
            defaultValue={dashboard.filters.status}
          >
            <option value="ALL">Todos os estados</option>
            <option value="PLANNED">Planejada</option>
            <option value="COMPLETED">Concluída</option>
            <option value="SKIPPED">Pulada</option>
          </select>
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

      <p className="active-filters" role="status">
        Período de {formatCalendarDateLong(dashboard.filters.from)} até{" "}
        {formatCalendarDateLong(dashboard.filters.to)} ·{" "}
        {selectedActivity?.name ?? "Todas as atividades"} · {statusLabel}
      </p>
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
          title="Frequência semanal"
          description="Semanas começam na segunda-feira; as extremidades podem representar apenas parte da semana."
          items={dashboard.weeklyFrequency.map((item) => ({
            key: item.weekStart,
            label: item.label,
            count: item.count,
            partial: item.partial,
          }))}
        />
        <FrequencySection
          title="Frequência mensal"
          description="Os meses nas extremidades consideram somente as datas selecionadas."
          items={dashboard.monthlyFrequency.map((item) => ({
            key: item.month,
            label: item.label,
            count: item.count,
            partial: item.partial,
          }))}
        />
      </div>
      <OccurrenceHistory dashboard={dashboard} />
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
      <p className="tracking-formula">
        {dashboard.summary.totalCount} ocorrências no total. Taxa = concluídas ÷
        total do recorte × 100.
      </p>
    </section>
  );
}

function MinutesByActivity({ dashboard }: { dashboard: TrackingDashboardDto }) {
  const maximum = Math.max(
    0,
    ...dashboard.minutesByActivity.map(({ plannedMinutes }) => plannedMinutes),
  );
  return (
    <section className="tracking-panel" aria-labelledby="minutes-title">
      <h2 id="minutes-title">Minutos planejados por atividade</h2>
      <p>
        Somados a partir da duração salva em cada ocorrência, não de tempo
        realizado.
      </p>
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
                  {item.plannedMinutes} min · {item.occurrenceCount} ocorrências
                  {item.occurrencesWithoutDuration
                    ? ` · ${item.occurrencesWithoutDuration} sem duração`
                    : ""}
                </span>
              </div>
              <div className="tracking-bar-track" aria-hidden="true">
                <span
                  style={{
                    width: `${maximum === 0 ? 0 : (item.plannedMinutes / maximum) * 100}%`,
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
  description,
  items,
}: {
  title: string;
  description: string;
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
      <p>{description}</p>
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

function OccurrenceHistory({ dashboard }: { dashboard: TrackingDashboardDto }) {
  const previous = dashboard.history.page - 1;
  const next = dashboard.history.page + 1;
  return (
    <section className="tracking-history" aria-labelledby="history-title">
      <div className="tracking-history-heading">
        <div>
          <h2 id="history-title">Histórico de ocorrências</h2>
          <p>
            {dashboard.history.total === 0
              ? "Nenhum registro"
              : `${dashboard.history.fromItem}–${dashboard.history.toItem} de ${dashboard.history.total} registros`}
          </p>
        </div>
        <span>
          Página {dashboard.history.page} de {dashboard.history.totalPages}
        </span>
      </div>
      <div className="tracking-history-list">
        {dashboard.history.items.map((item) => (
          <article className="tracking-history-card" key={item.id}>
            <div>
              <h3>
                {item.activity.icon} {item.activity.name}
              </h3>
              {!item.activity.active && (
                <span className="status-badge archived">Arquivada</span>
              )}
            </div>
            <dl>
              <div>
                <dt>Data planejada</dt>
                <dd>{formatCalendarDateLong(item.scheduledDate)}</dd>
              </div>
              <div>
                <dt>Horário</dt>
                <dd>{item.startTime ?? "Sem horário"}</dd>
              </div>
              <div>
                <dt>Duração planejada</dt>
                <dd>
                  {item.durationMinutes === null
                    ? "Sem duração"
                    : `${item.durationMinutes} min`}
                </dd>
              </div>
              <div>
                <dt>Status atual</dt>
                <dd>{occurrenceStatusLabels[item.status]}</dd>
              </div>
            </dl>
            {item.status === "COMPLETED" && item.completedAt && (
              <p>Concluída em {formatSaoPauloInstant(item.completedAt)}</p>
            )}
            <Link
              href={`/dia?date=${item.scheduledDate}`}
              aria-label={`Abrir ${formatCalendarDateLong(item.scheduledDate)}`}
            >
              Abrir dia
            </Link>
          </article>
        ))}
      </div>
      <nav className="tracking-pagination" aria-label="Paginação do histórico">
        {previous >= 1 ? (
          <Link
            className="button secondary"
            href={`/acompanhamento?${trackingSearchParams(dashboard.filters, previous)}`}
          >
            Página anterior
          </Link>
        ) : (
          <span />
        )}
        {next <= dashboard.history.totalPages && (
          <Link
            className="button secondary"
            href={`/acompanhamento?${trackingSearchParams(dashboard.filters, next)}`}
          >
            Próxima página
          </Link>
        )}
      </nav>
    </section>
  );
}
