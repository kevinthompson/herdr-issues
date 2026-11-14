import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { git, temporaryFolder } from "./support/repository.js";

const bootstrapScript = readFileSync(fileURLToPath(new URL("../bootstrap", import.meta.url)), "utf8");

// Records that it ran and whether its standard input was a terminal, then exits with `status`.
const recordingInstall = (status = 0) =>
  `#!/bin/sh\nif [ -t 0 ]; then t=terminal; else t=no-terminal; fi\necho "install ran, $t" >"$(dirname "$0")/../install-ran"\nexit ${status}\n`;

function originWithInstall(folder) {
  const seed = join(folder, "seed");
  git(folder, "init", "-q", "-b", "main", seed);
  writeFileSync(join(seed, "install"), recordingInstall(), { mode: 0o755 });
  git(seed, "add", ".");
  git(seed, "commit", "-q", "-m", "first");
  const origin = join(folder, "origin.git");
  git(folder, "clone", "-q", "--bare", seed, origin);
  return origin;
}

// Pipes the script into bash, as curl does, with no controlling terminal.
const runBootstrap = (home, repositoryUrl) =>
  spawnSync("bash", {
    encoding: "utf8",
    input: bootstrapScript,
    detached: true,
    env: { ...process.env, HOME: home, HERDR_ISSUES_REPOSITORY_URL: repositoryUrl },
  });

test("bootstrap clones the repository into the home folder and runs its install", (t) => {
  const folder = temporaryFolder(t);
  const origin = originWithInstall(folder);
  const home = join(folder, "home");
  mkdirSync(home);

  const result = runBootstrap(home, origin);

  assert.equal(result.status, 0, result.stderr);
  const checkout = join(home, ".local/share/herdr-issues");
  assert.equal(git(checkout, "rev-parse", "HEAD"), git(origin, "rev-parse", "main"));
  assert.equal(readFileSync(join(home, ".local/share/install-ran"), "utf8"), "install ran, no-terminal\n");
});

test("bootstrap runs an existing checkout's install without changing it, exiting with its status", (t) => {
  const folder = temporaryFolder(t);
  const home = join(folder, "home");
  const checkout = join(home, ".local/share/herdr-issues");
  mkdirSync(checkout, { recursive: true });
  writeFileSync(join(checkout, "install"), recordingInstall(3), { mode: 0o755 });

  const result = runBootstrap(home, join(folder, "missing.git"));

  assert.equal(result.status, 3, result.stderr);
  assert.deepEqual(readdirSync(checkout), ["install"]);
  assert.equal(readFileSync(join(home, ".local/share/install-ran"), "utf8"), "install ran, no-terminal\n");
});

test("bootstrap changes nothing when the clone fails", (t) => {
  const folder = temporaryFolder(t);
  const home = join(folder, "home");
  mkdirSync(home);

  const result = runBootstrap(home, join(folder, "missing.git"));

  assert.equal(result.status, 1);
  assert.match(result.stderr, /couldn't clone .*the repository must be reachable/);
  assert.equal(existsSync(join(home, ".local/share/herdr-issues")), false);
});
