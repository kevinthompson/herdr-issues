import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { defaults, stubHerdr } from "./support/herdr.js";
import { createRepository, git, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { main } from "../cli/main.js";

beforeEach(() => forgetLookups());

// Stubs `bd`, which runs unless `installed` is false; other programs, such as git, run. Records each folder
// `bd` runs in.
function stubBd(t, { installed = true } = {}) {
  const folders = [];
  stubHerdr(t, {
    exec: async (command, args, options) => {
      if (command !== "bd") return defaults.exec(command, args, options);
      if (!installed) throw Object.assign(new Error("spawn bd ENOENT"), { code: "ENOENT" });
      folders.push(options.cwd);
      return { code: 0, stdout: "bd version 1.3.4\n", stderr: "" };
    },
  });
  return folders;
}

function initializeBeads(repository) {
  mkdirSync(join(repository, ".beads"));
  writeFileSync(join(repository, ".beads/metadata.json"), "{}");
}

function runIn(t, folder) {
  const previous = process.cwd();
  process.chdir(folder);
  t.after(() => process.chdir(previous));
}

async function credentials(t) {
  const out = [];
  const err = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", (line) => err.push(line));
  const code = await main(["credentials", "beads"]);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("credentials beads exits 0 when bd runs and the main checkout has a Beads database", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  initializeBeads(repository);
  stubBd(t);
  runIn(t, repository);
  const { code, err } = await credentials(t);
  assert.equal(code, 0);
  assert.equal(err, "");
});

test("credentials beads checks the main checkout's database from a linked worktree", async (t) => {
  const folder = temporaryFolder(t);
  const repository = createRepository(folder);
  initializeBeads(repository);
  const worktree = join(folder, "worktree");
  git(repository, "worktree", "add", "-q", "-b", "feature", worktree);
  const folders = stubBd(t);
  runIn(t, worktree);
  const { code } = await credentials(t);
  assert.equal(code, 0);
  assert.deepEqual(folders, [repository]);
});

test("credentials beads prints bdMissing and its fix and exits 1 when bd isn't installed", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  initializeBeads(repository);
  stubBd(t, { installed: false });
  runIn(t, repository);
  const { code, err } = await credentials(t);
  assert.equal(code, 1);
  assert.match(err, /The Beads CLI \(bd\) isn't installed/);
  assert.match(err, /Install it/);
});

test("credentials beads prints beadsNotInitialized and its fix and exits 1 without a Beads database", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  stubBd(t);
  runIn(t, repository);
  const { code, err } = await credentials(t);
  assert.equal(code, 1);
  assert.match(err, /This repository has no Beads database/);
  assert.match(err, /bd init/);
});

test("--help lists credentials beads", async (t) => {
  const out = [];
  t.mock.method(console, "log", (line) => out.push(line));
  assert.equal(await main(["--help"]), 0);
  assert.match(out.join("\n"), /credentials <tracker>[\s\S]*beads/);
});
