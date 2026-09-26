import Link from "next/link";
import type { Activity } from "@/generated/prisma/client";
import { serializeLocalTime } from "@/shared/lib/calendar-values";
import { ActivityStatusButton } from "@/modules/activities/components/activity-status-button";

export function ActivityCard({ activity }: { activity: Activity }) {
  return (
    <article
      className="activity-card"
      style={{ borderTopColor: activity.color }}
    >
      <div className="activity-card-header">
        <div className="activity-identity">
          {activity.icon && (
            <span className="activity-icon" aria-hidden="true">
              {activity.icon}
            </span>
          )}
          <div>
            <h2>{activity.name}</h2>
            <span
              className={`status-badge ${activity.active ? "active" : "archived"}`}
            >
              {activity.active ? "Ativa" : "Arquivada"}
            </span>
          </div>
        </div>
        <span
          className="color-swatch"
          style={{ backgroundColor: activity.color }}
          aria-label={`Cor ${activity.color}`}
        />
      </div>

      <dl className="activity-details">
        <div>
          <dt>Duração</dt>
          <dd>
            {activity.defaultDurationMinutes === null
              ? "Sem duração"
              : `${activity.defaultDurationMinutes} min`}
          </dd>
        </div>
        <div>
          <dt>Horário</dt>
          <dd>
            {activity.defaultStartTime
              ? serializeLocalTime(activity.defaultStartTime)
              : "Sem horário"}
          </dd>
        </div>
      </dl>

      {activity.description && (
        <p className="activity-description">{activity.description}</p>
      )}

      <div className="card-actions">
        <Link
          className="button secondary small"
          href={`/atividades/${activity.id}/editar`}
        >
          Editar
        </Link>
        <ActivityStatusButton id={activity.id} active={activity.active} />
      </div>
    </article>
  );
}
