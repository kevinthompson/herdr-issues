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

function openWorktree(root, bin, branch) {
  const result = spawnSync(process.execPath, [issuesCli, "worktree", "--branch", branch], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: [bin, dirname(process.execPath), gitFolder, "/usr/bin", "/bin"].join(":") },
  });
  assert.equal(result.status, 0, result.stderr);
}

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
