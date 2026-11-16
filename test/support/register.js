// Loaded with --import before every test file: points the mod's `herdr` imports at test/support/herdr.js,
// which wraps the issues CLI's shim, and its `gpui-kit` and `gpui-base` imports at test/support/gpui.js, and
// gives the process a temporary home so neither the tests nor the git they run read or write the person's home
// folder, git configuration or ~/.config/herdr-app. A stand-in for
// macOS's `security` comes first on the PATH, so nothing they run reads or writes the person's Keychain.
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fakeSecurityFolder } from "./keychain.js";

const temporaryHome = realpathSync(mkdtempSync(join(tmpdir(), "herdr-issues-test-home-")));
process.on("exit", () => rmSync(temporaryHome, { recursive: true, force: true }));

Object.assign(process.env, {
  PATH: [fakeSecurityFolder, process.env.PATH].join(delimiter),
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
const gpuiForTests = new URL("./gpui.js", import.meta.url).href;
registerHooks({
  resolve: (specifier, context, nextResolve) => {
    if (specifier === "herdr") return { url: herdrForTests, shortCircuit: true };
    if (specifier === "gpui-kit" || specifier === "gpui-base") return { url: gpuiForTests, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
