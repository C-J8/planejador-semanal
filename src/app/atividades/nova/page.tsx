import { ActivityForm } from "@/components/activities/activity-form";
import { createActivityAction } from "@/app/atividades/actions";

export default function NewActivityPage() {
  return (
    <section className="form-page">
      <h1>Nova atividade</h1>
      <p>Cadastre um cartão para reutilizar no seu planejamento.</p>
      <ActivityForm
        action={createActivityAction}
        submitLabel="Criar atividade"
      />
    </section>
  );
}
