import Link from "next/link";
import { WeeklyPlanner } from "@/components/weekly-planner/weekly-planner";
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
      : undefined;

  return (
    <section className="week-page">
      <div className="week-heading">
        <div>
          <h1>Semana</h1>
          <p>{formatWeekRange(weekStart)}</p>
        </div>
        <Link className="button secondary" href="/atividades">
          Administrar atividades
        </Link>
      </div>

      <nav className="week-navigation" aria-label="Navegação entre semanas">
        <Link
          className="button secondary"
          href={`/semana?week=${addCalendarDays(weekStart, -7)}`}
        >
          Semana anterior
        </Link>
        <Link
          className="button secondary"
          href={`/semana?week=${normalizeWeekStart(today)}`}
        >
          Hoje
        </Link>
        <Link
          className="button secondary"
          href={`/semana?week=${addCalendarDays(weekStart, 7)}`}
        >
          Próxima semana
        </Link>
      </nav>

      <section className="weekly-tools" aria-labelledby="weekly-tools-title">
        <div>
          <h2 id="weekly-tools-title">Ações semanais</h2>
          <p>Reutilize seu planejamento sem alterar ocorrências existentes.</p>
        </div>
        <nav aria-label="Recursos de planejamento reutilizável">
          <Link href={`/semana/recursos?mode=copy&source=${weekStart}`}>
            Copiar semana
          </Link>
          <Link href={`/semana/recursos?mode=save-template&week=${weekStart}`}>
            Salvar como modelo
          </Link>
          <Link
            href={`/semana/recursos?mode=apply-template&target=${weekStart}`}
          >
            Aplicar modelo
          </Link>
          <Link href={`/semana/recursos?mode=recurrence&start=${today}`}>
            Criar repetição
          </Link>
          <Link href="/modelos">Gerenciar modelos</Link>
          <Link href="/repeticoes">Gerenciar repetições</Link>
        </nav>
      </section>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <WeeklyPlanner {...planner} today={today} />
    </section>
  );
}
