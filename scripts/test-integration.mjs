import path from "node:path";
import { root, run, dockerReady, prismaCli } from "./local/common.mjs";
import { testDatabaseUrl } from "./local/test-database.mjs";

async function main() {
  const { config } = await import("dotenv");
  config({ path: path.join(root, ".env"), quiet: true });
  const url = testDatabaseUrl(process.env.TEST_DATABASE_URL);
  const env = {
    ...process.env,
    DATABASE_URL: url,
    TEST_DATABASE_URL: url,
    NODE_ENV: "test",
  };
  await dockerReady();
  await run("docker", [
    "compose",
    "-f",
    "compose.test.yaml",
    "up",
    "-d",
    "--wait",
    "--wait-timeout",
    "90",
  ]);
  await run(process.execPath, [prismaCli, "migrate", "deploy"], { env });
  // Legacy suites assert preservation of these three baseline fixtures.
  // This command receives ONLY the validated, disposable test URL.
  await run(process.execPath, [prismaCli, "db", "seed"], { env });
  await run(
    process.execPath,
    [
      path.join(root, "node_modules/vitest/vitest.mjs"),
      "run",
      "--config",
      "vitest.integration.config.mts",
      ...process.argv.slice(2),
    ],
    { env },
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
