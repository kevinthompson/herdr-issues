import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { defaults, stubHerdr } from "./support/herdr.js";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { settingsPath } from "../mod/trackers/setting.js";
import { main } from "../cli/main.js";

const startingFolder = process.cwd();

beforeEach(() => forgetLookups());
afterEach(() => process.chdir(startingFolder));

const record = { id: "notes-a1b", title: "Something", status: "open", priority: 2, created_at: "2026-01-01T00:00:00Z", dependencies: [] };

// A repository tracked in Beads holding only the issue `record`, whose stubbed `bd` records each update; the
// panel announcements are counted.
function beadsRepository(t) {
  const repository = createRepository(temporaryFolder(t));
  mkdirSync(join(repository, ".beads"));
  writeFileSync(join(repository, ".beads/metadata.json"), "{}");
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify({ repos: { [repository]: { tracker: "beads" } } }));
  const updates = [];
  const counts = { announcements: 0 };
  const ok = (value) => ({ code: 0, stdout: JSON.stringify(value), stderr: "" });
  stubHerdr(t, {
    setShared: () => { counts.announcements++; return null; },
    exec: async (command, args, options) => {
      if (command !== "bd") return defaults.exec(command, args, options);
      if (args[0] === "version") return { code: 0, stdout: "bd version 1.3.4\n", stderr: "" };
      if (args[0] === "show") return args[1] === record.id ? ok([record]) : { code: 1, stdout: "", stderr: "no issue found" };
      if (args[0] === "update") updates.push(args.slice(1, -1));
      return ok(null);
    },
  });
  process.chdir(repository);
  return { updates, counts };
}

async function run(t, args) {
  const out = [], err = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", (line) => err.push(line));
  const code = await main(args);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("status sets the issue's status through its tracker and refreshes the panels", async (t) => {
  const { updates, counts } = beadsRepository(t);
  const result = await run(t, ["status", record.id, "done"]);
  assert.equal(result.code, 0, result.err);
  assert.equal(result.out, `Set ${record.id} to done`);
  assert.deepEqual(updates, [[record.id, "--status", "closed"]]);
  assert.equal(counts.announcements, 1);
});

test("start marks the issue in progress through its tracker and refreshes the panels", async (t) => {
  const { updates, counts } = beadsRepository(t);
  const result = await run(t, ["start", record.id]);
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(updates, [[record.id, "--status", "in_progress"]]);
  assert.equal(counts.announcements, 1);
});

test("status names the valid statuses and exits 2 for any other", async (t) => {
  const { updates, counts } = beadsRepository(t);
  const result = await run(t, ["status", record.id, "finished"]);
  assert.equal(result.code, 2);
  assert.match(result.err, /finished isn't one of triage, backlog, todo, in-progress, in-review, done, canceled/);
  assert.deepEqual(updates, []);
  assert.equal(counts.announcements, 0);
});

test("status refuses a status the tracker can't set and exits 1", async (t) => {
  const { updates } = beadsRepository(t);
  const result = await run(t, ["status", record.id, "in-review"]);
  assert.equal(result.code, 1);
  assert.match(result.err, /Beads issues can't be set to in-review/);
  assert.deepEqual(updates, []);
});

for (const args of [["status", "notes-zzz", "done"], ["start", "notes-zzz"]]) {
  test(`${args[0]} exits 1 for an unknown issue, changing nothing`, async (t) => {
    const { updates, counts } = beadsRepository(t);
    const result = await run(t, args);
    assert.equal(result.code, 1);
    assert.match(result.err, /notes-zzz: not found/);
    assert.deepEqual(updates, []);
    assert.equal(counts.announcements, 0);
  });
}

test("--help lists status and start", async (t) => {
  const result = await run(t, ["--help"]);
  assert.match(result.out, /^ {2}status <id> <status> /m);
  assert.match(result.out, /^ {2}start <id> /m);
});
