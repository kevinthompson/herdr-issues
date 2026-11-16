import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { settingsPath } from "../mod/trackers/setting.js";

const issuesCli = fileURLToPath(new URL("../bin/issues", import.meta.url));
const gitFolder = dirname(spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim());

// Stub herdr-app and hc programs for a running app whose spaces are `spaces`: `herdr-app do` appends its action and
// parameters to the calls file instead of changing any window.
function stubApp(t, spaces) {
  const folder = temporaryFolder(t), bin = join(folder, "bin"), calls = join(folder, "calls");
  mkdirSync(bin);
  writeFileSync(join(folder, "spaces.json"), JSON.stringify({ spaces }));
  writeFileSync(calls, "");
  const scripts = {
    "herdr-app": `case "$1" in
  ls) cat '${join(folder, "spaces.json")}' ;;
  --version) echo "herdr-app 0.2.0" ;;
  do) printf '%s\\t%s\\n' "$2" "$3" >> '${calls}' ;;
esac`,
    hc: `echo '{"terminals":[]}'`,
  };
  for (const [name, script] of Object.entries(scripts)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${script}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  const spacesOpened = () => readFileSync(calls, "utf8").split("\n").filter(Boolean)
    .map((line) => line.split("\t")).filter(([action]) => action === "space.new")
    .map(([, params]) => { const { folder: opened, name } = JSON.parse(params); return { folder: opened, name }; });
  return { bin, spacesOpened };
}

function repository(t, entry) {
  const root = createRepository(temporaryFolder(t), { name: "checkout" });
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify({ repos: { [root]: entry } }));
  return root;
}

function runWorktree(root, bin, args) {
  const result = spawnSync(process.execPath, [issuesCli, "worktree", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: [bin, dirname(process.execPath), gitFolder, "/usr/bin", "/bin"].join(":") },
  });
  assert.equal(result.status, 0, result.stderr);
}

const openWorktree = (root, bin, branch) => runWorktree(root, bin, ["--branch", branch]);

const worktreeFolder = (branch) => join(process.env.HOME, ".herdr/worktrees/checkout", branch);

test("issues worktree names the space it opens on the main checkout with the repository's name", (t) => {
  const root = repository(t, { tracker: "github", repo: "owner/name" });
  const { bin, spacesOpened } = stubApp(t, []);

  openWorktree(root, bin, "default-name");

  assert.deepEqual(spacesOpened(), [
    { folder: root, name: "name" },
    { folder: worktreeFolder("default-name"), name: "default-name" },
  ]);
});

test("issues worktree names the main checkout's space with the name setting", (t) => {
  const root = repository(t, { tracker: "beads", name: "Set Name" });
  const { bin, spacesOpened } = stubApp(t, []);

  openWorktree(root, bin, "set-name");

  assert.deepEqual(spacesOpened(), [
    { folder: root, name: "Set Name" },
    { folder: worktreeFolder("set-name"), name: "set-name" },
  ]);
});

test("issues worktree finds a named space on the main checkout by its folder and opens no other", (t) => {
  const root = repository(t, { tracker: "beads", name: "Set Name" });
  const { bin, spacesOpened } = stubApp(t, [{ id: "s1", name: "Set Name", folder: root, tabs: [] }]);

  openWorktree(root, bin, "existing-space");

  assert.deepEqual(spacesOpened(), [{ folder: worktreeFolder("existing-space"), name: "existing-space" }]);
});

const WORKING = "\u{F0131}";

// A gh program whose GitHub Issues hold only issue #7, open, unassigned, unblocked and titled `title`.
function stubGh(bin, title) {
  const issue = {
    number: 7, title, url: "https://github.com/owner/name/issues/7", body: "", createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z", closedAt: null, state: "OPEN", stateReason: null, milestone: null,
    labels: { nodes: [] }, assignees: { nodes: [] }, blockedBy: { nodes: [] }, closedByPullRequestsReferences: { nodes: [] },
  };
  writeFileSync(join(bin, "issue.json"), JSON.stringify({ data: { repository: { issue } } }));
  writeFileSync(join(bin, "gh"), `#!/bin/sh\ncat '${join(bin, "issue.json")}'\n`);
  chmodSync(join(bin, "gh"), 0o755);
}

test("issues worktree <id> opens the issue's space marked working", (t) => {
  const root = repository(t, { tracker: "github", repo: "owner/name", spaceName: "<repo> <issueId>" });
  const { bin, spacesOpened } = stubApp(t, [{ id: "s1", name: "name", folder: root, tabs: [] }]);
  stubGh(bin, "Mark it");

  runWorktree(root, bin, ["#7"]);

  assert.deepEqual(spacesOpened(), [{ folder: worktreeFolder("7-mark-it"), name: `${WORKING} name #7` }]);
});

test("issues worktree <id> --name marks the name it's given, replacing any mark", (t) => {
  const root = repository(t, { tracker: "github", repo: "owner/name" });
  const { bin, spacesOpened } = stubApp(t, [{ id: "s1", name: "name", folder: root, tabs: [] }]);
  stubGh(bin, "Name it");

  runWorktree(root, bin, ["#7", "--name", "\u{F0132} Chosen"]);

  assert.deepEqual(spacesOpened(), [{ folder: worktreeFolder("7-name-it"), name: `${WORKING} Chosen` }]);
});

test("issues worktree <id> selects a space already open on the branch without renaming it", (t) => {
  const root = repository(t, { tracker: "github", repo: "owner/name" });
  const { bin, spacesOpened } = stubApp(t, [{ id: "s1", name: "name", folder: root, tabs: [] }]);
  stubGh(bin, "Keep it");
  runWorktree(root, bin, ["#7"]);
  writeFileSync(join(bin, "..", "spaces.json"), JSON.stringify({ spaces: [
    { id: "s1", name: "name", folder: root, tabs: [] },
    { id: "s2", name: "#7", folder: worktreeFolder("7-keep-it"), tabs: [] },
  ] }));

  runWorktree(root, bin, ["#7"]);

  assert.equal(spacesOpened().length, 1);
});
