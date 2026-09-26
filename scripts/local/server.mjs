import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { openSync, closeSync } from "node:fs";
import { writeFile, unlink, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  root,
  runtime,
  workerFile,
  nextCli,
  readWorker,
  run,
} from "./common.mjs";

const mode = process.argv[2];
const port = Number(process.argv[3]);
if (
  !["daily", "dev"].includes(mode) ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535
)
  throw new Error("Invalid launcher arguments");
const token = randomUUID();
let child;
let stopping = false;
async function cleanup() {
  if ((await readWorker())?.token === token) await unlink(workerFile);
}
async function stop() {
  if (stopping) return;
  stopping = true;
  if (child && child.exitCode === null && child.signalCode === null) {
    // Only our directly spawned child, never a PID supplied by a file or request.
    if (process.platform === "win32")
      await run("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        capture: true,
      }).catch((error) => {
        if (child.exitCode === null && child.signalCode === null) {
          stopping = false;
          throw error;
        }
      });
    else child.kill("SIGTERM");
  }
  await cleanup();
  server.close(() => process.exit(0));
}
const server = createServer((request, response) => {
  if (request.headers.authorization !== `Bearer ${token}`) {
    response.writeHead(403).end();
    return;
  }
  if (
    request.url !== "/status" &&
    !(request.url === "/stop" && request.method === "POST")
  ) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ root, token, port, mode }));
  if (request.url === "/stop")
    setTimeout(() => void stop().catch(console.error), 50);
});
server.listen(0, "127.0.0.1", async () => {
  const log = openSync(path.join(runtime, `${mode}.log`), "a");
  child = spawn(
    process.execPath,
    [
      nextCli,
      mode === "daily" ? "start" : "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      windowsHide: true,
      stdio: ["ignore", log, log],
      env: {
        ...process.env,
        PLANNER_MODE: mode,
        NODE_ENV: mode === "daily" ? "production" : "development",
      },
    },
  );
  closeSync(log);
  child.on("error", () => void stop());
  child.on("exit", () => void stop());
  const temporary = `${workerFile}.${token}.tmp`;
  await writeFile(
    temporary,
    JSON.stringify({ controlPort: server.address().port, token, port, mode }),
  );
  await rename(temporary, workerFile);
});
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
