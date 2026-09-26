import Link from "next/link";
import {
  currentCalendarDate,
  formatCalendarDateLong,
} from "@/shared/lib/calendar-values";
import {
  listRecurrences,
  previewRecurrenceCancellation,
} from "@/modules/planner/services/weekly-resources";
import { cancelRecurrenceAction } from "@/app/semana/recursos/actions";
import { DomainError } from "@/shared/lib/domain-error";

const weekdays = [
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
  "domingo",
];
const states = {
  ACTIVE: "Ativa",
  ENDED: "Encerrada por data",
  CANCELLED: "Cancelada",
};

export default async function RecurrencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const today = currentCalendarDate();
  const rules = await listRecurrences(today);
  const cancelId = typeof params.cancel === "string" ? params.cancel : null;
  const from = typeof params.from === "string" ? params.from : today;
  let cancellationError: string | null = null;
  const preview = cancelId
    ? await previewRecurrenceCancellation(cancelId, from, today).catch(
        (caught: unknown) => {
          cancellationError =
            caught instanceof DomainError
              ? caught.message
              : "Não foi possível calcular o cancelamento.";
          return null;
        },
      )
    : null;
  const notice = typeof params.notice === "string" ? params.notice : null;
  const error = typeof params.error === "string" ? params.error : null;
  return (
    <section className="resource-page">
      <div className="page-heading">
        <div>
          <h1>Repetições</h1>
          <p>Repetições finitas materializadas no PostgreSQL.</p>
        </div>
        <Link
          className="button primary"
          href={`/semana/recursos?mode=recurrence&start=${today}`}
        >
          Criar repetição
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
      {cancellationError && (
        <p className="error-message" role="alert">
          {cancellationError}
        </p>
      )}
      {preview && (
        <section className="resource-preview">
          <h2>Confirmar cancelamento</h2>
          <p>
            {preview.activityName}: {preview.count} ocorrência(s) planejada(s)
            vinculada(s) serão removidas a partir de{" "}
            {formatCalendarDateLong(preview.fromDate)}. Concluídas, puladas e
            desvinculadas serão preservadas.
          </p>
          {preview.count > 0 ? (
            <form
              action={cancelRecurrenceAction.bind(null, preview.recurrenceId)}
            >
              <input type="hidden" name="fromDate" value={preview.fromDate} />
              <button className="button danger">
                Confirmar cancelamento
              </button>{" "}
              <Link className="button secondary" href="/repeticoes">
                Voltar
              </Link>
            </form>
          ) : (
            <p role="status">
              Nenhuma ocorrência planejada pode ser removida a partir desta
              data.
            </p>
          )}
        </section>
      )}
      {rules.length === 0 ? (
        <div className="empty-state">
          <h2>Nenhuma repetição</h2>
          <p>Crie uma repetição finita a partir das ações semanais.</p>
        </div>
      ) : (
        <div className="resource-cards">
          {rules.map((rule) => (
            <article className="resource-card" key={rule.id}>
              <div className="resource-card-heading">
                <h2>{rule.activityName}</h2>
                <span>{states[rule.state as keyof typeof states]}</span>
              </div>
              <p>
                {rule.startDate} a {rule.endDate} ·{" "}
                {rule.weekdays.map((day) => weekdays[day]).join(", ")} · a cada{" "}
                {rule.intervalWeeks} semana(s)
              </p>
              <p>
                {rule.startTime ?? "Sem horário"} ·{" "}
                {rule.durationMinutes === null
                  ? "Sem duração"
                  : `${rule.durationMinutes} min`}{" "}
                · {rule.createdCount} ocorrência(s) ainda vinculada(s)
              </p>
              {rule.archived && (
                <p>Atividade arquivada; o histórico foi preservado.</p>
              )}
              {rule.state === "ACTIVE" && (
                <form method="get" className="inline-form">
                  <input type="hidden" name="cancel" value={rule.id} />
                  <label>
                    Cancelar a partir de
                    <input
                      type="date"
                      name="from"
                      min={today}
                      defaultValue={today}
                      required
                    />
                  </label>
                  <button className="button danger">
                    Pré-visualizar cancelamento
                  </button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
