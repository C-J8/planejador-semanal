import { createHash } from "node:crypto";
import {
  readFile,
  readdir,
  mkdir,
  writeFile,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";

const inputs = [
  "src",
  "public",
  "prisma/schema.prisma",
  "prisma/migrations",
  "prisma.config.ts",
  "package.json",
  "package-lock.json",
  "node_modules/.package-lock.json",
  "next.config.ts",
  "next.config.mjs",
  "next.config.js",
  "tsconfig.json",
  "postcss.config.mjs",
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];
const stampPath = (root) => path.join(root, ".planner", "build.json");
async function optionalRead(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function sourceFingerprint(root, env = process.env) {
  const hash = createHash("sha256");
  hash.update(`planner-build-v1:${process.version}\0`);
  const files = [];
  async function collect(relative) {
    if (
      relative === "src/generated" ||
      /\.(?:unit|integration)\.test\./.test(relative)
    )
      return;
    let entries;
    try {
      entries = await readdir(path.join(root, relative), {
        withFileTypes: true,
      });
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        files.push(relative);
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink())
        throw new Error(
          "Links simbolicos nos arquivos do aplicativo nao sao suportados pelo preparo automatico.",
        );
      await collect(`${relative}/${entry.name}`);
    }
  }
  for (const input of inputs) await collect(input);
  for (const file of files.sort()) {
    const data = await optionalRead(path.join(root, file));
    hash.update(`${file}\0${data?.length ?? -1}\0`);
    if (data) hash.update(data);
  }
  // Only a digest is stored: never copy credentials or .env contents into the stamp.
  for (const key of Object.keys(env)
    .filter(
      (key) =>
        key.startsWith("NEXT_PUBLIC_") ||
        ["DATABASE_URL", "APP_TIMEZONE", "CHESS_COM_USER_AGENT"].includes(key),
    )
    .sort()) {
    hash.update(`${key}\0${env[key]}\0`);
  }
  return hash.digest("hex");
}

export async function needsPreparation(root, fingerprint) {
  const buildId = await optionalRead(
    path.join(root, ".next-daily", "BUILD_ID"),
  );
  const raw = await optionalRead(stampPath(root));
  if (!buildId || !raw) return true;
  try {
    const stamp = JSON.parse(raw.toString());
    return (
      stamp.fingerprint !== fingerprint ||
      stamp.buildId !== buildId.toString().trim()
    );
  } catch {
    return true;
  }
}

export async function invalidateBuild(root) {
  await unlink(stampPath(root)).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}

export async function recordBuild(root, fingerprint) {
  const buildId = await optionalRead(
    path.join(root, ".next-daily", "BUILD_ID"),
  );
  if (!buildId?.toString().trim())
    throw new Error("Compilacao nao produziu uma versao valida.");
  await mkdir(path.dirname(stampPath(root)), { recursive: true });
  const temporary = `${stampPath(root)}.tmp`;
  await writeFile(
    temporary,
    JSON.stringify({ fingerprint, buildId: buildId.toString().trim() }),
  );
  await rename(temporary, stampPath(root));
}
