import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { defaults, stubHerdr } from "./support/herdr.js";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { settingsPath } from "../mod/trackers/setting.js";
import { changeIssueLabels } from "../cli/change.js";
import { main } from "../cli/main.js";

const startingFolder = process.cwd();

beforeEach(() => forgetLookups());
afterEach(() => process.chdir(startingFolder));

// A repository tracked in Beads holding one issue labeled ui, whose stubbed `bd` knows the labels ui and bug and
// applies each label change to the issue, so a later `show` reads it; the panel announcements are counted.
function beadsRepository(t) {
  const repository = createRepository(temporaryFolder(t));
  mkdirSync(join(repository, ".beads"));
  writeFileSync(join(repository, ".beads/metadata.json"), "{}");
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify({ repos: { [repository]: { tracker: "beads" } } }));
  const record = {
    id: "notes-a1b", title: "Something", status: "open", priority: 2, created_at: "2026-01-01T00:00:00Z",
    dependencies: [], description: "", labels: ["ui"],
  };
  const changes = [];
  const counts = { announcements: 0 };
  const ok = (value) => ({ code: 0, stdout: JSON.stringify(value), stderr: "" });
  stubHerdr(t, {
    setShared: () => { counts.announcements++; return null; },
    exec: async (command, args, options) => {
      if (command !== "bd") return defaults.exec(command, args, options);
      if (args[0] === "version") return { code: 0, stdout: "bd version 1.3.4\n", stderr: "" };
      if (args[0] === "show") return args[1] === record.id ? ok([record]) : { code: 1, stdout: "", stderr: "no issue found" };
      if (args[0] === "label" && args[1] === "list-all") return ok(["ui", "bug"].map((label) => ({ label, count: 1 })));
      if (args[0] === "label") {
        const [, action, , label] = args;
        changes.push([action, label]);
        record.labels = action === "add" ? [...record.labels, label] : record.labels.filter((each) => each !== label);
      }
      return ok(null);
    },
  });
  process.chdir(repository);
  return { record, changes, counts };
}

async function run(t, args) {
  const out = [], err = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", (line) => err.push(line));
  const code = await main(args);
  t.mock.restoreAll();
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("label adds and removes labels, keeping the issue's others, and refreshes the panels", async (t) => {
  const { record, changes, counts } = beadsRepository(t);
  const added = await run(t, ["label", record.id, "--add", "bug"]);
  assert.equal(added.code, 0, added.err);
  assert.equal(added.out, "notes-a1b: added bug");
  assert.match((await run(t, ["show", record.id])).out, /^Labels: ui, bug$/m);
  const removed = await run(t, ["label", record.id, "--remove", "ui"]);
  assert.equal(removed.code, 0, removed.err);
  assert.match((await run(t, ["show", record.id])).out, /^Labels: bug$/m);
  assert.deepEqual(changes, [["add", "bug"], ["remove", "ui"]]);
  assert.equal(counts.announcements, 2);
});

test("label exits 1 for a label the tracker doesn't have, changing nothing", async (t) => {
  const { record, changes, counts } = beadsRepository(t);
  const result = await run(t, ["label", record.id, "--add", "bug", "--add", "urgent"]);
  assert.equal(result.code, 1);
  assert.match(result.err, /no label named urgent/);
  assert.deepEqual(changes, []);
  assert.equal(counts.announcements, 0);
});

test("label exits 1 for an unknown issue, changing nothing", async (t) => {
  const { changes } = beadsRepository(t);
  const result = await run(t, ["label", "notes-zzz", "--add", "bug"]);
  assert.equal(result.code, 1);
  assert.match(result.err, /notes-zzz: not found/);
  assert.deepEqual(changes, []);
});

test("label exits 2 without a label to add or remove", async (t) => {
  const { record } = beadsRepository(t);
  const result = await run(t, ["label", record.id]);
  assert.equal(result.code, 2);
  assert.match(result.err, /at least one --add <name> or --remove <name>/);
});

test("changing labels refuses a tracker that can't save", async () => {
  const tracker = { name: "Read-only", writable: false, get: async () => assert.fail("read the issue") };
  await assert.rejects(changeIssueLabels(tracker, "1", { addLabels: ["bug"], removeLabels: [] }), /Read-only issues can't be changed here/);
});

test("--help lists label", async (t) => {
  const result = await run(t, ["--help"]);
  assert.match(result.out, /^ {2}label <id> \[--add <name>\]\.\.\. \[--remove <name>\]\.\.\.$/m);
});
