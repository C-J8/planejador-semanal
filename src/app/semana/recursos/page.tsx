import Link from "next/link";
import { redirect } from "next/navigation";
import {
  currentCalendarDate,
  addCalendarDays,
  formatWeekRange,
  resolveWeekStart,
} from "@/shared/lib/calendar-values";
import {
  previewRecurrence,
  previewTemplateApplication,
  previewTemplateFromWeek,
  listWeeklyTemplates,
  listPlanningActivityOptions,
} from "@/modules/planner/services/weekly-resources";
import { DomainError } from "@/shared/lib/domain-error";
import {
  applyTemplateAction,
  createRecurrenceAction,
  saveTemplateAction,
} from "./actions";

const weekdayLabels = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];
const resultLabels = {
  CREATE: "Será criada",
  DUPLICATE: "Duplicidade ignorada",
  PAST_DATE: "Data passada",
  ARCHIVED: "Atividade arquivada",
};
type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;
const many = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value : value ? [value] : [];

function Preview({
  preview,
}: {
  preview: {
    items: Array<{
      itemKey: string;
      scheduledDate: string;
      activityName: string;
      archived: boolean;
      startTime: string | null;
      durationMinutes: number | null;
      result: keyof typeof resultLabels;
    }>;
    totals: {
      found: number;
      create: number;
      duplicate: number;
      archived: number;
      past: number;
      conflicts: number;
    };
  };
}) {
  return (
    <section className="resource-preview" aria-labelledby="preview-title">
      <h2 id="preview-title">Pré-visualização</h2>
      <dl className="resource-totals">
        <div>
          <dt>Encontradas</dt>
          <dd>{preview.totals.found}</dd>
        </div>
        <div>
          <dt>Serão criadas</dt>
          <dd>{preview.totals.create}</dd>
        </div>
        <div>
          <dt>Duplicidades</dt>
          <dd>{preview.totals.duplicate}</dd>
        </div>
        <div>
          <dt>Arquivadas</dt>
          <dd>{preview.totals.archived}</dd>
        </div>
        <div>
          <dt>Datas passadas</dt>
          <dd>{preview.totals.past}</dd>
        </div>
        <div>
          <dt>Conflitos</dt>
          <dd>{preview.totals.conflicts}</dd>
        </div>
      </dl>
      <ul className="preview-list">
        {preview.items.map((item) => (
          <li key={item.itemKey}>
            <strong>
              {item.scheduledDate} · {item.activityName}
            </strong>
            <span>
              {item.startTime ?? "Sem horário"} ·{" "}
              {item.durationMinutes === null
                ? "Sem duração"
                : `${item.durationMinutes} min`}{" "}
              · {resultLabels[item.result]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function WeeklyResourcesPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = (await searchParams) as Params;
  const mode = one(params.mode) ?? "save-template";
  const today = currentCalendarDate();
  const week = resolveWeekStart(one(params.week) ?? one(params.source), today);
  const error = one(params.error);
  const templates = await listWeeklyTemplates();
  const activities = await listPlanningActivityOptions();
  let content: React.ReactNode;
  let previewError: string | null = null;
  const capturePreviewError = (error: unknown) => {
    previewError =
      error instanceof DomainError
        ? error.message
        : "Não foi possível calcular a pré-visualização.";
    return null;
  };

  if (mode === "save-template") {
    const items = await previewTemplateFromWeek(week);
    content = (
      <>
        <p>
          Semana: {formatWeekRange(week)}. {items.length} ocorrência(s);{" "}
          {items.filter((i) => i.archived).length} arquivada(s) serão ignoradas.
          Eventos não entram.
        </p>
        <ul className="preview-list">
          {items.map((item) => (
            <li key={item.itemKey}>
              <strong>
                {weekdayLabels[item.weekday]} · {item.activityName}
              </strong>
              <span>
                {item.startTime ?? "Sem horário"} ·{" "}
                {item.durationMinutes === null
                  ? "Sem duração"
                  : `${item.durationMinutes} min`}{" "}
                ·{" "}
                {item.archived ? "Arquivada — será ignorada" : "Será incluída"}
              </span>
            </li>
          ))}
        </ul>
        <form action={saveTemplateAction} className="resource-form">
          <input type="hidden" name="week" value={week} />
          <label>
            Nome
            <input name="name" required maxLength={80} />
          </label>
          <label>
            Descrição
            <textarea name="description" maxLength={240} />
          </label>
          <button
            className="button primary"
            disabled={!items.some((i) => !i.archived)}
          >
            Salvar modelo com {items.filter((i) => !i.archived).length} item(ns)
          </button>
        </form>
      </>
    );
  } else if (mode === "apply-template") {
    const templateId = one(params.template) ?? "";
    const target = resolveWeekStart(one(params.target), week);
    const preview = templateId
      ? await previewTemplateApplication(templateId, target, today).catch(
          capturePreviewError,
        )
      : null;
    content = (
      <>
        <form method="get" className="resource-form">
          <input type="hidden" name="mode" value="apply-template" />
          <label>
            Modelo
            <select name="template" required defaultValue={templateId}>
              <option value="">Selecione</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.items.length})
                </option>
              ))}
            </select>
          </label>
          <label>
            Segunda-feira de destino
            <input type="date" name="target" required defaultValue={target} />
          </label>
          <button className="button secondary">Pré-visualizar aplicação</button>
        </form>
        {preview && (
          <>
            <Preview preview={preview} />
            {preview.totals.create > 0 && (
              <form action={applyTemplateAction}>
                <input type="hidden" name="templateId" value={templateId} />
                <input type="hidden" name="targetWeek" value={target} />
                <button className="button primary">
                  Confirmar criação de {preview.totals.create} ocorrência(s)
                </button>
              </form>
            )}
          </>
        )}
      </>
    );
  } else if (mode === "recurrence") {
    const activityId = one(params.activity) ?? "";
    const start = one(params.start) ?? today;
    const end = one(params.end) ?? addCalendarDays(start, 28);
    const days = many(params.days).map(Number);
    const interval = Number(one(params.interval) ?? 1);
    const time = one(params.time) ?? "";
    const duration = one(params.duration) ?? "";
    const raw =
      activityId && days.length
        ? {
            activityId,
            startDate: start,
            endDate: end,
            weekdays: days,
            intervalWeeks: interval,
            startTime: time || null,
            durationMinutes: duration ? Number(duration) : null,
          }
        : null;
    const preview = raw
      ? await previewRecurrence(raw, today).catch(capturePreviewError)
      : null;
    content = (
      <>
        <form method="get" className="resource-form">
          <input type="hidden" name="mode" value="recurrence" />
          <label>
            Atividade
            <select name="activity" required defaultValue={activityId}>
              <option value="">Selecione</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <label>
              Data inicial
              <input
                type="date"
                name="start"
                min={today}
                required
                defaultValue={start}
              />
            </label>
            <label>
              Data final inclusiva
              <input
                type="date"
                name="end"
                min={start}
                required
                defaultValue={end}
              />
            </label>
          </div>
          <fieldset>
            <legend>Dias da semana</legend>
            <div className="weekday-options">
              {weekdayLabels.map((label, index) => (
                <label key={label}>
                  <input
                    type="checkbox"
                    name="days"
                    value={index}
                    defaultChecked={days.includes(index)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="form-row">
            <label>
              Intervalo em semanas
              <input
                name="interval"
                type="number"
                min={1}
                max={52}
                required
                defaultValue={interval}
              />
            </label>
            <label>
              Horário opcional
              <input name="time" type="time" defaultValue={time} />
            </label>
            <label>
              Duração opcional
              <input
                name="duration"
                type="number"
                min={1}
                max={10080}
                defaultValue={duration}
              />
            </label>
          </div>
          <button className="button secondary">Pré-visualizar repetição</button>
        </form>
        {preview && (
          <>
            <Preview preview={preview} />
            {preview.totals.create > 0 && (
              <form action={createRecurrenceAction}>
                {Object.entries(raw!).map(([key, value]) =>
                  key === "weekdays" ? (
                    (value as number[]).map((day) => (
                      <input
                        key={day}
                        type="hidden"
                        name="weekdays"
                        value={day}
                      />
                    ))
                  ) : (
                    <input
                      key={key}
                      type="hidden"
                      name={key}
                      value={value === null ? "" : String(value)}
                    />
                  ),
                )}
                <button className="button primary">
                  Confirmar {preview.totals.create} ocorrência(s)
                </button>
              </form>
            )}
          </>
        )}
      </>
    );
  } else {
    redirect(`/semana?week=${week}`);
  }
  return (
    <section className="resource-page">
      <div className="page-heading">
        <div>
          <h1>Recursos semanais</h1>
          <p>Pré-visualize e confirme cada operação em lote.</p>
        </div>
        <Link className="button secondary" href={`/semana?week=${week}`}>
          Voltar à semana
        </Link>
      </div>
      <nav className="resource-tabs">
        <Link href={`/semana/recursos?mode=save-template&week=${week}`}>
          Salvar modelo
        </Link>
        <Link href={`/semana/recursos?mode=apply-template&target=${week}`}>
          Aplicar modelo
        </Link>
        <Link href={`/semana/recursos?mode=recurrence&start=${today}`}>
          Repetição
        </Link>
      </nav>
      <p className="notice">
        Eventos são compromissos pontuais e não fazem parte de cópias, modelos
        ou repetições de atividades.
      </p>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {previewError && (
        <p className="error-message" role="alert">
          {previewError}
        </p>
      )}
      {content}
    </section>
  );
}
