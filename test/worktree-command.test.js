import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { settingsPath } from "../mod/trackers/setting.js";
import { issuesWorktreeArgs, worktreeCommandArgv, worktreeCommandTab } from "../mod/worktree-command.js";

const issue = { id: "#7", branch: "7-fix-the-list" };

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

// A login shell stand-in that runs `-lic <command>` with sh and exits at once when started as the tab's shell.
function stubLoginShell(t) {
  const shell = join(temporaryFolder(t), "login-shell");
  writeFileSync(shell, `#!/bin/sh\n[ "$1" = -l ] && exit 0\nexec sh -c "$2"\n`);
  chmodSync(shell, 0o755);
  return shell;
}

describe("the worktree command", () => {
  beforeEach(() => forgetLookups());

  test("passes the issue to issues worktree", () => {
    assert.deepEqual(issuesWorktreeArgs(issue, { spaceName: "#7 Fix", isNew: true }), [
      "worktree",
      "--branch",
      "7-fix-the-list",
      "--new",
      "--name",
      "#7 Fix",
      "--issue",
      "#7",
    ]);
  });

  test("opens a plain shell without a worktreeCommand", async (t) => {
    const repository = createRepository(temporaryFolder(t));
    writeSettings({ repos: { [repository]: { tracker: "github", repo: "owner/name" } } });
    assert.deepEqual(await worktreeCommandTab({ root: repository, on: null }, "#7"), {});
    assert.deepEqual(await worktreeCommandTab(null, "#7"), {});
  });

  test("runs the repository's worktreeCommand over the top level's", async (t) => {
    const repository = createRepository(temporaryFolder(t));
    writeSettings({
      worktreeCommand: "top <issueId>",
      repos: { [repository]: { tracker: "github", repo: "owner/name", worktreeCommand: " agent <issueId> " } },
    });
    assert.deepEqual(await worktreeCommandTab({ root: repository, on: null }, "#7"), {
      argv: worktreeCommandArgv("agent <issueId>", "#7"),
    });
  });

  test("runs the top level's worktreeCommand when the repository's is blank", async (t) => {
    const repository = createRepository(temporaryFolder(t));
    writeSettings({
      worktreeCommand: "top <issueId>",
      repos: { [repository]: { tracker: "github", repo: "owner/name", worktreeCommand: "  " } },
    });
    assert.deepEqual(await worktreeCommandTab({ root: repository, on: null }, "#7"), {
      argv: worktreeCommandArgv("top <issueId>", "#7"),
    });
  });

  test("hands the command the issue's ID as text, quoted or not", (t) => {
    const output = join(temporaryFolder(t), "output");
    const argv = worktreeCommandArgv(`printf '%s|%s' <issueId> "work <issueId>" > '${output}'`, "#41");
    const result = spawnSync(argv[0], argv.slice(1), { env: { ...process.env, SHELL: stubLoginShell(t) } });
    assert.equal(result.status, 0, String(result.stderr));
    assert.equal(readFileSync(output, "utf8"), "#41|work #41");
  });
});
