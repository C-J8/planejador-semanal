import { spawn } from "node:child_process";
import { createWriteStream, createReadStream } from "node:fs";
import { mkdir, rename, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { root, run } from "./common.mjs";

export function assertLocalDatabase(url, config) {
  const target = new URL(url);
  const db = config.services.db;
  const port = db.ports.find((item) => Number(item.target) === 5432)?.published;
  if (
    !["postgresql:", "postgres:"].includes(target.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    Number(target.port || 5432) !== Number(port) ||
    decodeURIComponent(target.pathname.slice(1)) !==
      db.environment.POSTGRES_DB ||
    decodeURIComponent(target.username) !== db.environment.POSTGRES_USER ||
    [...target.searchParams].some(
      ([key, value]) => key !== "schema" || value !== "public",
    )
  ) {
    throw new Error(
      "DATABASE_URL nao corresponde ao banco local do compose.yaml. Backup automatico bloqueado; confira a configuracao.",
    );
  }
  return {
    user: db.environment.POSTGRES_USER,
    database: db.environment.POSTGRES_DB,
  };
}

export async function localTarget() {
  const config = JSON.parse(
    await run("docker", ["compose", "config", "--format", "json"], {
      capture: true,
    }),
  );
  return assertLocalDatabase(process.env.DATABASE_URL, config);
}

async function binaryCommand(args, file, restoring = false) {
  const child = spawn("docker", ["compose", "exec", "-T", "db", ...args], {
    cwd: root,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const completion = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Falha no backup/restauracao do PostgreSQL.")),
    );
  });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  if (restoring) child.stdout.resume();
  else child.stdin.end();
  await Promise.all([
    completion,
    restoring
      ? pipeline(createReadStream(file), child.stdin)
      : pipeline(child.stdout, createWriteStream(file, { flags: "wx" })),
  ]);
}

export async function backup() {
  const target = await localTarget();
  const directory = path.join(root, "backups");
  await mkdir(directory, { recursive: true });
  const name = `planner-${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.dump`;
  const destination = path.join(directory, name);
  await binaryCommand(
    [
      "pg_dump",
      "-U",
      target.user,
      "-d",
      target.database,
      "-Fc",
      "--no-owner",
      "--no-acl",
    ],
    `${destination}.partial`,
  );
  await rename(`${destination}.partial`, destination);
  console.log(`Backup criado: ${destination}`);
  return destination;
}

export async function restore(file, database) {
  if (
    !file ||
    !/^planner_restore_[a-z0-9_]+$/.test(database ?? "") ||
    database.length > 63
  )
    throw new Error(
      "Uso: restore caminho.dump planner_restore_nome. A restauracao sempre cria OUTRO banco.",
    );
  const source = path.resolve(file);
  if (!(await stat(source)).isFile()) throw new Error("Backup invalido.");
  const target = await localTarget();
  if (target.database === database)
    throw new Error("O banco atual nunca pode ser sobrescrito.");
  // createdb refuses an existing database; never use --clean or dropdb here.
  await run("docker", [
    "compose",
    "exec",
    "-T",
    "db",
    "createdb",
    "-U",
    target.user,
    database,
  ]);
  await binaryCommand(
    [
      "pg_restore",
      "-U",
      target.user,
      "-d",
      database,
      "--no-owner",
      "--no-acl",
      "--exit-on-error",
      "--single-transaction",
    ],
    source,
    true,
  );
  console.log(
    `Restaurado em ${database}. O banco original e o .env nao foram alterados.`,
  );
}
