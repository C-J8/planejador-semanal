import { notFound } from "next/navigation";
import { updateOccurrenceAction } from "@/app/semana/actions";
import { PlannerForm } from "@/components/weekly-planner/planner-form";
import {
  normalizeWeekStart,
  serializeCalendarDate,
  serializeLocalTime,
} from "@/lib/calendar-values";
import { idSchema } from "@/lib/domain-validation";
import { getOccurrence } from "@/services/activity-occurrences";

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
          durationMinutes: String(occurrence.durationMinutes),
          notes: occurrence.notes ?? "",
        }}
      />
    </section>
  );
}
