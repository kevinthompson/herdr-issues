import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { commitFile, createRepository, git, temporaryFolder } from "./support/repository.js";

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
