import Link from "next/link";
import { redirect } from "next/navigation";
import {
  addCalendarMonths,
  currentCalendarDate,
  formatCalendarDateLong,
  normalizeWeekStart,
  resolveCalendarMonth,
} from "@/shared/lib/calendar-values";
import { occurrenceStatusLabels } from "@/modules/planner/lib/occurrence-status";
import {
  getMonthlyPlanner,
  type MonthlyEventDto,
  type MonthlyOccurrenceDto,
} from "@/modules/planner/services/monthly-planner";

const weekDays = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
];

export default async function MonthPage({ searchParams }: PageProps<"/mes">) {
  const params = await searchParams;
  const requestedMonth =
    typeof params.month === "string" ? params.month : undefined;
  const today = currentCalendarDate();
  const currentMonth = today.slice(0, 7);
  const month = resolveCalendarMonth(requestedMonth, currentMonth);
  if (requestedMonth === undefined) redirect(`/mes?month=${month}`);

  const planner = await getMonthlyPlanner(month, today);
  return (
    <section className="month-page">
      <div className="month-heading">
        <div>
          <div className="month-title-line">
            <h1>Mês</h1>
            {planner.isCurrentMonth && (
              <span className="today-label">Este mês</span>
            )}
          </div>
          <p>{planner.monthLabel}</p>
        </div>
        <Link
          className="button secondary"
          href={`/semana?week=${normalizeWeekStart(planner.firstDay)}`}
        >
          Planejar uma semana
        </Link>
      </div>

      <nav className="week-navigation" aria-label="Navegação entre meses">
        <Link
          className="button secondary"
          href={`/mes?month=${addCalendarMonths(month, -1)}`}
        >
          Mês anterior
        </Link>
        <Link className="button secondary" href={`/mes?month=${currentMonth}`}>
          Mês atual
        </Link>
        <Link
          className="button secondary"
          href={`/mes?month=${addCalendarMonths(month, 1)}`}
        >
          Próximo mês
        </Link>
      </nav>

      {planner.isEmpty && (
        <p className="month-empty" role="status">
          Nenhuma atividade ou evento encontrado neste mês.
        </p>
      )}

      <div className="month-weekday-row" aria-hidden="true">
        <span />
        {weekDays.map((day) => (
          <strong key={day}>{day}</strong>
        ))}
      </div>
      <div
        className="month-calendar"
        aria-label={`Calendário de ${planner.monthLabel}`}
      >
        {planner.weeks.map((week) => (
          <section className="month-week" key={week.weekStart}>
            <Link
              className="month-week-link"
              href={`/semana?week=${week.weekStart}`}
              aria-label={`Abrir semana de ${formatCalendarDateLong(week.weekStart)}`}
            >
              Ver semana
            </Link>
            {week.days.map((day, index) => (
              <article
                className={`month-day ${day.belongsToSelectedMonth ? "" : "outside-month"} ${day.isToday ? "today" : ""}`}
                key={day.date}
                aria-label={`${formatCalendarDateLong(day.date)}${day.belongsToSelectedMonth ? "" : ", outro mês"}`}
              >
                <div className="month-day-heading">
                  <span className="mobile-weekday">{weekDays[index]}</span>
                  <h2>
                    <Link
                      className="month-day-link"
                      href={`/dia?date=${day.date}`}
                      aria-label={`Abrir ${formatCalendarDateLong(day.date)}`}
                    >
                      {Number(day.date.slice(-2))}
                    </Link>
                  </h2>
                  {day.isToday && <span className="today-label">Hoje</span>}
                  {!day.belongsToSelectedMonth && (
                    <span className="outside-label">Outro mês</span>
                  )}
                </div>
                <MonthOccurrences items={day.occurrences} />
                <MonthEvents items={day.events} />
              </article>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}

function MonthOccurrences({ items }: { items: MonthlyOccurrenceDto[] }) {
  if (items.length === 0) return null;
  return (
    <div className="month-items month-occurrences">
      <h3>Atividades</h3>
      {items.map((item) => (
        <div
          className={`month-preview occurrence-preview status-${item.status.toLowerCase()}`}
          style={{ borderLeftColor: item.activity.color }}
          key={item.id}
        >
          <strong>
            {item.activity.icon} {item.activity.name}
          </strong>
          <span>{item.startTime ?? "Sem horário"}</span>
          <span>{occurrenceStatusLabels[item.status]}</span>
          {!item.activity.active && <small>Atividade arquivada</small>}
        </div>
      ))}
    </div>
  );
}

function MonthEvents({ items }: { items: MonthlyEventDto[] }) {
  if (items.length === 0) return null;
  return (
    <div className="month-items month-events">
      <h3>Eventos</h3>
      {items.map((item) => (
        <div
          className={`month-preview event-preview ${item.status === "CANCELLED" ? "cancelled" : ""}`}
          key={item.id}
        >
          <strong>{item.title}</strong>
          <span>{item.startTime ?? "Sem horário"}</span>
          <span>{item.status === "SCHEDULED" ? "Agendado" : "Cancelado"}</span>
        </div>
      ))}
    </div>
  );
}
