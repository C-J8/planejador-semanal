import { ActivityForm } from "@/modules/activities/components/activity-form";
import { createActivityAction } from "@/app/atividades/actions";
import { safeReturnTo } from "@/shared/lib/return-navigation";

export default async function NewActivityPage({
  searchParams,
}: PageProps<"/atividades/nova">) {
  const params = await searchParams;
  const returnTo = safeReturnTo(
    typeof params.returnTo === "string" ? params.returnTo : undefined,
    "/atividades",
  );
  return (
    <section className="form-page">
      <h1>Nova atividade</h1>
      <p>Cadastre um cartão para reutilizar no seu planejamento.</p>
      <ActivityForm
        action={createActivityAction}
        submitLabel="Criar atividade"
        returnTo={returnTo}
      />
    </section>
  );
}
