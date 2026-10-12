import { z } from "zod";

export const statusSnapshotSchema = z.object({
  checkedAt: z.string().datetime(),
  cards: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      level: z.enum(["ok", "warning", "error", "neutral"]),
      label: z.string(),
      detail: z.string(),
      facts: z.array(
        z.object({ label: z.string(), at: z.string().datetime().nullable() }),
      ),
    }),
  ),
});

export type StatusSnapshot = z.infer<typeof statusSnapshotSchema>;
export type StatusCard = StatusSnapshot["cards"][number];

export function safeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value))
    return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) &&
    date.getTime() <= Date.now() + 300000
    ? date.toISOString()
    : null;
}

export type PlannerState = {
  database: boolean;
  chessAvailable: boolean;
  chess: { lastSyncedAt: string | null; lastSyncStatus: string } | null;
};
export type GymState = {
  configured: boolean;
  dashboard: "ready" | "starting" | "stopping" | "unknown";
  running: boolean | null;
  phase: string | null;
  checkedAt: string | null;
  lastImportAt: string | null;
  database: "connected" | "user_required" | "unavailable";
  pendingReviews: number | null;
  lastBackupAt: string | null;
};
export type BackupState = { createdAt: string | null; gymIncluded: boolean };

export function buildStatusSnapshot(
  planner: PlannerState,
  gym: GymState,
  backup: BackupState,
): StatusSnapshot {
  const fact = (label: string, at: string | null) => ({ label, at });
  const cards: StatusCard[] = [
    {
      id: "database",
      title: "Planner e banco",
      level: planner.database ? "ok" : "error",
      label: planner.database ? "Conectado" : "Indisponível",
      detail: planner.database
        ? "O Planner consegue consultar seu banco."
        : "Confira o Docker e a configuração do banco. Os outros cartões continuam disponíveis.",
      facts: [],
    },
  ];
  const chess = planner.chess;
  cards.push({
    id: "chess",
    title: "Chess.com",
    level: !planner.chessAvailable
      ? "error"
      : !chess
        ? "neutral"
        : chess.lastSyncStatus === "ERROR"
          ? "warning"
          : chess.lastSyncedAt
            ? "ok"
            : "neutral",
    label: !planner.chessAvailable
      ? "Consulta indisponível"
      : !chess
        ? "Não conectado"
        : chess.lastSyncStatus === "ERROR"
          ? "Última atualização falhou"
          : chess.lastSyncedAt
            ? "Histórico atualizado"
            : "Ainda não atualizado",
    detail: !planner.chessAvailable
      ? "Não foi possível consultar o histórico salvo."
      : chess?.lastSyncStatus === "ERROR"
        ? "Os dados anteriores foram preservados. Confira a página de Xadrez."
        : "Esta consulta não busca partidas novas. A atualização continua na página de Xadrez.",
    facts: [
      fact("Última atualização bem-sucedida", chess?.lastSyncedAt ?? null),
    ],
  });
  cards.push({
    id: "gym",
    title: "Academia",
    level: !gym.configured
      ? "neutral"
      : gym.dashboard === "ready"
        ? "ok"
        : "warning",
    label: !gym.configured
      ? "Não configurada"
      : gym.dashboard === "ready"
        ? "Dashboard ativo"
        : gym.dashboard === "starting"
          ? "Iniciando"
          : gym.dashboard === "stopping"
            ? "Encerrando"
            : "Não foi possível confirmar",
    detail: !gym.configured
      ? "A integração com a Academia é opcional."
      : gym.dashboard === "ready"
        ? "O supervisor local da Academia está respondendo."
        : "Use Abrir Planner para iniciar os serviços ou conferir uma falha de abertura.",
    facts: [],
  });
  const importFailed = gym.phase === "error";
  cards.push({
    id: "importer",
    title: "Importação do TXT",
    level: !gym.configured
      ? "neutral"
      : importFailed || gym.running !== true
        ? "warning"
        : "ok",
    label: !gym.configured
      ? "Não configurada"
      : gym.running === false
        ? "Parada"
        : gym.running === null
          ? "Não foi possível confirmar"
          : importFailed
            ? "Última verificação falhou"
            : gym.phase === "waiting"
              ? "Aguardando arquivo"
              : "Importador ativo",
    detail: !gym.configured
      ? "Disponível quando a Academia estiver configurada."
      : importFailed
        ? "Confira o TXT, o banco e o backup da Academia. O monitor tenta novamente automaticamente."
        : gym.running !== true
          ? "Reabra o Planner para recuperar um importador parado. Datas abaixo são os últimos registros, não confirmação de execução."
          : gym.phase === "waiting"
            ? "O arquivo pode estar ausente ou ainda sendo copiado."
            : "O monitor está em execução. A consulta não inicia nem reprocessa imports.",
    facts: [
      fact("Última verificação registrada", gym.checkedAt),
      fact("Última importação nova bem-sucedida", gym.lastImportAt),
    ],
  });
  const pending = gym.pendingReviews;
  cards.push({
    id: "reviews",
    title: "Pendências da Academia",
    level: !gym.configured
      ? "neutral"
      : pending === null || pending > 0
        ? "warning"
        : "ok",
    label: !gym.configured
      ? "Não configurada"
      : pending === null
        ? "Consulta indisponível"
        : `${pending} ${pending === 1 ? "pendência" : "pendências"}`,
    detail: !gym.configured
      ? "Nenhuma consulta é feita sem a integração configurada."
      : gym.database === "user_required"
        ? "Confira GYM_TRACKER_USER_ID na configuração da Academia."
        : pending === null
          ? "A contagem atual exige o supervisor e o banco da Academia disponíveis."
          : pending > 0
            ? "Contagem atual do usuário configurado. A revisão permanece nos comandos da Academia."
            : "Nenhuma mensagem aguardando revisão para o usuário configurado.",
    facts: [],
  });
  const oldBackup =
    backup.createdAt !== null &&
    Date.now() - new Date(backup.createdAt).getTime() > 7 * 86400000;
  cards.push({
    id: "backups",
    title: "Backups",
    level: !backup.createdAt || oldBackup ? "warning" : "ok",
    label: !backup.createdAt
      ? "Cópia completa não encontrada"
      : oldBackup
        ? "Cópia registrada há mais de 7 dias"
        : backup.gymIncluded
          ? "Cópia conjunta registrada"
          : "Cópia do Planner registrada",
    detail: !backup.createdAt
      ? "Não foi encontrado um manifesto com todos os arquivos necessários. Use npm.cmd run backup para uma cópia extra."
      : "O manifesto e os arquivos foram conferidos. Esta tela não restaura, cria nem remove backups.",
    facts: [
      fact("Último backup completo pelo Planner", backup.createdAt),
      ...(gym.configured
        ? [fact("Último backup automático da Academia", gym.lastBackupAt)]
        : []),
    ],
  });
  return { checkedAt: new Date().toISOString(), cards };
}
