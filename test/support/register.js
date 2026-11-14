// Loaded with --import before every test file: points the mod's `herdr` imports at test/support/herdr.js,
// which wraps the issues CLI's shim, and gives the process a temporary home so neither the tests nor the git
// they run read or write the person's home folder, git configuration or ~/.config/herdr-app.
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryHome = realpathSync(mkdtempSync(join(tmpdir(), "herdr-issues-test-home-")));
process.on("exit", () => rmSync(temporaryHome, { recursive: true, force: true }));

Object.assign(process.env, {
  HOME: temporaryHome,
  HERDR_APP_HOME: join(temporaryHome, ".config/herdr-app"),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
});

const herdrForTests = new URL("./herdr.js", import.meta.url).href;
registerHooks({
  resolve: (specifier, context, nextResolve) =>
    specifier === "herdr" ? { url: herdrForTests, shortCircuit: true } : nextResolve(specifier, context),
});
