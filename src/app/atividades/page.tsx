import Link from "next/link";
import { ActivityCard } from "@/components/activities/activity-card";
import { ActivityFilters } from "@/components/activities/activity-filters";
import {
  normalizeActivityQuery,
  normalizeActivityStatus,
} from "@/lib/activity-query";
import { listActivities } from "@/services/activities";

const notices: Record<string, string> = {
  created: "Atividade criada com sucesso.",
  updated: "Atividade atualizada com sucesso.",
  archived: "Atividade arquivada. Você pode reativá-la quando quiser.",
  reactivated: "Atividade reativada com sucesso.",
};

export default async function ActivitiesPage({
  searchParams,
}: PageProps<"/atividades">) {
  const params = await searchParams;
  const query = normalizeActivityQuery(params.q);
  const status = normalizeActivityStatus(params.status);
  const notice =
    typeof params.notice === "string" ? notices[params.notice] : undefined;
  const activities = await listActivities({ query, status });

  return (
    <section className="activities-page">
      <div className="page-heading">
        <div>
          <h1>Atividades</h1>
          <p>Crie cartões reutilizáveis para organizar sua rotina.</p>
        </div>
        <Link className="button primary" href="/atividades/nova">
          Nova atividade
        </Link>
      </div>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <div className="activity-toolbar">
        <form className="search-form" method="get">
          <label htmlFor="activity-search">Pesquisar atividades</label>
          <div>
            <input
              id="activity-search"
              name="q"
              maxLength={100}
              defaultValue={query}
              placeholder="Nome ou descrição"
            />
            <input type="hidden" name="status" value={status} />
            <button className="button secondary" type="submit">
              Pesquisar
            </button>
          </div>
        </form>
        <ActivityFilters status={status} query={query} />
      </div>

      <p className="result-count" role="status">
        {activities.length}{" "}
        {activities.length === 1
          ? "atividade encontrada"
          : "atividades encontradas"}
      </p>

      {activities.length > 0 ? (
        <div className="activity-grid">
          {activities.map((activity) => (
            <ActivityCard activity={activity} key={activity.id} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>
            {query
              ? "Nenhuma atividade encontrada"
              : "Nenhuma atividade neste filtro"}
          </h2>
          <p>
            {query
              ? "Tente outro termo de pesquisa ou altere o filtro."
              : "Crie uma atividade ou consulte outro filtro."}
          </p>
          <Link className="button primary" href="/atividades/nova">
            Criar atividade
          </Link>
        </div>
      )}
    </section>
  );
}
