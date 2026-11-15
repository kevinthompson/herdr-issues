import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { git, temporaryFolder } from "./support/repository.js";

const repositoryFile = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const checkoutFiles = ["setup", "scripts/setup-json.js", "mod/keys.json"];
const modKeys = JSON.parse(readFileSync(repositoryFile("mod/keys.json"), "utf8"));

// A committed main checkout holding what setup runs, at `path`.
function createCheckout(path) {
  mkdirSync(path, { recursive: true });
  git(path, "init", "-q", "-b", "main");
  for (const file of checkoutFiles) {
    mkdirSync(dirname(join(path, file)), { recursive: true });
    copyFileSync(repositoryFile(file), join(path, file));
  }
  git(path, "add", ".");
  git(path, "commit", "-q", "-m", "first");
  return path;
}

// A folder for PATH holding node, git and a stub herdr-app, and nothing else, so claude can't be found.
function binWithoutClaude(folder) {
  const bin = join(folder, "bin");
  mkdirSync(bin, { recursive: true });
  for (const tool of ["node", "git"]) symlinkSync(execFileSync("which", [tool], { encoding: "utf8" }).trim(), join(bin, tool));
  writeFileSync(join(bin, "herdr-app"), "#!/bin/sh\necho herdr-app 1.0.0\n", { mode: 0o755 });
  return bin;
}

test("setup installs the mod, the CLI and the keys without claude, and warns that it skipped the plugin", (t) => {
  const folder = temporaryFolder(t);
  const checkout = createCheckout(join(folder, "clone"));
  const home = join(folder, "home");
  const appHome = join(home, ".config/herdr-app");
  mkdirSync(join(appHome, "layouts"), { recursive: true });
  writeFileSync(join(appHome, "keys.json"), JSON.stringify({ global: { "cmd-k": "palette" } }));

  const result = spawnSync(join(checkout, "setup"), {
    encoding: "utf8",
    input: "",
    env: { HOME: home, HERDR_APP_HOME: appHome, PATH: [binWithoutClaude(folder), "/usr/bin", "/bin"].join(":") },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readlinkSync(join(appHome, "mods/issues")), join(checkout, "mod"));
  assert.equal(lstatSync(join(home, ".local/bin/issues")).isSymbolicLink(), true);
  assert.deepEqual(JSON.parse(readFileSync(join(appHome, "keys.json"), "utf8")).global, { "cmd-k": "palette", ...modKeys.global });
  assert.match(result.stdout, /To show the Issues panel/);
  assert.match(result.stderr, /claude is not installed, so the Claude plugin .* was skipped; install Claude Code and run setup again/);
});

test("setup adds the marketplace and installs the plugin when claude is installed", (t) => {
  const folder = temporaryFolder(t);
  const checkout = createCheckout(join(folder, "clone"));
  const home = join(folder, "home");
  const appHome = join(home, ".config/herdr-app");
  const bin = binWithoutClaude(folder);
  const log = join(folder, "claude.log");
  writeFileSync(join(bin, "claude"), `#!/bin/sh\necho "$*" >>"${log}"\ncase "$*" in *--json) echo '[]' ;; esac\n`, { mode: 0o755 });

  const result = spawnSync(join(checkout, "setup"), {
    encoding: "utf8",
    input: "",
    env: { HOME: home, HERDR_APP_HOME: appHome, PATH: [bin, "/usr/bin", "/bin"].join(":") },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(log, "utf8"), new RegExp(`plugin marketplace add ${checkout}\\n(.*\\n)*plugin install issues@herdr-issues\\n`));
  assert.doesNotMatch(result.stderr, /Claude plugin .* was skipped/);
});
