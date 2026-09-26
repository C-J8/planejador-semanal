import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  readFile,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  sourceFingerprint,
  needsPreparation,
  recordBuild,
  invalidateBuild,
} from "./build-state.mjs";
const directories = [];
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "planner-fingerprint-"));
  directories.push(root);
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, ".next-daily"));
  await writeFile(path.join(root, "src/page.tsx"), "first version");
  await writeFile(path.join(root, ".next-daily/BUILD_ID"), "build-one");
  return root;
}
afterEach(async () => {
  for (const root of directories.splice(0)) {
    if (
      path.dirname(root) !== tmpdir() ||
      !path.basename(root).startsWith("planner-fingerprint-")
    )
      throw new Error("Unsafe test directory");
    await rm(root, { recursive: true });
  }
});
describe("automatic local build", () => {
  it("requires one initial prepare, then reuses unchanged code", async () => {
    const root = await fixture();
    const hash = await sourceFingerprint(root, {});
    expect(await needsPreparation(root, hash)).toBe(true);
    await recordBuild(root, hash);
    expect(
      await needsPreparation(root, await sourceFingerprint(root, {})),
    ).toBe(false);
  });
  it("detects edits, additions and removals by content", async () => {
    const root = await fixture();
    const first = await sourceFingerprint(root, {});
    await writeFile(path.join(root, "src/page.tsx"), "other version");
    expect(await sourceFingerprint(root, {})).not.toBe(first);
    await writeFile(path.join(root, "src/page.tsx"), "first version");
    expect(await sourceFingerprint(root, {})).toBe(first);
    await writeFile(path.join(root, "src/new.ts"), "new");
    expect(await sourceFingerprint(root, {})).not.toBe(first);
    await unlink(path.join(root, "src/new.ts"));
    expect(await sourceFingerprint(root, {})).toBe(first);
  });
  it("ignores documentation, tests, logs, backups and generated client", async () => {
    const root = await fixture();
    const first = await sourceFingerprint(root, {});
    await mkdir(path.join(root, "src/generated"));
    await writeFile(path.join(root, "src/generated/client.ts"), "generated");
    await writeFile(path.join(root, "src/example.unit.test.ts"), "test");
    await writeFile(path.join(root, "README.md"), "guide");
    for (const name of [".planner", "backups"]) {
      await mkdir(path.join(root, name));
      await writeFile(path.join(root, name, "output"), "runtime");
    }
    expect(await sourceFingerprint(root, {})).toBe(first);
  });
  it("detects env, dependency and migration changes without storing secrets", async () => {
    const root = await fixture();
    let hash = await sourceFingerprint(root, {});
    for (const name of [
      ".env",
      "package-lock.json",
      "prisma/migrations/one/migration.sql",
    ]) {
      await mkdir(path.dirname(path.join(root, name)), { recursive: true });
      await writeFile(path.join(root, name), "private-value");
      const changed = await sourceFingerprint(root, {});
      expect(changed).not.toBe(hash);
      hash = changed;
    }
    expect(
      await sourceFingerprint(root, { NEXT_PUBLIC_TITLE: "new" }),
    ).not.toBe(hash);
    await recordBuild(root, hash);
    expect(
      await readFile(path.join(root, ".planner/build.json"), "utf8"),
    ).not.toContain("private-value");
  });
  it("does not reuse failed, deleted or externally replaced builds", async () => {
    const root = await fixture();
    const hash = await sourceFingerprint(root, {});
    await recordBuild(root, hash);
    await invalidateBuild(root);
    expect(await needsPreparation(root, hash)).toBe(true);
    await recordBuild(root, hash);
    await writeFile(path.join(root, ".next-daily/BUILD_ID"), "other-build");
    expect(await needsPreparation(root, hash)).toBe(true);
    await unlink(path.join(root, ".next-daily/BUILD_ID"));
    expect(await needsPreparation(root, hash)).toBe(true);
  });
});
