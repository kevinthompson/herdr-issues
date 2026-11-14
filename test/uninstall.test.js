import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { git, temporaryFolder } from "./support/repository.js";

const repositoryFile = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const checkoutFiles = ["uninstall", "scripts/setup-json.js", "mod/keys.json"];
const modKeys = JSON.parse(readFileSync(repositoryFile("mod/keys.json"), "utf8"));

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
};
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const isLink = (path) => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};

// A committed checkout holding what uninstall runs, at `path`.
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

// A claude that logs each command and lists the plugin and marketplace while they're installed.
function stubClaude(bin, log) {
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "claude"),
    `#!/bin/sh
echo "$*" >>"${log}"
case "$*" in
  "plugin list --json") [ -e "${log}.plugin" ] && echo '[{"id":"issues@herdr-issues"}]' || echo '[]' ;;
  "plugin marketplace list --json") [ -e "${log}.plugin" ] && echo '[{"name":"herdr-issues","path":"/somewhere"}]' || echo '[]' ;;
  "plugin marketplace remove herdr-issues") rm -f "${log}.plugin" ;;
esac
`,
    { mode: 0o755 },
  );
  writeFileSync(`${log}.plugin`, "");
}

// A home folder with this checkout installed as setup leaves it, and a Herdr app home inside it.
function installedHome(folder, { checkout } = {}) {
  const home = join(folder, "home");
  const appHome = join(home, ".config/herdr-app");
  checkout = createCheckout(checkout ?? join(folder, "clone"));
  mkdirSync(join(appHome, "mods"), { recursive: true });
  symlinkSync(join(checkout, "mod"), join(appHome, "mods/issues"));
  mkdirSync(join(home, ".local/bin"), { recursive: true });
  symlinkSync(join(checkout, "bin/issues"), join(home, ".local/bin/issues"));
  writeJson(join(appHome, "keys.json"), { global: { "cmd-k": "palette", ...modKeys.global }, "mod:issues": modKeys["mod:issues"] });
  writeJson(join(appHome, "issues.json"), { repos: {} });
  writeJson(join(appHome, "linear.json"), { apiKey: "key" });
  writeJson(join(appHome, "data/issues/lists/one.json"), []);
  const bin = join(folder, "bin");
  const log = join(folder, "claude.log");
  stubClaude(bin, log);
  return { home, appHome, checkout, bin, log };
}

const toolFolders = [...new Set(["node", "git"].map((tool) => dirname(execFileSync("which", [tool], { encoding: "utf8" }).trim())))];

const runUninstall = (checkout, { home, appHome, bin }) =>
  spawnSync(join(checkout, "uninstall"), {
    encoding: "utf8",
    input: "",
    env: { HOME: home, HERDR_APP_HOME: appHome, PATH: [bin, ...toolFolders, "/usr/bin", "/bin"].join(":") },
  });

// Runs uninstall on a pseudo-terminal, answering each [y/N] question with the next answer. Node has no
// pseudo-terminal of its own, so Python's pty module drives it.
const answerInTerminal = `
import os, pty, sys
answers = sys.argv[2:]
pid, fd = pty.fork()
if pid == 0:
    os.execv(sys.argv[1], [sys.argv[1]])
output = b""
while True:
    try:
        chunk = os.read(fd, 1024)
    except OSError:
        break
    if not chunk:
        break
    output += chunk
    sys.stdout.buffer.write(chunk)
    while answers and b"[y/N]" in output:
        output = output.split(b"[y/N]", 1)[1]
        os.write(fd, (answers.pop(0) + "\\n").encode())
sys.exit(os.waitstatus_to_exitcode(os.waitpid(pid, 0)[1]))
`;
const python = spawnSync("python3", ["-c", "import pty"]).status === 0;

const runUninstallInTerminal = (checkout, { home, appHome, bin }, answers) =>
  spawnSync("python3", ["-c", answerInTerminal, join(checkout, "uninstall"), ...answers], {
    encoding: "utf8",
    env: { HOME: home, HERDR_APP_HOME: appHome, PATH: [bin, ...toolFolders, "/usr/bin", "/bin"].join(":") },
  });

const issuesBlock = { id: "issues", type: "block", content: { mod: "issues" } };
const layoutWith = (...extra) => ({ id: "root", children: [{ id: "main" }, { id: "panel", children: [{ id: "panel-body" }] }, ...extra] });

test("uninstall removes the links into the checkout, the mod's keys and the plugin", (t) => {
  const installed = installedHome(temporaryFolder(t));

  const result = runUninstall(installed.checkout, installed);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(isLink(join(installed.appHome, "mods/issues")), false);
  assert.equal(isLink(join(installed.home, ".local/bin/issues")), false);
  assert.deepEqual(readJson(join(installed.appHome, "keys.json")), { global: { "cmd-k": "palette" } });
  assert.match(readFileSync(installed.log, "utf8"), /plugin uninstall issues@herdr-issues\nplugin marketplace list --json\nplugin marketplace remove herdr-issues/);
  assert.equal(existsSync(installed.checkout), true);
});

test("uninstall leaves links into another checkout and keys the person rebound", (t) => {
  const folder = temporaryFolder(t);
  const installed = installedHome(folder);
  const other = createCheckout(join(folder, "other"));
  const keys = { global: { "cmd-shift-i": "other.action" } };
  writeJson(join(installed.appHome, "keys.json"), keys);

  const result = runUninstall(other, installed);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(isLink(join(installed.appHome, "mods/issues")), true);
  assert.equal(isLink(join(installed.home, ".local/bin/issues")), true);
  assert.match(result.stdout, /Left .*mods\/issues, which points to .*clone\/mod, not this checkout/);
  assert.deepEqual(readJson(join(installed.appHome, "keys.json")), keys);
});

test("uninstall keeps the layouts, settings and cached data without a terminal and says how to remove them", (t) => {
  const installed = installedHome(temporaryFolder(t));
  const layout = layoutWith({ id: "issues-panel", type: "column", children: [issuesBlock] });
  writeJson(join(installed.appHome, "layouts/mine.json"), layout);

  const result = runUninstall(installed.checkout, installed);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readJson(join(installed.appHome, "layouts/mine.json")), layout);
  for (const kept of ["issues.json", "linear.json", "data/issues"]) assert.equal(existsSync(join(installed.appHome, kept)), true);
  assert.match(result.stdout, /Kept:\n- the Issues panel in .*mine\.json.*\n- the settings in .*; delete them with: rm .*issues\.json .*linear\.json\n- the cached lists and avatars in .*; delete them with: rm -r .*data\/issues/);
});

test("uninstall answered yes removes the panel from layouts, leaving their other nodes, and deletes settings and data", { skip: !python && "needs python3 for a pseudo-terminal" }, (t) => {
  const installed = installedHome(temporaryFolder(t));
  writeJson(join(installed.appHome, "layouts/mine.json"), layoutWith({ id: "issues-panel", type: "column", children: [issuesBlock] }));

  const result = runUninstallInTerminal(installed.checkout, installed, ["y", "y", "y"]);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(readJson(join(installed.appHome, "layouts/mine.json")), layoutWith());
  for (const deleted of ["issues.json", "linear.json", "data/issues"]) assert.equal(existsSync(join(installed.appHome, deleted)), false);
});

test("uninstall never asks about a layout Herdr ships", (t) => {
  const installed = installedHome(temporaryFolder(t));
  writeJson(join(installed.appHome, "installed.json"), { "layout:main": {} });
  writeJson(join(installed.appHome, "layouts/main.json"), layoutWith(issuesBlock));

  const result = runUninstall(installed.checkout, installed);

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Issues panel in/);
});

test("uninstall run again reports there is nothing left to remove", (t) => {
  const installed = installedHome(temporaryFolder(t));
  runUninstall(installed.checkout, installed);

  const result = runUninstall(installed.checkout, installed);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Nothing left to remove\.\n$/);
});

test("uninstall skips the plugin when claude isn't installed", (t) => {
  const folder = temporaryFolder(t);
  const installed = installedHome(folder);

  const result = runUninstall(installed.checkout, { ...installed, bin: join(folder, "no-bin") });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipped the Claude plugin: claude is not installed/);
});

test("uninstall deletes the install command's checkout last and finishes cleanly", (t) => {
  const folder = temporaryFolder(t);
  const installed = installedHome(folder, { checkout: join(folder, "home/.local/share/herdr-issues-mod") });

  const result = runUninstall(installed.checkout, installed);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(existsSync(installed.checkout), false);
  assert.match(result.stdout, /Deleted .*herdr-issues-mod\n/);
});

test("uninstall refuses in a linked worktree and changes nothing", (t) => {
  const folder = temporaryFolder(t);
  const installed = installedHome(folder);
  const worktree = join(folder, "worktree");
  git(installed.checkout, "worktree", "add", "-q", "-b", "feature", worktree);
  const keys = readFileSync(join(installed.appHome, "keys.json"), "utf8");

  const result = runUninstall(worktree, installed);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /is a linked worktree/);
  assert.equal(isLink(join(installed.appHome, "mods/issues")), true);
  assert.equal(readFileSync(join(installed.appHome, "keys.json"), "utf8"), keys);
  assert.equal(existsSync(`${installed.log}.plugin`), true);
});
