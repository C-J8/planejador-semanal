import { describe, expect, it } from "vitest";
import { testDatabaseUrl, TEST_DATABASE_URL } from "./test-database.mjs";
import { assertLocalDatabase } from "./database.mjs";

describe("database safety boundaries", () => {
  it("defaults tests to their dedicated database", () =>
    expect(testDatabaseUrl()).toBe(TEST_DATABASE_URL));
  it.each([
    "postgresql://planner_test:x@127.0.0.1:5434/planner_test",
    "postgresql://planner_test:x@127.0.0.1:5435/planejador",
    "postgresql://planner_test:x@example.com:5435/planner_test",
    "postgresql://planejador:x@127.0.0.1:5435/planner_test",
    "postgresql://planner_test:x@127.0.0.1:5435/planner_test?host=production",
    "postgresql://planner_test:x@127.0.0.1:5435/planner_test?schema=personal",
  ])("rejects unsafe test target %s", (value) =>
    expect(() => testDatabaseUrl(value)).toThrow("Testes bloqueados"),
  );
  const config = {
    services: {
      db: {
        ports: [{ target: 5432, published: "5434" }],
        environment: { POSTGRES_USER: "user", POSTGRES_DB: "personal" },
      },
    },
  };
  it("backs up only the database configured in Compose", () => {
    expect(
      assertLocalDatabase(
        "postgresql://user:secret@localhost:5434/personal",
        config,
      ),
    ).toEqual({ user: "user", database: "personal" });
  });
  it.each([
    "postgresql://user:x@remote:5434/personal",
    "postgresql://user:x@localhost:5435/personal",
    "postgresql://user:x@localhost:5434/other",
    "postgresql://user:x@localhost:5434/personal?host=remote",
  ])("rejects mismatched backup target %s", (value) =>
    expect(() => assertLocalDatabase(value, config)).toThrow("nao corresponde"),
  );
});
