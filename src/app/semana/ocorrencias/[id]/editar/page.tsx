import { notFound } from "next/navigation";
import { updateOccurrenceAction } from "@/app/semana/actions";
import { PlannerForm } from "@/modules/planner/components/planner-form";
import {
  normalizeWeekStart,
  serializeCalendarDate,
  serializeLocalTime,
} from "@/shared/lib/calendar-values";
import { idSchema } from "@/shared/lib/domain-validation";
import { getOccurrence } from "@/modules/planner/services/activity-occurrences";

export default async function EditOccurrencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const occurrence = await getOccurrence(id);
  if (!occurrence) notFound();
  const date = serializeCalendarDate(occurrence.scheduledDate);

  return (
    <section className="form-page">
      <h1>Editar ocorrência</h1>
      <p>
        As alterações afetam somente este cartão de {occurrence.activity.name}.
      </p>
      <PlannerForm
        action={updateOccurrenceAction.bind(null, occurrence.id)}
        kind="occurrence"
        submitLabel="Salvar ocorrência"
        weekStart={normalizeWeekStart(date)}
        initialValues={{
          scheduledDate: date,
          startTime: occurrence.startTime
            ? serializeLocalTime(occurrence.startTime)
            : "",
          durationMinutes:
            occurrence.durationMinutes === null
              ? ""
              : String(occurrence.durationMinutes),
          notes: occurrence.notes ?? "",
        }}
      />
    </section>
  );
}
