import { notFound } from "next/navigation";
import { updateActivityAction } from "@/app/atividades/actions";
import { ActivityForm } from "@/components/activities/activity-form";
import { serializeLocalTime } from "@/lib/calendar-values";
import { idSchema } from "@/lib/domain-validation";
import { getActivity } from "@/services/activities";

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
      <p>A edição dos padrões não altera ocorrências já existentes.</p>
      <ActivityForm
        action={updateActivityAction.bind(null, activity.id)}
        submitLabel="Salvar alterações"
        initialValues={{
          name: activity.name,
          color: activity.color,
          icon: activity.icon ?? "",
          defaultDurationMinutes:
            activity.defaultDurationMinutes === null
              ? ""
              : String(activity.defaultDurationMinutes),
          defaultStartTime: activity.defaultStartTime
            ? serializeLocalTime(activity.defaultStartTime)
            : "",
          description: activity.description ?? "",
        }}
      />
    </section>
  );
}
