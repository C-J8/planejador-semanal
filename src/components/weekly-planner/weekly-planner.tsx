"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
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
import { formatCalendarDay } from "@/lib/calendar-values";
import type {
  PlannerActivityDto,
  PlannerEventDto,
  PlannerOccurrenceDto,
} from "@/services/weekly-planner";

type WeeklyPlannerProps = {
  weekStart: string;
  today: string;
  days: string[];
  activities: PlannerActivityDto[];
  occurrences: PlannerOccurrenceDto[];
  events: PlannerEventDto[];
};

export function WeeklyPlanner(props: WeeklyPlannerProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const filteredActivities = props.activities.filter((activity) =>
    activity.name
      .toLocaleLowerCase("pt-BR")
      .includes(query.trim().toLocaleLowerCase("pt-BR")),
  );

  function run(action: () => Promise<PlannerActionResult>) {
    startTransition(async () => {
      const result = await action();
      setFeedback(result.message);
      if (result.ok) router.refresh();
    });
  }

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.kind === "activity") setActiveLabel(data.name);
    if (data?.kind === "occurrence") setActiveLabel(data.name);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveLabel(null);
    if (!event.over) return;
    const active = event.active.data.current;
    const overId = String(event.over.id);
    const targetOccurrence = props.occurrences.find(
      (occurrence) => `occurrence:${occurrence.id}` === overId,
    );
    const targetDate = targetOccurrence?.date ?? overId.replace(/^day:/, "");
    if (!props.days.includes(targetDate)) return;
    const dayOccurrences = props.occurrences.filter(
      (item) => item.date === targetDate,
    );
    const targetIndex = targetOccurrence
      ? dayOccurrences.findIndex((item) => item.id === targetOccurrence.id)
      : dayOccurrences.length;

    if (active?.kind === "activity") {
      run(() =>
        addOccurrenceAction({
          activityId: active.activityId,
          date: targetDate,
        }),
      );
    } else if (active?.kind === "occurrence") {
      run(() =>
        moveOccurrenceAction({
          occurrenceId: active.occurrenceId,
          targetDate,
          targetIndex,
        }),
      );
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <p className="sr-only" id="drag-instructions">
        Use Espaço para iniciar o arrasto pelo teclado, as setas para mover e
        Espaço para soltar.
      </p>
      <div className="planner-layout" aria-busy={pending}>
        <aside className="planner-library">
          <h2>Biblioteca</h2>
          <p>Arraste ou use os botões em cada dia.</p>
          <label htmlFor="library-search">Pesquisar atividades</label>
          <input
            id="library-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome da atividade"
          />
          <div className="library-list">
            {filteredActivities.map((activity) => (
              <LibraryActivity activity={activity} key={activity.id} />
            ))}
            {filteredActivities.length === 0 && (
              <p className="compact-empty">
                Nenhuma atividade ativa encontrada.
              </p>
            )}
          </div>
          <Link href="/atividades/nova">Criar atividade</Link>
        </aside>

        <div className="week-board">
          {props.days.map((date) => (
            <DayColumn
              activities={props.activities}
              date={date}
              events={props.events.filter((event) => event.date === date)}
              isToday={date === props.today}
              key={date}
              occurrences={props.occurrences.filter(
                (occurrence) => occurrence.date === date,
              )}
              pending={pending}
              run={run}
              weekStart={props.weekStart}
            />
          ))}
        </div>
      </div>
      <p className="planner-feedback" aria-live="polite">
        {pending ? "Salvando planejamento..." : feedback}
      </p>
      <DragOverlay>
        {activeLabel ? <div className="drag-overlay">{activeLabel}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

function LibraryActivity({ activity }: { activity: PlannerActivityDto }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `activity:${activity.id}`,
      data: { kind: "activity", activityId: activity.id, name: activity.name },
    });
  return (
    <button
      ref={setNodeRef}
      className="library-card"
      style={{
        borderLeftColor: activity.color,
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
      }}
      type="button"
      {...listeners}
      {...attributes}
    >
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

type DayColumnProps = {
  date: string;
  isToday: boolean;
  activities: PlannerActivityDto[];
  occurrences: PlannerOccurrenceDto[];
  events: PlannerEventDto[];
  weekStart: string;
  pending: boolean;
  run: (action: () => Promise<PlannerActionResult>) => void;
};

function DayColumn(props: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${props.date}` });
  const [selectedActivity, setSelectedActivity] = useState(
    props.activities[0]?.id ?? "",
  );
  return (
    <section
      ref={setNodeRef}
      className={`day-column ${props.isToday ? "today" : ""} ${isOver ? "drop-target" : ""}`}
    >
      <header className="day-header">
        <h2>{formatCalendarDay(props.date)}</h2>
        {props.isToday && <span className="today-label">Hoje</span>}
        <Link className="day-link" href={`/dia?date=${props.date}`}>
          Ver dia
        </Link>
      </header>

      <div className="day-events">
        <div className="day-section-heading">
          <h3>Eventos</h3>
          <Link
            href={`/semana/eventos/novo?date=${props.date}&week=${props.weekStart}`}
          >
            Adicionar evento
          </Link>
        </div>
        {props.events.map((event) => (
          <EventCard event={event} key={event.id} run={props.run} />
        ))}
        {props.events.length === 0 && (
          <p className="day-empty">Nenhum evento</p>
        )}
      </div>

      <div className="day-occurrences">
        <h3>Atividades</h3>
        <SortableContext
          items={props.occurrences.map((item) => `occurrence:${item.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {props.occurrences.map((occurrence) => (
            <OccurrenceCard
              occurrence={occurrence}
              key={occurrence.id}
              run={props.run}
            />
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
            value={selectedActivity}
            onChange={(event) => setSelectedActivity(event.target.value)}
            disabled={props.activities.length === 0 || props.pending}
          >
            {props.activities.map((activity) => (
              <option value={activity.id} key={activity.id}>
                {activity.name}
              </option>
            ))}
          </select>
          <button
            className="button secondary small"
            type="button"
            disabled={!selectedActivity || props.pending}
            onClick={() =>
              props.run(() =>
                addOccurrenceAction({
                  activityId: selectedActivity,
                  date: props.date,
                }),
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

const occurrenceLabels = {
  PLANNED: "Planejada",
  COMPLETED: "Concluída",
  SKIPPED: "Pulada",
};

function OccurrenceCard({
  occurrence,
  run,
}: {
  occurrence: PlannerOccurrenceDto;
  run: DayColumnProps["run"];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `occurrence:${occurrence.id}`,
    data: {
      kind: "occurrence",
      occurrenceId: occurrence.id,
      name: occurrence.activity.name,
    },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    borderLeftColor: occurrence.activity.color,
  };
  return (
    <article
      ref={setNodeRef}
      style={style}
      className="planner-card occurrence-card"
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
        <small>{occurrenceLabels[occurrence.status]}</small>
        <div className="planner-card-actions">
          <Link href={`/semana/ocorrencias/${occurrence.id}/editar`}>
            Editar
          </Link>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Remover somente esta ocorrência da semana?"))
                run(() => deleteOccurrenceAction(occurrence.id));
            }}
          >
            Excluir ocorrência
          </button>
        </div>
      </div>
    </article>
  );
}

function EventCard({
  event,
  run,
}: {
  event: PlannerEventDto;
  run: DayColumnProps["run"];
}) {
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
              onClick={() => {
                if (
                  window.confirm(
                    "Cancelar este evento? Ele continuará visível na semana.",
                  )
                )
                  run(() => cancelEventAction(event.id));
              }}
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "Excluir definitivamente somente este evento? Esta ação não pode ser desfeita.",
                )
              )
                run(() => deleteEventAction(event.id));
            }}
          >
            Excluir evento
          </button>
        </div>
      </div>
    </article>
  );
}
