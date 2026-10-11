import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { root, run } from "./common.mjs";

export function gymConfig(env = process.env, plannerRoot = root) {
  if (!env.GYM_TRACKER_PATH?.trim()) return null;
  const directory = path.resolve(plannerRoot, env.GYM_TRACKER_PATH);
  const port = Number(env.GYM_TRACKER_PORT || 8501);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("GYM_TRACKER_PORT deve estar entre 1024 e 65535.");
  if (port === Number(env.PLANNER_PORT || 3000))
    throw new Error("Planner e Academia precisam usar portas diferentes.");
  return {
    directory,
    port,
    python: env.GYM_TRACKER_PYTHON
      ? path.resolve(plannerRoot, env.GYM_TRACKER_PYTHON)
      : path.join(
          directory,
          ".venv",
          process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
        ),
  };
}

export function gymEnvironment(env = process.env) {
  // Pydantic will load the Gym's own .env. Inherited Planner DATABASE_URL must
  // never win over that configuration, nor redirect the importer's writes.
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        !/^(DATABASE_URL|DATA_BACKEND|LEGACY_CSV_PATH|PARSER_VERSION|OPENAI_.*|LLM_.*|GYM_IMPORT_.*|GYM_BACKUP_.*|GYM_TRACKER_USER_ID)$/i.test(
          key,
        ),
    ),
  );
}

export async function gymControl(config, action = "status") {
  if (!config) return null;
  try {
    const state = JSON.parse(
      await readFile(
        path.join(config.directory, ".gym-tracker/desktop.json"),
        "utf8",
      ),
    );
    if (
      !Number.isInteger(state.control_port) ||
      state.control_port < 1 ||
      state.control_port > 65535 ||
      !/^[a-f0-9-]{36}$/.test(state.token)
    )
      return null;
    const response = await fetch(
      `http://127.0.0.1:${state.control_port}/${action}`,
      {
        method: action === "stop" ? "POST" : "GET",
        headers: { Authorization: `Bearer ${state.token}` },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) return null;
    const result = await response.json();
    return result.token === state.token &&
      path.resolve(result.root) === config.directory
      ? result
      : null;
  } catch {
    return null;
  }
}

async function configuredGym() {
  const config = gymConfig();
  if (!config) return null;
  if (
    !existsSync(config.python) ||
    !existsSync(path.join(config.directory, "app.py"))
  )
    throw new Error(
      "Academia nao encontrada. Confira GYM_TRACKER_PATH e o ambiente Python.",
    );
  const { parse } = await import("dotenv");
  let env;
  try {
    env = parse(await readFile(path.join(config.directory, ".env")));
  } catch {
    throw new Error(
      "Crie o .env da Academia e configure DATABASE_URL antes de iniciar.",
    );
  }
  if (!env.DATABASE_URL?.trim())
    throw new Error(
      "Configure DATABASE_URL no .env da Academia. O banco padrao nao sera usado.",
    );
  return config;
}

export async function backupGym(directory) {
  const config = await configuredGym();
  if (!config) return null;
  try {
    return JSON.parse(
      await run(
        config.python,
        ["-B", "-m", "gym_tracker.backup", "--directory", directory],
        { cwd: config.directory, env: gymEnvironment(), capture: true },
      ),
    );
  } catch {
    throw new Error(
      "Backup da Academia falhou. Confira .env, GYM_BACKUP_CONTAINER e Docker; nenhum preparo sera aplicado.",
    );
  }
}

export async function startGym() {
  const config = await configuredGym();
  if (!config) return;
  try {
    await run(
      config.python,
      [
        "-B",
        "-m",
        "gym_tracker.desktop",
        "start",
        "--port",
        String(config.port),
      ],
      {
        cwd: config.directory,
        env: gymEnvironment(),
        capture: true,
      },
    );
  } catch {
    throw new Error(
      "Academia nao iniciou. Confira .env, porta e .gym-tracker/dashboard.log na pasta da Academia.",
    );
  }
  const current = await gymControl(config);
  if (
    !["ready", "degraded"].includes(current?.phase) ||
    !current?.importer?.running
  )
    throw new Error(
      "Academia nao ficou pronta. Confira .gym-tracker/dashboard.log.",
    );
  console.log(`Academia pronta: http://127.0.0.1:${config.port}`);
  if (current.phase === "degraded")
    console.warn(
      `Importador requer atencao: ${current.importer.message ?? "Confira planner:status."}`,
    );
}

export async function stopGym() {
  const config = gymConfig();
  if (!config || !(await gymControl(config))) return;
  if (!(await gymControl(config, "stop")))
    throw new Error("Nao foi possivel solicitar a parada da Academia.");
  for (let attempt = 0; attempt < 240; attempt++) {
    if (!(await gymControl(config))) {
      console.log(
        "Academia encerrada. Importacoes iniciadas manualmente permanecem ativas.",
      );
      return;
    }
    await delay(500);
  }
  throw new Error(
    "A Academia aguarda uma importacao terminar. Consulte planner:status antes de abrir novamente.",
  );
}

export async function reportGym() {
  const config = gymConfig();
  if (!config) return;
  const current = await gymControl(config);
  console.log(
    current
      ? `Academia: ${current.phase === "ready" || current.phase === "degraded" ? "dashboard em execucao" : "iniciando/encerrando"}.`
      : "Academia parada.",
  );
  if (current?.importer) {
    const importer = current.importer;
    console.log(
      `Importador: ${importer.running ? "em execucao" : "parado"}. ${importer.message ?? ""}`,
    );
  } else if (!current) {
    // A manually started importer may remain active without the dashboard.
    try {
      const importer = JSON.parse(
        await run(
          config.python,
          ["-B", "-m", "gym_tracker.automation", "status"],
          { cwd: config.directory, env: gymEnvironment(), capture: true },
        ),
      );
      console.log(
        `Importador: ${importer.running ? "em execucao" : "parado"}. ${importer.message ?? ""}`,
      );
    } catch {
      console.log(
        "Importador: status indisponivel. Confira o ambiente Python da Academia.",
      );
    }
  }
}
