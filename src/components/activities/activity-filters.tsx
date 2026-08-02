import Link from "next/link";
import type { ActivityListStatus } from "@/services/activities";

const filters: Array<{ value: ActivityListStatus; label: string }> = [
  { value: "active", label: "Ativas" },
  { value: "archived", label: "Arquivadas" },
  { value: "all", label: "Todas" },
];

export function ActivityFilters({
  status,
  query,
}: {
  status: ActivityListStatus;
  query: string;
}) {
  return (
    <div className="filter-tabs" aria-label="Filtrar atividades">
      {filters.map((filter) => {
        const params = new URLSearchParams({ status: filter.value });
        if (query) params.set("q", query);
        return (
          <Link
            className={status === filter.value ? "selected" : ""}
            aria-current={status === filter.value ? "page" : undefined}
            href={`/atividades?${params}`}
            key={filter.value}
          >
            {filter.label}
          </Link>
        );
      })}
    </div>
  );
}
