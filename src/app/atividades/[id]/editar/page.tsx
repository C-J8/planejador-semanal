import { notFound } from "next/navigation";
import { updateActivityAction } from "@/app/atividades/actions";
import { ActivityForm } from "@/modules/activities/components/activity-form";
import { serializeLocalTime } from "@/shared/lib/calendar-values";
import { durationMinutesToClock } from "@/modules/activities/lib/activity-form";
import { idSchema } from "@/shared/lib/domain-validation";
import { getActivity } from "@/modules/activities/services/activities";

export default async function EditActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const activity = await getActivity(id);
  if (!activity) notFound();

  return (
    <section className="form-page">
      <h1>Editar atividade</h1>
      <p>
        As ocorrências planejadas que ainda usam os padrões anteriores também
        serão atualizadas. Ajustes manuais e atividades finalizadas são
        preservados.
      </p>
      <ActivityForm
        action={updateActivityAction.bind(null, activity.id)}
        submitLabel="Salvar alterações"
        initialValues={{
          name: activity.name,
          color: activity.color,
          icon: activity.icon ?? "",
          defaultDurationMinutes: durationMinutesToClock(
            activity.defaultDurationMinutes,
          ),
          defaultStartTime: activity.defaultStartTime
            ? serializeLocalTime(activity.defaultStartTime)
            : "",
          description: activity.description ?? "",
        }}
      />
    </section>
  );
}
