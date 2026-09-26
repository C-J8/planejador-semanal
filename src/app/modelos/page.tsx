import Link from "next/link";
import { formatSaoPauloInstant } from "@/shared/lib/calendar-values";
import { listWeeklyTemplates } from "@/modules/planner/services/weekly-resources";
import {
  deleteTemplateAction,
  updateTemplateAction,
} from "@/app/semana/recursos/actions";

const weekdays = [
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
  "domingo",
];

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const templates = await listWeeklyTemplates();
  const notice = typeof params.notice === "string" ? params.notice : null;
  const error = typeof params.error === "string" ? params.error : null;
  const deleteId = typeof params.delete === "string" ? params.delete : null;
  const deleteTarget = templates.find((template) => template.id === deleteId);
  return (
    <section className="resource-page">
      <div className="page-heading">
        <div>
          <h1>Modelos semanais</h1>
          <p>Modelos guardam snapshots de dia, horário, duração e posição.</p>
        </div>
        <Link className="button secondary" href="/semana">
          Voltar à semana
        </Link>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {deleteTarget && (
        <section className="resource-preview" role="alert">
          <h2>Confirmar exclusão de “{deleteTarget.name}”</h2>
          <p>
            Somente o modelo e seus itens serão excluídos. Ocorrências já
            criadas permanecerão intactas.
          </p>
          <form action={deleteTemplateAction.bind(null, deleteTarget.id)}>
            <button className="button danger" type="submit">
              Confirmar exclusão
            </button>{" "}
            <Link className="button secondary" href="/modelos">
              Cancelar
            </Link>
          </form>
        </section>
      )}
      {templates.length === 0 ? (
        <div className="empty-state">
          <h2>Nenhum modelo salvo</h2>
          <p>Organize uma semana e use “Salvar como modelo”.</p>
        </div>
      ) : (
        <div className="resource-cards">
          {templates.map((template) => (
            <article className="resource-card" key={template.id}>
              <h2>{template.name}</h2>
              {template.description && <p>{template.description}</p>}
              <p>
                {template.items.length} item(ns) · atualizado em{" "}
                {formatSaoPauloInstant(template.updatedAt)}
              </p>
              <ul>
                {template.items.map((item) => (
                  <li key={item.id}>
                    {weekdays[item.weekday]} · {item.activityName}
                    {item.archived ? " (arquivada/indisponível)" : ""} ·{" "}
                    {item.startTime ?? "Sem horário"} ·{" "}
                    {item.durationMinutes === null
                      ? "Sem duração"
                      : `${item.durationMinutes} min`}
                  </li>
                ))}
              </ul>
              <div className="resource-card-actions">
                <Link
                  className="button primary"
                  href={`/semana/recursos?mode=apply-template&template=${template.id}`}
                >
                  Aplicar
                </Link>
                <details>
                  <summary>Renomear ou descrever</summary>
                  <form
                    action={updateTemplateAction.bind(null, template.id)}
                    className="resource-form"
                  >
                    <label>
                      Nome
                      <input
                        name="name"
                        required
                        maxLength={80}
                        defaultValue={template.name}
                      />
                    </label>
                    <label>
                      Descrição
                      <textarea
                        name="description"
                        maxLength={240}
                        defaultValue={template.description ?? ""}
                      />
                    </label>
                    <button className="button secondary">
                      Salvar alterações
                    </button>
                  </form>
                </details>
                <Link
                  className="button danger"
                  href={`/modelos?delete=${template.id}`}
                >
                  Excluir este modelo
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
