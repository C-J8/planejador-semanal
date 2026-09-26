export const TEST_DATABASE_URL =
  "postgresql://planner_test:planner_test_local@127.0.0.1:5435/planner_test?schema=public";

export function testDatabaseUrl(value = TEST_DATABASE_URL) {
  const url = new URL(value);
  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== "5435" ||
    url.pathname !== "/planner_test" ||
    url.username !== "planner_test" ||
    [...url.searchParams].some(
      ([key, value]) => key !== "schema" || value !== "public",
    )
  ) {
    throw new Error(
      "Testes bloqueados: use exclusivamente planner_test em localhost:5435. O banco pessoal nao pode ser usado.",
    );
  }
  return url.toString();
}
