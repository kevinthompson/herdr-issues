import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { defaults, stubHerdr } from "./support/herdr.js";
import { createRepository, git, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { beadsTracker } from "../mod/trackers/beads.js";
import { trackerFor } from "../mod/trackers/index.js";
import { settingsPath } from "../mod/trackers/setting.js";

const record = (id, { status = "open", priority = 2, labels, description, dependencies, closedAt } = {}) => ({
  id, title: `Issue ${id}`, status, priority, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  ...(labels && { labels }), ...(description !== undefined && { description }), ...(closedAt && { closed_at: closedAt }),
  ...(dependencies && { dependencies, dependency_count: dependencies.length }),
});

const blocking = (id, status = "open") => ({ id, title: `Issue ${id}`, status, priority: 2, dependency_type: "blocks" });

// A main checkout, with a Beads database unless `initialized` is false.
function checkout({ initialized = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "beads-tracker-")));
  if (initialized) {
    mkdirSync(join(root, ".beads"));
    writeFileSync(join(root, ".beads/metadata.json"), "{}");
  }
  return root;
}

// A tracker whose `bd` answers from `records`, recording each command it runs. Unless `installed` is false, when
// `bd` can't start.
async function trackerWith(t, records, { installed = true, initialized = true } = {}) {
  const commands = [];
  const ok = (value) => ({ code: 0, stdout: JSON.stringify(value), stderr: "" });
  stubHerdr(t, {
    exec: async (command, args, options) => {
      if (command === "git") return { code: 1, stdout: "", stderr: "" };
      if (!installed) throw Object.assign(new Error("spawn bd ENOENT"), { code: "ENOENT" });
      commands.push({ args, cwd: options.cwd });
      const [subcommand, ...rest] = args;
      if (subcommand === "version") return { code: 0, stdout: "bd version 1.3.4\n", stderr: "" };
      if (subcommand === "list") {
        const statuses = rest[rest.indexOf("--status") + 1].split(",");
        return ok(records.filter((each) => statuses.includes(each.status)).map(({ description, dependencies, ...listed }) => listed));
      }
      if (subcommand === "show") {
        const found = records.filter((each) => rest.includes(each.id));
        return found.length ? ok(found) : { code: 1, stdout: "", stderr: "Error: no issues found matching the provided IDs\n" };
      }
      return ok({});
    },
  });
  const root = checkout({ initialized });
  const tracker = await beadsTracker({ root, on: null }, { tracker: "beads" });
  return { tracker, commands, root };
}

const byId = (issues) => Object.fromEntries(issues.map((issue) => [issue.id, issue]));
const updates = (commands) => commands.filter(({ args }) => args[0] === "update").map(({ args }) => args.slice(1, -1));

describe("Beads tracker", () => {
  test("maps each Beads status onto the panel's", async (t) => {
    const { tracker } = await trackerWith(t, [
      record("bd-1"), record("bd-2", { status: "in_progress" }), record("bd-3", { status: "blocked" }),
      record("bd-4", { status: "deferred" }), record("bd-5", { status: "closed", closedAt: "2026-02-01T00:00:00Z" }),
    ]);
    const issues = byId(await tracker.list(null, new Set(["done"])));
    assert.deepEqual(Object.fromEntries(Object.entries(issues).map(([id, issue]) => [id, issue.status])),
      { "bd-1": "todo", "bd-2": "in-progress", "bd-3": "todo", "bd-4": "backlog", "bd-5": "done" });
  });

  test("sets each status it offers as the matching Beads status", async (t) => {
    const { tracker, commands } = await trackerWith(t, [record("bd-1")]);
    const [issue] = await tracker.list();
    assert.deepEqual(tracker.statuses, ["backlog", "todo", "in-progress", "done"]);
    for (const status of tracker.statuses) await tracker.update(issue, { status });
    assert.deepEqual(updates(commands), ["deferred", "open", "in_progress", "closed"].map((status) => ["bd-1", "--status", status]));
    await assert.rejects(tracker.update(issue, { status: "canceled" }), /can't be set to canceled/);
  });

  test("maps priorities P0 to P4 onto Urgent, High, Medium, Low and None, and back", async (t) => {
    const records = [0, 1, 2, 3, 4].map((priority) => record(`bd-${priority}`, { priority }));
    const { tracker, commands } = await trackerWith(t, records);
    const issues = await tracker.list();
    assert.equal(tracker.prioritized, true);
    assert.deepEqual(issues.map((issue) => issue.priority), [1, 2, 3, 4, 0]);
    for (const issue of issues) await tracker.update(issue, { priority: issue.priority });
    assert.deepEqual(updates(commands).map((args) => args[2]), ["0", "1", "2", "3", "4"]);
  });

  test("lists the most recently closed issues only once Done is expanded", async (t) => {
    const { tracker, commands } = await trackerWith(t, [record("bd-1"), record("bd-2", { status: "closed" })]);
    assert.deepEqual(tracker.deferred(), ["done"]);
    assert.deepEqual((await tracker.list()).map((issue) => issue.id), ["bd-1"]);
    assert.deepEqual((await tracker.list(null, new Set(["done"]))).map((issue) => issue.id), ["bd-1", "bd-2"]);
    const closedList = commands.find(({ args }) => args.includes("closed"));
    assert.deepEqual(closedList.args, ["list", "--status", "closed", "--sort", "closed", "--limit", "20", "--json"]);
  });

  test("names a branch after the issue's ID and title", async (t) => {
    const { tracker } = await trackerWith(t, [{ ...record("bd-a1b"), title: "Fix the  Panel's header!" }]);
    const [issue] = await tracker.list();
    assert.equal(issue.branch, "bd-a1b-fix-the-panel-s-header");
  });

  test("lists labels and the open issues that block an issue", async (t) => {
    const { tracker } = await trackerWith(t, [
      record("bd-1", { status: "blocked", labels: ["ui"], dependencies: [blocking("bd-2"), blocking("bd-3", "closed"),
        { ...blocking("bd-4"), dependency_type: "parent-child" }] }),
      record("bd-2"),
    ]);
    const issues = byId(await tracker.list());
    assert.deepEqual(issues["bd-1"].labels, ["ui"]);
    assert.deepEqual(issues["bd-1"].blockedBy, ["bd-2"]);
    assert.deepEqual(issues["bd-2"].blockedBy, []);
  });

  test("saves a body only over the one it was read with", async (t) => {
    const records = [record("bd-1", { description: "First" })];
    const { tracker, commands } = await trackerWith(t, records);
    const issue = await tracker.get("bd-1");
    assert.equal(issue.body, "First");
    await tracker.update(issue, { body: "Second" });
    assert.deepEqual(updates(commands), [["bd-1", "--description=Second"]]);
    records[0].description = "Changed elsewhere";
    await assert.rejects(tracker.update(issue, { body: "Third" }), /changed in Beads/);
    assert.equal(updates(commands).length, 1);
  });

  test("starts an issue by setting it in progress", async (t) => {
    const { tracker, commands } = await trackerWith(t, [record("bd-1")]);
    await tracker.start((await tracker.list())[0]);
    assert.deepEqual(updates(commands), [["bd-1", "--status", "in_progress"]]);
  });

  test("runs every bd command in the main checkout", async (t) => {
    const { tracker, commands, root } = await trackerWith(t, [record("bd-1")]);
    await tracker.list();
    assert.ok(commands.length > 0);
    assert.ok(commands.every(({ cwd }) => cwd === root));
  });

  test("is the tracker for a beads entry, from a linked worktree too, and runs bd in the main checkout", async (t) => {
    const folder = temporaryFolder(t), main = createRepository(folder), worktree = join(folder, "worktree");
    git(main, "worktree", "add", "-q", "-b", "feature", worktree);
    mkdirSync(join(main, ".beads"));
    writeFileSync(join(main, ".beads/metadata.json"), "{}");
    mkdirSync(join(settingsPath(), ".."), { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify({ repos: { [main]: { tracker: "beads" } } }));
    forgetLookups();
    const bdFolders = [];
    stubHerdr(t, {
      exec: async (command, args, options) => {
        if (command === "git") return defaults.exec(command, args, options);
        bdFolders.push(options.cwd);
        return { code: 0, stdout: args[0] === "version" ? "bd version 1.3.4\n" : "[]", stderr: "" };
      },
    });
    for (const root of [main, worktree]) {
      const tracker = await trackerFor({ root, on: null });
      assert.equal(tracker.kind, "beads");
      await tracker.list();
    }
    assert.ok(bdFolders.length > 0);
    assert.ok(bdFolders.every((cwd) => cwd === main));
  });

  test("asks for bd to be installed when it can't run", async (t) => {
    await assert.rejects(trackerWith(t, [], { installed: false }), (e) => /isn't installed/.test(e.message) && /brew install beads/.test(e.fix));
  });

  test("asks for bd init when the main checkout has no Beads database", async (t) => {
    await assert.rejects(trackerWith(t, [], { initialized: false }), (e) => /no Beads database/.test(e.message) && /bd init/.test(e.fix));
  });
});
