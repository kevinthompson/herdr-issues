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

const record = {
  id: "notes-a1b",
  title: "Something",
  status: "open",
  priority: 2,
  created_at: "2026-01-01T00:00:00Z",
  dependencies: [],
};

// A repository tracked in Beads holding only the issue `record`, whose stubbed `bd` records each update; the
// panel announcements are counted.
function beadsRepository(t, { app = null } = {}) {
  const repository = createRepository(temporaryFolder(t));
  mkdirSync(join(repository, ".beads"));
  writeFileSync(join(repository, ".beads/metadata.json"), "{}");
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify({ repos: { [repository]: { tracker: "beads" } } }));
  const updates = [];
  const renames = [];
  const counts = { announcements: 0 };
  const ok = (value) => ({ code: 0, stdout: JSON.stringify(value), stderr: "" });
  stubHerdr(t, {
    setShared: () => {
      counts.announcements++;
      return null;
    },
    exec: async (command, args, options) => {
      if (command === "herdr-app") {
        if (app === null) throw Object.assign(new Error("spawn herdr-app ENOENT"), { code: "ENOENT" });
        if (app === "down") return { code: 1, stdout: "", stderr: "herdr-app isn't running" };
        if (args[0] === "ls") return { code: 0, stdout: JSON.stringify({ spaces: app }), stderr: "" };
        renames.push(args.slice(2));
        return { code: 0, stdout: '{"ok":true}', stderr: "" };
      }
      if (command !== "bd") return defaults.exec(command, args, options);
      if (args[0] === "version") return { code: 0, stdout: "bd version 1.3.4\n", stderr: "" };
      if (args[0] === "show")
        return args[1] === record.id ? ok([record]) : { code: 1, stdout: "", stderr: "no issue found" };
      if (args[0] === "update") updates.push(args.slice(1, -1));
      return ok(null);
    },
  });
  process.chdir(repository);
  return { updates, counts, renames };
}

const DONE = "\u{F0132}   ";
const WORKING = "\u{F0131}   ";
const spaceLayout = (...names) => names.map((name, index) => ({ id: `space-${index}`, name, tabs: [] }));

async function run(t, args) {
  const out = [],
    err = [];
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

test("status done marks the issue's space done from any space", async (t) => {
  const { renames } = beadsRepository(t, {
    app: spaceLayout("elsewhere", `${WORKING}${record.id}`, `${WORKING}notes-a1`),
  });
  const result = await run(t, ["status", record.id, "done"]);
  assert.equal(result.code, 0, result.err);
  assert.equal(result.out, `Set ${record.id} to done`);
  assert.deepEqual(renames, [["--id", "space-1", "--name", `${DONE}${record.id}`]]);
});

test("status canceled marks the issue's space done", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify({ repos: { [repository]: { tracker: "github", repo: "owner/name" } } }));
  const renames = [];
  const node = {
    number: 7,
    title: "Seven",
    url: "https://github.com/owner/name/issues/7",
    body: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    closedAt: null,
    state: "OPEN",
    stateReason: null,
    milestone: null,
    labels: { nodes: [] },
    assignees: { nodes: [] },
    blockedBy: { nodes: [] },
    closedByPullRequestsReferences: { nodes: [] },
  };
  const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
  stubHerdr(t, {
    exec: async (command, args, options) => {
      if (command === "herdr-app") {
        if (args[0] === "ls") return ok(JSON.stringify({ spaces: spaceLayout(`${WORKING}#7`) }));
        renames.push(args.slice(2));
        return ok("{}");
      }
      if (command !== "gh") return defaults.exec(command, args, options);
      if (args[1] === "graphql") return ok(JSON.stringify({ data: { repository: { issue: node } } }));
      return ok("{}");
    },
  });
  process.chdir(repository);
  const result = await run(t, ["status", "#7", "canceled"]);
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(renames, [["--id", "space-0", "--name", `${DONE}#7`]]);
});

test("status done changes the status quietly when no space is named after the issue", async (t) => {
  const { updates, renames } = beadsRepository(t, { app: spaceLayout("elsewhere") });
  const result = await run(t, ["status", record.id, "done"]);
  assert.deepEqual(
    { code: result.code, out: result.out, err: result.err },
    {
      code: 0,
      out: `Set ${record.id} to done`,
      err: "",
    },
  );
  assert.equal(updates.length, 1);
  assert.deepEqual(renames, []);
});

for (const [name, app] of [
  ["herdr-app isn't installed", null],
  ["Herdr isn't running", "down"],
]) {
  test(`status done changes the status quietly when ${name}`, async (t) => {
    const { updates } = beadsRepository(t, { app });
    const result = await run(t, ["status", record.id, "done"]);
    assert.deepEqual(
      { code: result.code, out: result.out, err: result.err },
      {
        code: 0,
        out: `Set ${record.id} to done`,
        err: "",
      },
    );
    assert.equal(updates.length, 1);
  });
}

test("status other than done or canceled leaves the space's mark alone", async (t) => {
  const { renames } = beadsRepository(t, { app: spaceLayout(`${WORKING}${record.id}`) });
  const result = await run(t, ["status", record.id, "todo"]);
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(renames, []);
});

test("status done doesn't rename a space already marked done", async (t) => {
  const { renames } = beadsRepository(t, { app: spaceLayout(`${DONE}${record.id}`) });
  const result = await run(t, ["status", record.id, "done"]);
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(renames, []);
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

for (const args of [
  ["status", "notes-zzz", "done"],
  ["start", "notes-zzz"],
]) {
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
