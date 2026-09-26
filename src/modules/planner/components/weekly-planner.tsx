"use client";

import Link from "next/link";
import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  addOccurrenceAction,
  cancelEventAction,
  deleteEventAction,
  deleteOccurrenceAction,
  moveOccurrenceAction,
  type PlannerActionResult,
} from "@/app/semana/actions";
import {
  calculateWeekSummary,
  formatPlannerDay,
  getDefaultSelectedDay,
} from "@/modules/planner/lib/planner-presentation";
import type {
  PlannerActivityDto,
  PlannerEventDto,
  PlannerOccurrenceDto,
} from "@/modules/planner/services/weekly-planner";

type Props = {
  weekStart: string;
  today: string;
  days: string[];
  activities: PlannerActivityDto[];
  occurrences: PlannerOccurrenceDto[];
  events: PlannerEventDto[];
};
type Run = (action: () => Promise<PlannerActionResult>) => void;
const labels = {
  PLANNED: "Planejada",
  COMPLETED: "Concluída",
  SKIPPED: "Pulada",
};

export function WeeklyPlanner(props: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() =>
    getDefaultSelectedDay(props.days, props.today),
  );
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const filtered = props.activities.filter((item) =>
    item.name
      .toLocaleLowerCase("pt-BR")
      .includes(query.trim().toLocaleLowerCase("pt-BR")),
  );
  const summary = calculateWeekSummary(props.occurrences);
  const run: Run = (action) =>
    startTransition(async () => {
      const result = await action();
      setFeedback(result.message);
      if (result.ok) router.refresh();
    });
  const onDragStart = (event: DragStartEvent) =>
    setActiveLabel(event.active.data.current?.name ?? null);
  const onDragEnd = (event: DragEndEvent) => {
    setActiveLabel(null);
    if (!event.over) return;
    const active = event.active.data.current;
    const overId = String(event.over.id);
    const target = props.occurrences.find(
      (item) => `occurrence:${item.id}` === overId,
    );
    const date = target?.date ?? overId.replace(/^day:/, "");
    if (!props.days.includes(date)) return;
    const inDay = props.occurrences.filter((item) => item.date === date);
    const targetIndex = target
      ? inDay.findIndex((item) => item.id === target.id)
      : inDay.length;
    if (active?.kind === "activity")
      run(() => addOccurrenceAction({ activityId: active.activityId, date }));
    if (active?.kind === "occurrence")
      run(() =>
        moveOccurrenceAction({
          occurrenceId: active.occurrenceId,
          targetDate: date,
          targetIndex,
        }),
      );
  };
  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <p className="sr-only" id="drag-instructions">
        Use Espaço para iniciar o arrasto, as setas para mover e Espaço para
        soltar.
      </p>
      <div className="planner-layout" aria-busy={pending}>
        <aside className="planner-library bento-panel">
          <details className="library-disclosure" open>
            <summary>
              <span>
                <strong>Biblioteca</strong>
              </span>
              <span className="library-chevron" aria-hidden="true" />
            </summary>
            <div className="library-content">
              <p>Arraste uma atividade para montar sua semana.</p>
              <label htmlFor="library-search">Pesquisar atividades</label>
              <input
                id="library-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nome da atividade"
              />
              <div className="library-list">
                {filtered.map((activity) => (
                  <LibraryActivity activity={activity} key={activity.id} />
                ))}
                {filtered.length === 0 && (
                  <p className="compact-empty">
                    Nenhuma atividade ativa encontrada.
                  </p>
                )}
              </div>
              <Link
                className="button primary library-create"
                href={`/atividades/nova?returnTo=${encodeURIComponent(`/semana?week=${props.weekStart}`)}`}
              >
                + Criar atividade
              </Link>
              <Link className="library-manage" href="/atividades">
                Administrar biblioteca
              </Link>
            </div>
          </details>
        </aside>
        <section
          className="week-board-panel bento-panel"
          aria-label="Dias da semana"
        >
          <div
            className="mobile-day-selector"
            role="tablist"
            aria-label="Escolha um dia"
          >
            {props.days.map((date) => {
              const day = formatPlannerDay(date);
              return (
                <button
                  role="tab"
                  aria-selected={selectedDate === date}
                  aria-controls={`day-${date}`}
                  className={selectedDate === date ? "selected" : ""}
                  onClick={() => setSelectedDate(date)}
                  type="button"
                  key={date}
                >
                  <span>{day.weekday}</span>
                  <strong>{day.day}</strong>
                </button>
              );
            })}
          </div>
          <div className="week-board">
            {props.days.map((date) => (
              <DayColumn
                key={date}
                date={date}
                isToday={date === props.today}
                selected={date === selectedDate}
                activities={props.activities}
                occurrences={props.occurrences.filter(
                  (item) => item.date === date,
                )}
                events={props.events.filter((item) => item.date === date)}
                weekStart={props.weekStart}
                pending={pending}
                run={run}
              />
            ))}
          </div>
        </section>
        <aside className="planner-summary">
          <section
            className="summary-card bento-panel"
            aria-labelledby="week-summary-title"
          >
            <span className="eyebrow">Visão geral</span>
            <h2 id="week-summary-title">Resumo da semana</h2>
            <div className="summary-progress-group">
              <div
                className="summary-progress"
                style={
                  {
                    "--progress": `${summary.percentage * 3.6}deg`,
                  } as CSSProperties
                }
                aria-label={`${summary.percentage}% concluído`}
              >
                <strong>{summary.percentage}%</strong>
                <span>concluído</span>
              </div>
              <div
                className="summary-progress skipped-progress"
                style={
                  {
                    "--progress": `${summary.skippedPercentage * 3.6}deg`,
                  } as CSSProperties
                }
                aria-label={`${summary.skippedPercentage}% puladas`}
              >
                <strong>{summary.skippedPercentage}%</strong>
                <span>puladas</span>
              </div>
            </div>
            <dl>
              <div>
                <dt>Planejadas</dt>
                <dd>{summary.planned}</dd>
              </div>
              <div>
                <dt>Concluídas</dt>
                <dd>{summary.completed}</dd>
              </div>
              <div>
                <dt>Puladas</dt>
                <dd>{summary.skipped}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{summary.total}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
      <p className="planner-feedback" aria-live="polite">
        {pending ? "Salvando planejamento..." : feedback}
      </p>
      <DragOverlay zIndex={10000} dropAnimation={null}>
        {activeLabel ? <div className="drag-overlay">{activeLabel}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

function LibraryActivity({ activity }: { activity: PlannerActivityDto }) {
  const { setNodeRef, transform, isDragging, listeners, attributes } =
    useDraggable({
      id: `activity:${activity.id}`,
      data: { kind: "activity", activityId: activity.id, name: activity.name },
    });
  return (
    <button
      ref={setNodeRef}
      className="library-card"
      style={
        {
          "--activity-color": activity.color,
          transform: CSS.Translate.toString(transform),
          opacity: isDragging ? 0.4 : 1,
        } as CSSProperties
      }
      type="button"
      {...listeners}
      {...attributes}
    >
      <span className="library-drag" aria-hidden="true">
        ⠿
      </span>
      <strong>
        {activity.icon} {activity.name}
      </strong>
      <span>
        {activity.defaultDurationMinutes === null
          ? "Sem duração"
          : `${activity.defaultDurationMinutes} min`}{" "}
        · {activity.defaultStartTime ?? "Sem horário"}
      </span>
      <small>Arraste para adicionar</small>
    </button>
  );
}

type DayProps = {
  date: string;
  isToday: boolean;
  selected: boolean;
  activities: PlannerActivityDto[];
  occurrences: PlannerOccurrenceDto[];
  events: PlannerEventDto[];
  weekStart: string;
  pending: boolean;
  run: Run;
};
function DayColumn(props: DayProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${props.date}` });
  const [activityId, setActivityId] = useState(props.activities[0]?.id ?? "");
  const day = formatPlannerDay(props.date);
  return (
    <section
      ref={setNodeRef}
      id={`day-${props.date}`}
      className={`day-column ${props.isToday ? "today" : ""} ${props.selected ? "mobile-selected" : ""} ${isOver ? "drop-target" : ""}`}
    >
      <header className="day-header">
        <div>
          <span>{day.weekday}</span>
          <h2>{day.day}</h2>
          <small>{day.month}</small>
        </div>
        {props.isToday && <span className="today-label">Hoje</span>}
        <Link className="day-link" href={`/dia?date=${props.date}`}>
          Ver dia
        </Link>
      </header>
      <div className="day-events">
        <div className="day-section-heading">
          <h3>Eventos</h3>
          <Link
            href={`/semana/eventos/novo?date=${props.date}&week=${props.weekStart}&returnTo=${encodeURIComponent(`/semana?week=${props.weekStart}`)}`}
          >
            + Evento
          </Link>
        </div>
        {props.events.map((event) => (
          <EventCard event={event} run={props.run} key={event.id} />
        ))}
        {props.events.length === 0 && (
          <p className="day-empty subtle">Nenhum evento</p>
        )}
      </div>
      <div className="day-occurrences">
        <h3>Atividades</h3>
        <SortableContext
          items={props.occurrences.map((item) => `occurrence:${item.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {props.occurrences.map((item) => (
            <OccurrenceCard occurrence={item} run={props.run} key={item.id} />
          ))}
        </SortableContext>
        {props.occurrences.length === 0 && (
          <p className="day-empty">Solte uma atividade aqui</p>
        )}
      </div>
      <div className="add-activity-fallback">
        <label htmlFor={`activity-${props.date}`}>Adicionar atividade</label>
        <div>
          <select
            id={`activity-${props.date}`}
            value={activityId}
            onChange={(event) => setActivityId(event.target.value)}
            disabled={!props.activities.length || props.pending}
          >
            {props.activities.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            className="button secondary small"
            type="button"
            disabled={!activityId || props.pending}
            onClick={() =>
              props.run(() =>
                addOccurrenceAction({ activityId, date: props.date }),
              )
            }
          >
            Adicionar
          </button>
        </div>
      </div>
    </section>
  );
}

function OccurrenceCard({
  occurrence,
  run,
}: {
  occurrence: PlannerOccurrenceDto;
  run: Run;
}) {
  const {
    setNodeRef,
    transform,
    transition,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    id: `occurrence:${occurrence.id}`,
    data: {
      kind: "occurrence",
      occurrenceId: occurrence.id,
      name: occurrence.activity.name,
    },
  });
  const style = {
    "--activity-color": occurrence.activity.color,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  } as CSSProperties;
  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`planner-card occurrence-card status-${occurrence.status.toLowerCase()}`}
    >
      <button
        className="drag-handle"
        type="button"
        aria-label={`Mover ${occurrence.activity.name}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <div className="planner-card-content">
        <strong>
          {occurrence.activity.icon} {occurrence.activity.name}
        </strong>
        <span>
          {occurrence.startTime ?? "Sem horário"} ·{" "}
          {occurrence.durationMinutes === null
            ? "Sem duração"
            : `${occurrence.durationMinutes} min`}
        </span>
        {occurrence.notes && <p>{occurrence.notes}</p>}
        <small>{labels[occurrence.status]}</small>
        <div className="planner-card-actions">
          <Link href={`/semana/ocorrencias/${occurrence.id}/editar`}>
            Editar
          </Link>
          <button
            type="button"
            onClick={() =>
              window.confirm("Remover somente esta ocorrência da semana?") &&
              run(() => deleteOccurrenceAction(occurrence.id))
            }
          >
            Excluir
          </button>
        </div>
      </div>
    </article>
  );
}

function EventCard({ event, run }: { event: PlannerEventDto; run: Run }) {
  return (
    <article
      className={`planner-card event-card ${event.status === "CANCELLED" ? "cancelled" : ""}`}
    >
      <div className="planner-card-content">
        <strong>{event.title}</strong>
        <span>
          {event.startTime ?? "Sem horário"}
          {event.durationMinutes ? ` · ${event.durationMinutes} min` : ""}
        </span>
        {event.description && <p>{event.description}</p>}
        <small>{event.status === "SCHEDULED" ? "Agendado" : "Cancelado"}</small>
        <div className="planner-card-actions">
          <Link href={`/semana/eventos/${event.id}/editar`}>Editar</Link>
          {event.status !== "CANCELLED" && (
            <button
              type="button"
              onClick={() =>
                window.confirm("Cancelar este evento?") &&
                run(() => cancelEventAction(event.id))
              }
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              window.confirm("Excluir definitivamente este evento?") &&
              run(() => deleteEventAction(event.id))
            }
          >
            Excluir
          </button>
        </div>
      </div>
    </article>
  );
}
