import { describe, expect, it } from "vitest";
import path from "node:path";
import { gymConfig, gymEnvironment } from "./gym.mjs";

describe("Academia shortcut configuration", () => {
  it("is optional and resolves the Gym independently from the terminal directory", () => {
    expect(gymConfig({})).toBeNull();
    const config = gymConfig(
      { GYM_TRACKER_PATH: "../Acad" },
      path.resolve("planner"),
    );
    expect(config.directory).toBe(path.resolve("Acad"));
    expect(config.port).toBe(8501);
  });
  it.each(["3000", "0", "65536", "8501.5", "bad"])(
    "rejects conflicting or invalid port %s",
    (port) => {
      expect(() =>
        gymConfig({ GYM_TRACKER_PATH: "../Acad", GYM_TRACKER_PORT: port }),
      ).toThrow();
    },
  );
  it("does not pass the Planner database or parsing overrides to Python", () => {
    const env = gymEnvironment({
      PATH: "system",
      DATABASE_URL: "planner-db",
      database_url: "also-planner",
      PARSER_VERSION: "planner",
      GYM_IMPORT_FILE: "wrong-file",
      GYM_BACKUP_DIRECTORY: "wrong-backups",
      GYM_BACKUP_CONTAINER: "wrong-container",
      OPENAI_API_KEY: "private",
      GYM_TRACKER_USER_ID: "wrong-user",
      APP_TIMEZONE: "America/Sao_Paulo",
    });
    expect(env).toEqual({ PATH: "system", APP_TIMEZONE: "America/Sao_Paulo" });
  });
});
