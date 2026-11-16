import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { commitFile, createRepository, git, temporaryFolder } from "./support/repository.js";
import { settingsPath } from "../mod/trackers/setting.js";

const issuesCli = fileURLToPath(new URL("../bin/issues", import.meta.url));
const gitFolder = dirname(spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim());

// Runs the issues CLI where herdr-app and hc can't be found, so no test opens a space in the person's window.
const runIssues = (cwd, args) => spawnSync(process.execPath, [issuesCli, ...args], {
  cwd,
  encoding: "utf8",
  env: { ...process.env, PATH: [dirname(process.execPath), gitFolder, "/usr/bin", "/bin"].join(":") },
});

test("issues worktree opens an existing branch of a repository without origin", (t) => {
  const repository = createRepository(temporaryFolder(t));
  git(repository, "switch", "-q", "-c", "feature");
  commitFile(repository, "feature.txt", "work\n");
  git(repository, "switch", "-q", "main");

  const result = runIssues(repository, ["worktree", "--branch", "feature"]);

  assert.equal(result.status, 0, result.stderr);
  const worktree = join(process.env.HOME, ".herdr/worktrees/repo/feature");
  assert.ok(existsSync(join(worktree, "feature.txt")));
});

test("issues worktree starts a new branch from main in a repository without origin", (t) => {
  const repository = createRepository(temporaryFolder(t));

  const result = runIssues(repository, ["worktree", "--branch", "new-work"]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(repository, "rev-parse", "new-work"), git(repository, "rev-parse", "main"));
});

// A repository tracked in GitHub Issues whose stubbed gh holds only issue #7, unassigned and unblocked, with the
// given pull requests; each change gh is asked to make is recorded, and fails when `refuseChanges` is set.
function githubRepository(t, title, { pullRequests = [], refuseChanges = false } = {}) {
  const repository = createRepository(temporaryFolder(t));
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify({ repos: { [repository]: { tracker: "github", repo: "owner/name" } } }));
  const issue = {
    number: 7, title, url: "https://github.com/owner/name/issues/7", body: "", createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z", closedAt: null, state: "OPEN", stateReason: null, milestone: null,
    labels: { nodes: [] }, assignees: { nodes: [] }, blockedBy: { nodes: [] }, closedByPullRequestsReferences: { nodes: pullRequests },
  };
  const bin = join(temporaryFolder(t), "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "issue.json"), JSON.stringify({ data: { repository: { issue } } }));
  const changes = join(bin, "changes");
  writeFileSync(changes, "");
  writeFileSync(join(bin, "gh"), `#!/bin/sh
case "$2" in
  graphql) cat '${join(bin, "issue.json")}' ;;
  user) echo person ;;
  -X) echo "$3 $4" >> '${changes}'; ${refuseChanges ? "echo 'HTTP 403' >&2; exit 1" : "echo '{}'"} ;;
esac
`);
  chmodSync(join(bin, "gh"), 0o755);
  const run = (args) => spawnSync(process.execPath, [issuesCli, ...args], {
    cwd: repository,
    encoding: "utf8",
    env: { ...process.env, PATH: [bin, dirname(process.execPath), gitFolder, "/usr/bin", "/bin"].join(":") },
  });
  return { repository, run, changesMade: () => readFileSync(changes, "utf8").split("\n").filter(Boolean) };
}

test("issues worktree <id> marks a todo issue in progress before opening its worktree", (t) => {
  const { run, changesMade } = githubRepository(t, "Start it");

  const result = run(["worktree", "#7"]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(changesMade(), ["POST repos/owner/name/issues/7/assignees"]);
  assert.match(result.stdout, /Started #7/);
  assert.ok(existsSync(join(process.env.HOME, ".herdr/worktrees/repo/7-start-it")));
});

test("issues worktree <id> leaves an issue in review as it is", (t) => {
  const pullRequest = {
    number: 8, title: "Review it", url: "https://github.com/owner/name/pull/8", state: "OPEN", isDraft: false,
    headRefName: "7-reviewed", repository: { nameWithOwner: "owner/name" },
  };
  const { repository, run, changesMade } = githubRepository(t, "Review it", { pullRequests: [pullRequest] });
  git(repository, "branch", "7-reviewed");

  const result = run(["worktree", "#7"]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(changesMade(), []);
  assert.ok(existsSync(join(process.env.HOME, ".herdr/worktrees/repo/7-reviewed")));
});

test("issues worktree <id> warns when the start is refused and still opens the worktree", (t) => {
  const { run } = githubRepository(t, "Refuse it", { refuseChanges: true });

  const result = run(["worktree", "#7"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /couldn't mark #7 in progress/);
  assert.ok(existsSync(join(process.env.HOME, ".herdr/worktrees/repo/7-refuse-it")));
});

test("issues worktree copies the main checkout's local Claude settings into a new worktree", (t) => {
  const repository = createRepository(temporaryFolder(t));
  mkdirSync(join(repository, ".claude"));
  writeFileSync(join(repository, ".claude/settings.local.json"), '{ "disableClaudeAiConnectors": true }\n');

  const result = runIssues(repository, ["worktree", "--branch", "local-settings"]);

  assert.equal(result.status, 0, result.stderr);
  const worktree = join(process.env.HOME, ".herdr/worktrees/repo/local-settings");
  assert.equal(readFileSync(join(worktree, ".claude/settings.local.json"), "utf8"), '{ "disableClaudeAiConnectors": true }\n');
});
