import { testDatabaseUrl } from "./scripts/local/test-database.mjs";

// Runs before any test/service import, including direct `npx vitest` invocations.
process.env.DATABASE_URL = testDatabaseUrl(process.env.TEST_DATABASE_URL);
