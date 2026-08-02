"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeOccurrenceAction,
  reopenOccurrenceAction,
  skipOccurrenceAction,
  type DailyActionResult,
} from "@/app/dia/actions";
import { formatSaoPauloInstant } from "@/lib/calendar-values";
import { occurrenceStatusLabels } from "@/lib/occurrence-status";
import type {
  DailyEventDto,
  DailyOccurrenceDto,
} from "@/services/daily-planner";

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

export function DailyPlanner(props: Props) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [isPending, startTransition] = useTransition();

  function run(id: string, action: () => Promise<DailyActionResult>) {
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
  }

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

      <section aria-labelledby="daily-activities-title">
        <h2 id="daily-activities-title">Atividades</h2>
        <div className="daily-list" aria-busy={isPending}>
          {props.occurrences.map((occurrence) => {
            const pending = pendingIds.has(occurrence.id);
            return (
              <article
                className={`daily-card status-${occurrence.status.toLowerCase()}`}
                style={{ borderLeftColor: occurrence.activity.color }}
                key={occurrence.id}
              >
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
                  {occurrence.durationMinutes === null
                    ? "Sem duração"
                    : `${occurrence.durationMinutes} min`}
                </p>
                {occurrence.notes && <p>{occurrence.notes}</p>}
                {occurrence.status === "COMPLETED" &&
                  occurrence.completedAt && (
                    <p className="completion-time">
                      Concluída em{" "}
                      {formatSaoPauloInstant(occurrence.completedAt)}
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
                          run(occurrence.id, () =>
                            skipOccurrenceAction(occurrence.id),
                          )
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
                        run(occurrence.id, () =>
                          reopenOccurrenceAction(occurrence.id),
                        )
                      }
                      type="button"
                    >
                      {pending ? "Atualizando…" : "Reabrir"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {props.occurrences.length === 0 && (
            <div className="empty-state">
              <h3>Nenhuma atividade planejada</h3>
              <p>Adicione atividades à semana para executá-las neste dia.</p>
              <Link
                className="button primary"
                href={`/semana?week=${props.weekStart}`}
              >
                Planejar semana
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="daily-events" aria-labelledby="daily-events-title">
        <div className="daily-section-heading">
          <h2 id="daily-events-title">Eventos</h2>
          <Link
            href={`/semana/eventos/novo?date=${props.date}&week=${props.weekStart}`}
          >
            Adicionar evento
          </Link>
        </div>
        <div className="daily-list">
          {props.events.map((event) => (
            <article
              className={`daily-card daily-event ${event.status === "CANCELLED" ? "cancelled" : ""}`}
              key={event.id}
            >
              <div className="daily-card-heading">
                <h3>{event.title}</h3>
                <span className="status-badge">
                  {event.status === "SCHEDULED" ? "Agendado" : "Cancelado"}
                </span>
              </div>
              <p className="daily-card-meta">
                {event.startTime ?? "Sem horário"}
                {event.durationMinutes ? ` · ${event.durationMinutes} min` : ""}
              </p>
              {event.description && <p>{event.description}</p>}
              <Link href={`/semana/eventos/${event.id}/editar`}>
                Editar evento
              </Link>
            </article>
          ))}
          {props.events.length === 0 && <p>Nenhum evento neste dia.</p>}
        </div>
      </section>
    </div>
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
