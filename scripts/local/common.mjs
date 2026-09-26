import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const runtime = path.join(root, ".planner");
export const workerFile = path.join(runtime, "server.json");
export const nextCli = path.join(root, "node_modules/next/dist/bin/next");
export const prismaCli = path.join(root, "node_modules/prisma/build/index.js");

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      windowsHide: true,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      ...options,
    });
    let output = "";
    if (options.capture) {
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", () => {});
    }
    child.on("error", () =>
      reject(
        new Error(
          `Nao foi possivel executar ${command}. Confira a instalacao.`,
        ),
      ),
    );
    child.on("exit", (code) =>
      code === 0
        ? resolve(output)
        : reject(
            new Error(`${path.basename(command)} terminou com erro (${code}).`),
          ),
    );
  });
}

export async function dockerReady() {
  try {
    await run("docker", ["info"], { capture: true });
    return;
  } catch {
    /* Try Desktop on Windows. */
  }
  const desktop = path.join(
    process.env.ProgramFiles ?? "C:/Program Files",
    "Docker/Docker/Docker Desktop.exe",
  );
  if (process.platform !== "win32" || !existsSync(desktop)) {
    throw new Error("Abra o Docker Desktop e tente novamente.");
  }
  console.log("Iniciando Docker Desktop. Aguarde...");
  await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Start-Process -FilePath '${desktop.replaceAll("'", "''")}' -WindowStyle Hidden`,
    ],
    {
      capture: true,
    },
  );
  for (let attempt = 0; attempt < 60; attempt++) {
    await delay(2000);
    try {
      await run("docker", ["info"], { capture: true });
      return;
    } catch {
      /* Bounded startup wait. */
    }
  }
  throw new Error("Docker ainda nao esta pronto. Confira o Docker Desktop.");
}

export async function databaseReady() {
  await dockerReady();
  await run("docker", [
    "compose",
    "up",
    "-d",
    "--wait",
    "--wait-timeout",
    "90",
    "db",
  ]);
}

export async function readWorker() {
  try {
    return JSON.parse(await readFile(workerFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function control(state, action = "status") {
  if (
    !state ||
    !Number.isInteger(state.controlPort) ||
    state.controlPort < 1 ||
    state.controlPort > 65535 ||
    !/^[a-f0-9-]{36}$/.test(state.token)
  )
    return null;
  try {
    const response = await fetch(
      `http://127.0.0.1:${state.controlPort}/${action}`,
      {
        method: action === "stop" ? "POST" : "GET",
        headers: { Authorization: `Bearer ${state.token}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.root === root && data.token === state.token ? data : null;
  } catch {
    return null;
  }
}

export async function ensureRuntime() {
  await mkdir(runtime, { recursive: true });
}

export async function health(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await response.json();
    return response.ok && data.status === "ok" && data.database === "connected";
  } catch {
    return false;
  }
}
