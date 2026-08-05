import Link from "next/link";
import { WeeklyPlanner } from "@/components/weekly-planner/weekly-planner";
import { WeekActionsMenu } from "@/components/weekly-planner/week-actions-menu";
import { WeekQuickActions } from "@/components/weekly-planner/week-quick-actions";
import {
  addCalendarDays,
  currentCalendarDate,
  formatWeekRange,
  normalizeWeekStart,
  resolveWeekStart,
} from "@/lib/calendar-values";
import { getWeeklyPlanner } from "@/services/weekly-planner";

const notices: Record<string, string> = {
  "occurrence-updated": "Ocorrência atualizada.",
  "event-created": "Evento criado.",
  "event-updated": "Evento atualizado.",
};

export default async function WeekPage({ searchParams }: PageProps<"/semana">) {
  const params = await searchParams;
  const requestedWeek =
    typeof params.week === "string" ? params.week : undefined;
  const weekStart = resolveWeekStart(requestedWeek);
  const today = currentCalendarDate();
  const planner = await getWeeklyPlanner(weekStart);
  const notice =
    typeof params.notice === "string"
      ? (notices[params.notice] ?? params.notice)
      : typeof params.error === "string"
        ? params.error
        : undefined;

  return (
    <section className="week-page">
      <div className="week-heading bento-panel">
        <div>
          <h1 className="eyebrow week-page-title">Planner semanal</h1>
          <div className="week-range-line">
            <p className="week-range">{formatWeekRange(weekStart)}</p>
            {weekStart === normalizeWeekStart(today) && (
              <span className="current-week-label">Semana atual</span>
            )}
          </div>
        </div>
        <div className="week-toolbar">
          <nav className="week-navigation" aria-label="Navegação entre semanas">
            <Link
              className="icon-button"
              aria-label="Semana anterior"
              href={`/semana?week=${addCalendarDays(weekStart, -7)}`}
            >
              ←
            </Link>
            <Link
              className="button secondary"
              href={`/semana?week=${normalizeWeekStart(today)}`}
            >
              Hoje
            </Link>
            <Link
              className="icon-button"
              aria-label="Próxima semana"
              href={`/semana?week=${addCalendarDays(weekStart, 7)}`}
            >
              →
            </Link>
          </nav>
          <WeekQuickActions weekStart={weekStart} />
          <WeekActionsMenu weekStart={weekStart} today={today} />
        </div>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <WeeklyPlanner {...planner} today={today} />
    </section>
  );
}
