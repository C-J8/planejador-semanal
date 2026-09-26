import { notFound } from "next/navigation";
import { updateEventAction } from "@/app/semana/actions";
import { PlannerForm } from "@/modules/planner/components/planner-form";
import {
  normalizeWeekStart,
  serializeCalendarDate,
  serializeLocalTime,
} from "@/shared/lib/calendar-values";
import { idSchema } from "@/shared/lib/domain-validation";
import { getCalendarEvent } from "@/modules/planner/services/calendar-events";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const event = await getCalendarEvent(id);
  if (!event) notFound();
  const date = serializeCalendarDate(event.eventDate);

  return (
    <section className="form-page">
      <h1>Editar evento</h1>
      <p>Reagendar altera somente este evento.</p>
      <PlannerForm
        action={updateEventAction.bind(null, event.id)}
        kind="event"
        submitLabel="Salvar evento"
        weekStart={normalizeWeekStart(date)}
        initialValues={{
          title: event.title,
          eventDate: date,
          startTime: event.startTime ? serializeLocalTime(event.startTime) : "",
          durationMinutes: event.durationMinutes
            ? String(event.durationMinutes)
            : "",
          description: event.description ?? "",
        }}
      />
    </section>
  );
}
