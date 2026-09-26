"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import {
  completeOccurrenceAction,
  reopenOccurrenceAction,
  skipOccurrenceAction,
  type DailyActionResult,
} from "@/app/dia/actions";
import { formatSaoPauloInstant } from "@/shared/lib/calendar-values";
import {
  durationToClock,
  timelinePosition,
  TIMELINE_HOUR_HEIGHT,
} from "@/modules/planner/lib/daily-timeline";
import { occurrenceStatusLabels } from "@/modules/planner/lib/occurrence-status";
import type {
  DailyEventDto,
  DailyOccurrenceDto,
} from "@/modules/planner/services/daily-planner";

type Props = {
  date: string;
  weekStart: string;
  occurrences: DailyOccurrenceDto[];
  events: DailyEventDto[];
  summary: {
    planned: number;
    completed: number;
    skipped: number;
    total: number;
  };
};
type Run = (id: string, action: () => Promise<DailyActionResult>) => void;

export function DailyPlanner(props: Props) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [isPending, startTransition] = useTransition();
  const calendarScroll = useRef<HTMLDivElement>(null);
  const run: Run = (id, action) => {
    setPendingIds((current) => new Set(current).add(id));
    startTransition(async () => {
      const result = await action();
      setFeedback(result.message);
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      router.refresh();
    });
  };
  const scheduledOccurrences = props.occurrences.filter(
    (item) => item.startTime !== null,
  );
  const scheduledEvents = props.events.filter(
    (item) => item.startTime !== null,
  );
  const unscheduledOccurrences = props.occurrences.filter(
    (item) => item.startTime === null,
  );
  const unscheduledEvents = props.events.filter(
    (item) => item.startTime === null,
  );
  const hasScheduled = scheduledOccurrences.length + scheduledEvents.length > 0;
  const earliestStart = [...scheduledOccurrences, ...scheduledEvents].reduce(
    (earliest, item) => {
      const [hours, minutes] = item.startTime!.split(":").map(Number);
      return Math.min(earliest, hours * 60 + minutes);
    },
    1440,
  );
  useEffect(() => {
    if (earliestStart < 1440 && calendarScroll.current) {
      calendarScroll.current.scrollTop = Math.max(
        0,
        (earliestStart / 60) * TIMELINE_HOUR_HEIGHT - TIMELINE_HOUR_HEIGHT,
      );
    }
  }, [earliestStart, props.date]);

  return (
    <div className="daily-content">
      <section className="daily-summary" aria-label="Resumo das atividades">
        <Summary label="Planejadas" value={props.summary.planned} />
        <Summary label="Concluídas" value={props.summary.completed} />
        <Summary label="Puladas" value={props.summary.skipped} />
        <Summary label="Total" value={props.summary.total} />
      </section>
      <p className="planner-feedback" role="status" aria-live="polite">
        {feedback}
      </p>

      <div className="daily-agenda-layout">
        <div className="daily-side-panels">
          <aside
            className="unscheduled-section bento-panel"
            aria-labelledby="unscheduled-title"
          >
            <div className="daily-section-heading">
              <div>
                <span className="eyebrow">Flexível</span>
                <h2 id="unscheduled-title">Sem horário definido</h2>
              </div>
            </div>
            <div className="daily-list">
              {unscheduledOccurrences.map((item) => (
                <OccurrenceCard
                  occurrence={item}
                  pending={pendingIds.has(item.id)}
                  run={run}
                  key={item.id}
                />
              ))}
              {unscheduledEvents.map((item) => (
                <EventCard event={item} key={item.id} />
              ))}
              {unscheduledOccurrences.length === 0 &&
                unscheduledEvents.length === 0 && (
                  <p className="compact-empty">
                    Nenhuma atividade flexível neste dia.
                  </p>
                )}
            </div>
          </aside>
          <aside
            className="scheduled-list-section bento-panel"
            aria-labelledby="scheduled-list-title"
          >
            <div className="daily-section-heading">
              <div>
                <span className="eyebrow">Programadas</span>
                <h2 id="scheduled-list-title">Com horário definido</h2>
              </div>
            </div>
            <div className="daily-list">
              {scheduledOccurrences.map((item) => (
                <OccurrenceCard
                  occurrence={item}
                  pending={pendingIds.has(item.id)}
                  run={run}
                  key={item.id}
                />
              ))}
              {scheduledOccurrences.length === 0 && (
                <p className="compact-empty">
                  Nenhuma atividade com horário neste dia.
                </p>
              )}
            </div>
          </aside>
        </div>
        <section
          className="calendar-section bento-panel"
          aria-labelledby="daily-calendar-title"
        >
          <div className="daily-section-heading calendar-heading">
            <div>
              <span className="eyebrow">Agenda</span>
              <h2 id="daily-calendar-title">Horários do dia</h2>
            </div>
            <Link
              className="button secondary small"
              href={`/semana/eventos/novo?date=${props.date}&week=${props.weekStart}&returnTo=${encodeURIComponent(`/dia?date=${props.date}`)}`}
            >
              + Adicionar evento
            </Link>
          </div>
          {!hasScheduled && (
            <p className="calendar-empty">
              Nenhum item com horário definido. Edite uma atividade ou adicione
              um evento para exibi-lo na agenda.
            </p>
          )}
          <div
            className="calendar-scroll"
            aria-busy={isPending}
            ref={calendarScroll}
          >
            <div
              className="calendar-timeline"
              style={
                {
                  "--hour-height": `${TIMELINE_HOUR_HEIGHT}px`,
                } as CSSProperties
              }
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <div
                  className="calendar-hour"
                  style={{ top: hour * TIMELINE_HOUR_HEIGHT }}
                  key={hour}
                >
                  <time dateTime={`${String(hour).padStart(2, "0")}:00`}>
                    {String(hour).padStart(2, "0")}:00
                  </time>
                  <span />
                </div>
              ))}
              <div className="calendar-items">
                {scheduledOccurrences.map((item) => (
                  <TimelineOccurrence
                    occurrence={item}
                    pending={pendingIds.has(item.id)}
                    run={run}
                    key={item.id}
                  />
                ))}
                {scheduledEvents.map((item) => (
                  <TimelineEvent event={item} key={item.id} />
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
      {props.occurrences.length === 0 && props.events.length === 0 && (
        <div className="empty-state">
          <h3>Nada planejado para este dia</h3>
          <p>Adicione atividades à semana para começar.</p>
          <Link
            className="button primary"
            href={`/semana?week=${props.weekStart}`}
          >
            Planejar semana
          </Link>
        </div>
      )}
    </div>
  );
}

function TimelineOccurrence({
  occurrence,
  pending,
  run,
}: {
  occurrence: DailyOccurrenceDto;
  pending: boolean;
  run: Run;
}) {
  const position = timelinePosition(
    occurrence.startTime!,
    occurrence.durationMinutes,
  );
  return (
    <article
      className={`calendar-item calendar-activity status-${occurrence.status.toLowerCase()}`}
      style={
        {
          top: position.top,
          height: position.height,
          "--activity-color": occurrence.activity.color,
        } as CSSProperties
      }
    >
      <OccurrenceContents
        occurrence={occurrence}
        pending={pending}
        run={run}
        compact
      />
    </article>
  );
}
function TimelineEvent({ event }: { event: DailyEventDto }) {
  const position = timelinePosition(event.startTime!, event.durationMinutes);
  return (
    <article
      className={`calendar-item calendar-event ${event.status === "CANCELLED" ? "cancelled" : ""}`}
      style={{ top: position.top, height: position.height } as CSSProperties}
    >
      <EventContents event={event} compact />
    </article>
  );
}
function OccurrenceCard({
  occurrence,
  pending,
  run,
}: {
  occurrence: DailyOccurrenceDto;
  pending: boolean;
  run: Run;
}) {
  return (
    <article
      className={`daily-card status-${occurrence.status.toLowerCase()}`}
      style={{ "--activity-color": occurrence.activity.color } as CSSProperties}
    >
      <OccurrenceContents occurrence={occurrence} pending={pending} run={run} />
    </article>
  );
}
function EventCard({ event }: { event: DailyEventDto }) {
  return (
    <article
      className={`daily-card daily-event ${event.status === "CANCELLED" ? "cancelled" : ""}`}
    >
      <EventContents event={event} />
    </article>
  );
}

function OccurrenceContents({
  occurrence,
  pending,
  run,
  compact = false,
}: {
  occurrence: DailyOccurrenceDto;
  pending: boolean;
  run: Run;
  compact?: boolean;
}) {
  return (
    <>
      <div className="daily-card-heading">
        <h3>
          {occurrence.activity.icon} {occurrence.activity.name}
        </h3>
        <div className="daily-badges">
          <span className="status-badge">
            {occurrenceStatusLabels[occurrence.status]}
          </span>
          {!occurrence.activity.active && (
            <span className="status-badge archived">Arquivada</span>
          )}
        </div>
      </div>
      <p className="daily-card-meta">
        {occurrence.startTime ?? "Sem horário"} ·{" "}
        {durationToClock(occurrence.durationMinutes)}
      </p>
      {!compact && occurrence.notes && <p>{occurrence.notes}</p>}
      {!compact &&
        occurrence.status === "COMPLETED" &&
        occurrence.completedAt && (
          <p className="completion-time">
            Concluída em {formatSaoPauloInstant(occurrence.completedAt)}
          </p>
        )}
      <div className="daily-card-actions">
        {occurrence.status === "PLANNED" ? (
          <>
            <button
              className="button primary small"
              disabled={pending}
              onClick={() =>
                run(occurrence.id, () =>
                  completeOccurrenceAction(occurrence.id),
                )
              }
              type="button"
            >
              {pending ? "Atualizando…" : "Concluir"}
            </button>
            <button
              className="button secondary small"
              disabled={pending}
              onClick={() =>
                run(occurrence.id, () => skipOccurrenceAction(occurrence.id))
              }
              type="button"
            >
              Pular
            </button>
            <Link
              className="button secondary small"
              href={`/semana/ocorrencias/${occurrence.id}/editar`}
            >
              Editar
            </Link>
          </>
        ) : (
          <button
            className="button secondary small"
            disabled={pending}
            onClick={() =>
              run(occurrence.id, () => reopenOccurrenceAction(occurrence.id))
            }
            type="button"
          >
            {pending ? "Atualizando…" : "Reabrir"}
          </button>
        )}
      </div>
    </>
  );
}
function EventContents({
  event,
  compact = false,
}: {
  event: DailyEventDto;
  compact?: boolean;
}) {
  return (
    <>
      <div className="daily-card-heading">
        <h3>{event.title}</h3>
        <span className="status-badge">
          {event.status === "SCHEDULED" ? "Agendado" : "Cancelado"}
        </span>
      </div>
      <p className="daily-card-meta">
        {event.startTime ?? "Sem horário"}
        {event.durationMinutes
          ? ` · ${durationToClock(event.durationMinutes)}`
          : ""}
      </p>
      {!compact && event.description && <p>{event.description}</p>}
      <Link
        className="calendar-edit-link"
        href={`/semana/eventos/${event.id}/editar`}
      >
        Editar evento
      </Link>
    </>
  );
}
function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
