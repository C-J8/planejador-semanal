import { existsSync } from "node:fs";
import { open, readFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import {
  root,
  runtime,
  nextCli,
  prismaCli,
  run,
  databaseReady,
  readWorker,
  control,
  ensureRuntime,
  health,
} from "./local/common.mjs";
import { backup, restore } from "./local/database.mjs";
import {
  sourceFingerprint,
  needsPreparation,
  invalidateBuild,
  recordBuild,
} from "./local/build-state.mjs";

const command = process.argv[2] ?? "open";
let port;
const noBrowser = process.argv.includes("--no-browser");
async function stop() {
  const state = await readWorker();
  if (!(await control(state))) {
    console.log("Nenhum Planner iniciado pelo atalho esta rodando.");
    return;
  }
  if (!(await control(state, "stop")))
    throw new Error("Nao foi possivel parar o Planner.");
  for (let attempt = 0; attempt < 40; attempt++) {
    if (!(await control(state))) {
      console.log(
        "Planner encerrado. O banco permanece ligado e os dados foram preservados.",
      );
      return;
    }
    await delay(250);
  }
  throw new Error("O Planner ainda esta encerrando. Confira .planner/*.log.");
}
async function availablePort() {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(
        new Error(
          `A porta ${port} esta ocupada. Feche o servidor anterior ou configure PLANNER_PORT. Nenhum processo foi encerrado.`,
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}
async function browser() {
  const url = `http://127.0.0.1:${port}/semana`;
  console.log(`Planner pronto: ${url}`);
  if (noBrowser) return;
  if (process.platform === "win32")
    await run(
      "powershell.exe",
      ["-NoProfile", "-Command", `Start-Process '${url}'`],
      { capture: true },
    );
  else console.log("Abra esse endereco no navegador.");
}
async function prepare() {
  await invalidateBuild(root);
  await stop();
  await databaseReady();
  await backup();
  await run(process.execPath, [prismaCli, "generate"]);
  await run(process.execPath, [prismaCli, "migrate", "deploy"]);
  const fingerprint = await sourceFingerprint(root);
  await run(process.execPath, [nextCli, "build"], {
    env: { ...process.env, PLANNER_MODE: "daily", NODE_ENV: "production" },
  });
  if ((await sourceFingerprint(root)) !== fingerprint)
    throw new Error(
      "Os arquivos mudaram durante o preparo. Clique em Abrir Planner novamente quando as edicoes terminarem.",
    );
  await recordBuild(root, fingerprint);
  console.log("Versao de uso atualizada.");
}
async function start(mode) {
  const state = await readWorker();
  let active = await control(state);
  if (active && (active.mode !== mode || active.port !== port))
    throw new Error(
      "Outro modo/porta do Planner esta ativo. Use Parar Planner primeiro.",
    );
  if (!active) await availablePort();
  await databaseReady();
  if (
    mode === "daily" &&
    (await needsPreparation(root, await sourceFingerprint(root)))
  ) {
    console.log(
      "Mudancas detectadas. Fazendo backup e preparando o Planner automaticamente...",
    );
    await prepare();
    active = null;
  }
  if (!active) {
    const worker = spawn(
      process.execPath,
      [path.join(root, "scripts/local/server.mjs"), mode, String(port)],
      {
        cwd: root,
        detached: true,
        windowsHide: true,
        stdio: "ignore",
        env: process.env,
      },
    );
    await new Promise((resolve, reject) => {
      worker.once("spawn", resolve);
      worker.once("error", reject);
    });
    worker.unref();
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    const current = await readWorker();
    if ((await control(current)) && (await health(port))) {
      await browser();
      return;
    }
    await delay(1500);
  }
  await stop();
  throw new Error(
    `Planner nao ficou pronto. Confira ${path.join(runtime, `${mode}.log`)} e tente abrir novamente.`,
  );
}
async function main() {
  if (
    !["open", "dev", "stop", "prepare", "backup", "restore", "status"].includes(
      command,
    )
  )
    throw new Error(
      "Comandos: open, dev, stop, prepare, backup, restore, status",
    );
  if (!existsSync(nextCli))
    throw new Error(
      "Instale as dependencias com npm.cmd ci antes de abrir o Planner.",
    );
  if (!existsSync(path.join(root, ".env")))
    throw new Error(
      "Crie .env a partir de .env.example e confira as configuracoes.",
    );
  const { config } = await import("dotenv");
  config({ path: path.join(root, ".env"), quiet: true });
  port = Number(process.env.PLANNER_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("PLANNER_PORT deve estar entre 1024 e 65535.");
  await ensureRuntime();
  const lockFile = path.join(runtime, "launcher.lock");
  let lock;
  try {
    lock = await open(lockFile, "wx");
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const pid = Number(await readFile(lockFile, "utf8"));
    if (!Number.isInteger(pid) || pid < 1)
      throw new Error(
        "Trava de inicializacao invalida. Confira .planner/launcher.lock.",
      );
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") alive = false;
    }
    if (alive)
      throw new Error("Outra operacao do Planner esta em andamento. Aguarde.");
    await unlink(lockFile);
    lock = await open(lockFile, "wx");
  }
  try {
    await lock.writeFile(String(process.pid));
    if (command === "open" || command === "dev")
      await start(command === "open" ? "daily" : "dev");
    else if (command === "stop") await stop();
    else if (command === "prepare") await prepare();
    else if (command === "status")
      console.log(
        (await control(await readWorker()))
          ? "Planner em execucao."
          : "Planner parado.",
      );
    else {
      await databaseReady();
      if (command === "backup") await backup();
      else await restore(process.argv[3], process.argv[4]);
    }
  } finally {
    await lock.close();
    await unlink(lockFile);
  }
}
main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
