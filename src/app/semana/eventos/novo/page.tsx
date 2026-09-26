import { createEventAction } from "@/app/semana/actions";
import { PlannerForm } from "@/modules/planner/components/planner-form";
import {
  currentCalendarDate,
  resolveCalendarDate,
  resolveWeekStart,
} from "@/shared/lib/calendar-values";
import { safeReturnTo } from "@/shared/lib/return-navigation";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedDate =
    typeof params.date === "string" ? params.date : undefined;
  const date = resolveCalendarDate(requestedDate, currentCalendarDate());
  const weekStart = resolveWeekStart(
    typeof params.week === "string" ? params.week : undefined,
    date,
  );
  const returnTo = safeReturnTo(
    typeof params.returnTo === "string" ? params.returnTo : undefined,
    `/semana?week=${weekStart}`,
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
        returnTo={returnTo}
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
