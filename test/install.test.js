import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { commitFile, git, temporaryFolder } from "./support/repository.js";

const installScript = fileURLToPath(new URL("../install", import.meta.url));
const terminalOutputScript = fileURLToPath(new URL("../scripts/terminal-output.sh", import.meta.url));

// A clone of an origin whose main holds the install script and a setup that records it ran.
function installedCheckout(folder) {
  const seed = join(folder, "seed");
  git(folder, "init", "-q", "-b", "main", seed);
  copyFileSync(installScript, join(seed, "install"));
  mkdirSync(join(seed, "scripts"));
  copyFileSync(terminalOutputScript, join(seed, "scripts/terminal-output.sh"));
  writeFileSync(join(seed, "setup"), '#!/bin/sh\necho setup ran >"$(dirname "$0")/../setup-ran"\n', { mode: 0o755 });
  git(seed, "add", ".");
  git(seed, "commit", "-q", "-m", "first");
  const origin = join(folder, "origin.git");
  git(folder, "clone", "-q", "--bare", seed, origin);
  const checkout = join(folder, "checkout");
  git(folder, "clone", "-q", origin, checkout);
  return { seed, origin, checkout };
}

const runInstall = (checkout, appHome) =>
  spawnSync(join(checkout, "install"), {
    encoding: "utf8",
    input: "",
    env: { ...process.env, HERDR_APP_HOME: appHome },
  });

const pushToOrigin = (seed, origin, file) => {
  commitFile(seed, file, "new\n");
  git(seed, "push", "-q", origin, "main");
};

test("install fast-forwards the checkout to origin/main and runs setup", (t) => {
  const folder = temporaryFolder(t);
  const { seed, origin, checkout } = installedCheckout(folder);
  pushToOrigin(seed, origin, "update");

  const result = runInstall(checkout, join(folder, "herdr-app"));

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^== Update\n {2}\[done\] Updated .*checkout to [0-9a-f]+ /m);
  assert.equal(git(checkout, "rev-parse", "HEAD"), git(seed, "rev-parse", "HEAD"));
  assert.equal(readFileSync(join(folder, "setup-ran"), "utf8"), "setup ran\n");
});

test("install changes nothing when the checkout has local changes", (t) => {
  const folder = temporaryFolder(t);
  const { seed, origin, checkout } = installedCheckout(folder);
  const before = git(checkout, "rev-parse", "HEAD");
  pushToOrigin(seed, origin, "update");
  writeFileSync(join(checkout, "scratch"), "mine\n");

  const result = runInstall(checkout, join(folder, "herdr-app"));

  assert.equal(result.status, 1);
  assert.match(result.stderr, /has local changes/);
  assert.equal(git(checkout, "rev-parse", "HEAD"), before);
});

test("install changes nothing when the checkout can't fast-forward", (t) => {
  const folder = temporaryFolder(t);
  const { seed, origin, checkout } = installedCheckout(folder);
  pushToOrigin(seed, origin, "update");
  commitFile(checkout, "local", "mine\n");
  const before = git(checkout, "rev-parse", "HEAD");

  const result = runInstall(checkout, join(folder, "herdr-app"));

  assert.equal(result.status, 1);
  assert.match(result.stderr, /can't fast-forward/);
  assert.equal(git(checkout, "rev-parse", "HEAD"), before);
});

test("install refuses without a terminal when the mod is linked to another checkout", (t) => {
  const folder = temporaryFolder(t);
  const { checkout } = installedCheckout(folder);
  const appHome = join(folder, "herdr-app");
  mkdirSync(join(appHome, "mods"), { recursive: true });
  symlinkSync(join(folder, "elsewhere/mod"), join(appHome, "mods/issues"));

  const result = runInstall(checkout, appHome);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /linked to .*elsewhere\/mod, another checkout/);
  assert.match(result.stdout, /another copy of the herdr-issues repository/);
  assert.match(
    result.stdout,
    /Repointing makes Herdr load the mod, the issues command run, and Claude Code install the plugin from/,
  );
  assert.match(result.stderr, /Standard input is not a terminal/);
});
