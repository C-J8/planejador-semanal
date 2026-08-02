import Link from "next/link";
import { redirect } from "next/navigation";
import { DailyPlanner } from "@/components/daily-planner/daily-planner";
import {
  addCalendarDays,
  currentCalendarDate,
  formatCalendarDateLong,
  normalizeWeekStart,
  resolveCalendarDate,
} from "@/lib/calendar-values";
import { getDailyPlanner } from "@/services/daily-planner";

export default async function DayPage({ searchParams }: PageProps<"/dia">) {
  const params = await searchParams;
  const requestedDate =
    typeof params.date === "string" ? params.date : undefined;
  const today = currentCalendarDate();
  const date = resolveCalendarDate(requestedDate, today);
  if (requestedDate === undefined) redirect(`/dia?date=${date}`);

  const weekStart = normalizeWeekStart(date, today);
  const planner = await getDailyPlanner(date);
  return (
    <section className="day-page">
      <div className="day-page-heading">
        <div>
          <div className="day-title-line">
            <h1>Dia</h1>
            {date === today && <span className="today-label">Hoje</span>}
          </div>
          <p>{formatCalendarDateLong(date)}</p>
        </div>
        <Link className="button secondary" href={`/semana?week=${weekStart}`}>
          Ver semana
        </Link>
      </div>
      <nav className="week-navigation" aria-label="Navegação entre dias">
        <Link
          className="button secondary"
          href={`/dia?date=${addCalendarDays(date, -1)}`}
        >
          Dia anterior
        </Link>
        <Link className="button secondary" href={`/dia?date=${today}`}>
          Hoje
        </Link>
        <Link
          className="button secondary"
          href={`/dia?date=${addCalendarDays(date, 1)}`}
        >
          Próximo dia
        </Link>
      </nav>
      <DailyPlanner {...planner} weekStart={weekStart} />
    </section>
  );
}
