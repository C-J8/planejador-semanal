import { createEventAction } from "@/app/semana/actions";
import { PlannerForm } from "@/components/weekly-planner/planner-form";
import {
  calendarDateSchema,
  currentCalendarDate,
  normalizeWeekStart,
} from "@/lib/calendar-values";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedDate =
    typeof params.date === "string" ? params.date : currentCalendarDate();
  const date = calendarDateSchema.safeParse(requestedDate).success
    ? requestedDate
    : currentCalendarDate();
  const weekStart = normalizeWeekStart(
    typeof params.week === "string" ? params.week : date,
  );

  return (
    <section className="form-page">
      <h1>Novo evento</h1>
      <p>Eventos são compromissos pontuais e não entram no acompanhamento.</p>
      <PlannerForm
        action={createEventAction}
        kind="event"
        submitLabel="Criar evento"
        weekStart={weekStart}
        initialValues={{
          title: "",
          eventDate: date,
          startTime: "",
          durationMinutes: "",
          description: "",
        }}
      />
    </section>
  );
}
