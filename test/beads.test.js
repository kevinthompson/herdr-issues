import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { defaults, stubHerdr } from "./support/herdr.js";
import { createRepository, git, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { beadsPrefix, beadsTracker, initializeBeads } from "../mod/trackers/beads.js";
import { trackerFor } from "../mod/trackers/index.js";
import { settingsPath } from "../mod/trackers/setting.js";

const record = (
  id,
  { status = "open", priority = 2, labels, description, dependencies, closedAt, type = "task", parent } = {},
) => ({
  id,
  title: `Issue ${id}`,
  status,
  priority,
  issue_type: type,
  ...(parent && { parent }),
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...(labels && { labels }),
  ...(description !== undefined && { description }),
  ...(closedAt && { closed_at: closedAt }),
  ...(dependencies && { dependencies, dependency_count: dependencies.length }),
});

const blocking = (id, status = "open") => ({
  id,
  title: `Issue ${id}`,
  status,
  priority: 2,
  dependency_type: "blocks",
});

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
// `bd` can't start. `customStatuses` is the database's status.custom setting.
async function trackerWith(t, records, { installed = true, initialized = true, customStatuses } = {}) {
  const commands = [];
  const ok = (value) => ({ code: 0, stdout: JSON.stringify(value), stderr: "" });
  stubHerdr(t, {
    exec: async (command, args, options) => {
      if (command === "git") return { code: 1, stdout: "", stderr: "" };
      if (!installed) throw Object.assign(new Error("spawn bd ENOENT"), { code: "ENOENT" });
      commands.push({ args, cwd: options.cwd });
      const [subcommand, ...rest] = args;
      if (subcommand === "version") return { code: 0, stdout: "bd version 1.3.4\n", stderr: "" };
      if (subcommand === "config") return ok({ key: rest[1], value: customStatuses ?? "" });
      if (subcommand === "list") {
        const option = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
        const statuses = option("--status").split(",");
        const [type, parent] = [option("--type"), option("--parent")];
        return ok(
          records
            .filter((each) => statuses.includes(each.status))
            .filter((each) => (!type || each.issue_type === type) && (!parent || each.parent === parent))
            .map((each) => {
              const listed = { ...each };
              delete listed.description;
              delete listed.dependencies;
              return listed;
            }),
        );
      }
      if (subcommand === "blocked") {
        const openBlockers = (each) =>
          (each.dependencies ?? [])
            .filter((dependency) => dependency.dependency_type === "blocks" && dependency.status !== "closed")
            .map((dependency) => dependency.id);
        return ok(
          records
            .filter((each) => each.status !== "closed" && openBlockers(each).length)
            .map((each) => ({ id: each.id, blocked_by: openBlockers(each) })),
        );
      }
      if (subcommand === "show") {
        const found = records.filter((each) => rest.includes(each.id));
        return found.length
          ? ok(found)
          : { code: 1, stdout: "", stderr: "Error: no issues found matching the provided IDs\n" };
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
      record("bd-1"),
      record("bd-2", { status: "in_progress" }),
      record("bd-3", { status: "blocked" }),
      record("bd-4", { status: "deferred" }),
      record("bd-5", { status: "closed", closedAt: "2026-02-01T00:00:00Z" }),
    ]);
    const issues = byId(await tracker.list(null, new Set(["done"])));
    assert.deepEqual(Object.fromEntries(Object.entries(issues).map(([id, issue]) => [id, issue.status])), {
      "bd-1": "todo",
      "bd-2": "in-progress",
      "bd-3": "todo",
      "bd-4": "backlog",
      "bd-5": "done",
    });
  });

  test("sets each status it offers as the matching Beads status", async (t) => {
    const { tracker, commands } = await trackerWith(t, [record("bd-1")]);
    const [issue] = await tracker.list();
    assert.deepEqual(tracker.statuses, ["backlog", "todo", "in-progress", "done"]);
    for (const status of tracker.statuses) await tracker.update(issue, { status });
    assert.deepEqual(
      updates(commands),
      ["deferred", "open", "in_progress", "closed"].map((status) => ["bd-1", "--status", status]),
    );
    await assert.rejects(tracker.update(issue, { status: "canceled" }), /can't be set to canceled/);
  });

  test("lists, maps and sets in_review as In review when status.custom names it", async (t) => {
    const { tracker, commands } = await trackerWith(t, [record("bd-1"), record("bd-2", { status: "in_review" })], {
      customStatuses: "qa, in_review:frozen",
    });
    const issues = byId(await tracker.list());
    assert.equal(issues["bd-2"].status, "in-review");
    assert.deepEqual(tracker.statuses, ["backlog", "todo", "in-progress", "in-review", "done"]);
    await tracker.update(issues["bd-1"], { status: "in-review" });
    assert.deepEqual(updates(commands), [["bd-1", "--status", "in_review"]]);
  });

  test("neither lists nor offers in_review when status.custom doesn't name it", async (t) => {
    const { tracker, commands } = await trackerWith(t, [record("bd-1"), record("bd-2", { status: "in_review" })], {
      customStatuses: "in_reviewing",
    });
    assert.deepEqual(
      (await tracker.list()).map((issue) => issue.id),
      ["bd-1"],
    );
    const unfinished = commands.find(({ args }) => args[0] === "list" && !args.includes("--type"));
    assert.equal(unfinished.args[2], "open,in_progress,blocked,deferred");
    assert.ok(!tracker.statuses.includes("in-review"));
    await assert.rejects(tracker.update(record("bd-1"), { status: "in-review" }), /can't be set to in-review/);
  });

  test("maps priorities P0 to P4 onto Urgent, High, Medium, Low and None, and back", async (t) => {
    const records = [0, 1, 2, 3, 4].map((priority) => record(`bd-${priority}`, { priority }));
    const { tracker, commands } = await trackerWith(t, records);
    const issues = await tracker.list();
    assert.equal(tracker.prioritized, true);
    assert.deepEqual(
      issues.map((issue) => issue.priority),
      [1, 2, 3, 4, 0],
    );
    for (const issue of issues) await tracker.update(issue, { priority: issue.priority });
    assert.deepEqual(
      updates(commands).map((args) => args[2]),
      ["0", "1", "2", "3", "4"],
    );
  });

  test("lists the most recently closed issues only once Done is expanded", async (t) => {
    const { tracker, commands } = await trackerWith(t, [record("bd-1"), record("bd-2", { status: "closed" })]);
    assert.deepEqual(tracker.deferred(), ["done"]);
    assert.deepEqual(
      (await tracker.list()).map((issue) => issue.id),
      ["bd-1"],
    );
    assert.deepEqual(
      (await tracker.list(null, new Set(["done"]))).map((issue) => issue.id),
      ["bd-1", "bd-2"],
    );
    const closedList = commands.find(({ args }) => args.includes("closed"));
    assert.deepEqual(closedList.args, ["list", "--status", "closed", "--sort", "closed", "--limit", "20", "--json"]);
  });

  test("has a single list when the database has no epics that aren't closed", async (t) => {
    const { tracker } = await trackerWith(t, [record("bd-1"), record("bd-2", { type: "epic", status: "closed" })]);
    assert.equal(tracker.scopes, undefined);
  });

  test("offers every issue first, then each epic that isn't closed, by its title", async (t) => {
    const { tracker } = await trackerWith(t, [
      { ...record("bd-1", { type: "epic" }), title: "Launch" },
      { ...record("bd-2", { type: "epic", status: "in_progress" }), title: "Polish" },
      record("bd-3", { type: "epic", status: "closed" }),
      record("bd-4"),
    ]);
    assert.deepEqual(tracker.scopes, [
      { id: "all", label: "All issues" },
      { id: "epic:bd-1", label: "Launch" },
      { id: "epic:bd-2", label: "Polish" },
    ]);
  });

  test("lists only an epic's children in its scope, with its recently closed ones once Done is expanded", async (t) => {
    const { tracker, commands } = await trackerWith(t, [
      record("bd-1", { type: "epic" }),
      record("bd-2", { parent: "bd-1", dependencies: [blocking("bd-4")] }),
      record("bd-3", { parent: "bd-1", status: "closed" }),
      record("bd-4"),
      record("bd-5", { status: "closed" }),
    ]);
    const ids = (issues) => issues.map((issue) => issue.id);
    assert.deepEqual(ids(await tracker.list("epic:bd-1")), ["bd-2"]);
    assert.deepEqual((await tracker.list("epic:bd-1"))[0].blockedBy, ["bd-4"]);
    assert.deepEqual(ids(await tracker.list("epic:bd-1", new Set(["done"]))), ["bd-2", "bd-3"]);
    assert.deepEqual(ids(await tracker.list("all")), ["bd-1", "bd-2", "bd-4"]);
    assert.deepEqual(ids(await tracker.list("epic:bd-9")), ["bd-1", "bd-2", "bd-4"]);
    const closedList = commands.find(({ args }) => args.includes("closed") && args.includes("--parent"));
    assert.deepEqual(closedList.args, [
      ...["list", "--status", "closed", "--parent", "bd-1", "--sort", "closed", "--limit", "20", "--json"],
    ]);
  });

  test("names a branch after the issue's ID and title", async (t) => {
    const { tracker } = await trackerWith(t, [{ ...record("bd-a1b"), title: "Fix the  Panel's header!" }]);
    const [issue] = await tracker.list();
    assert.equal(issue.branch, "bd-a1b-fix-the-panel-s-header");
  });

  test("lists labels and the open issues that block an issue", async (t) => {
    const { tracker } = await trackerWith(t, [
      record("bd-1", {
        status: "blocked",
        labels: ["ui"],
        dependencies: [
          blocking("bd-2"),
          blocking("bd-3", "closed"),
          { ...blocking("bd-4"), dependency_type: "parent-child" },
        ],
      }),
      record("bd-2"),
    ]);
    const issues = byId(await tracker.list());
    assert.deepEqual(issues["bd-1"].labels, ["ui"]);
    assert.deepEqual(issues["bd-1"].blockedBy, ["bd-2"]);
    assert.deepEqual(issues["bd-2"].blockedBy, []);
  });

  // `bd show` records the issue it shows in .beads/last-touched, which the panel watches for changes.
  test("lists blockers without bd show, so listing doesn't look like a change to the database", async (t) => {
    const { tracker, commands } = await trackerWith(t, [
      record("bd-1", { dependencies: [blocking("bd-2")] }),
      record("bd-2"),
    ]);
    await tracker.list(null, new Set(["done"]));
    assert.deepEqual(
      commands.filter(({ args }) => args[0] === "show"),
      [],
    );
  });

  test("names who created an issue, without an avatar", async (t) => {
    const { tracker } = await trackerWith(t, [{ ...record("bd-1"), created_by: "Ada Lovelace" }, record("bd-2")]);
    const issues = byId(await tracker.list());
    assert.equal(issues["bd-1"].creator, "Ada Lovelace");
    assert.equal(issues["bd-1"].creatorAvatar, null);
    assert.equal(issues["bd-2"].creator, null);
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
    const folder = temporaryFolder(t),
      main = createRepository(folder),
      worktree = join(folder, "worktree");
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
    await assert.rejects(
      trackerWith(t, [], { installed: false }),
      (e) => /isn't installed/.test(e.message) && /Beads' README/.test(e.fix),
    );
  });

  test("asks for bd init when the main checkout has no Beads database", async (t) => {
    await assert.rejects(
      trackerWith(t, [], { initialized: false }),
      (e) => /no Beads database/.test(e.message) && /bd init/.test(e.fix),
    );
  });
});

describe("Beads tracker labels", () => {
  // A tracker whose `bd label list-all` lists `known`.
  async function labelTracker(t, known) {
    const commands = [];
    stubHerdr(t, {
      exec: async (command, args) => {
        if (command === "git") return { code: 1, stdout: "", stderr: "" };
        commands.push(args.slice(0, -1));
        if (args[0] === "version") return { code: 0, stdout: "bd version 1.3.4\n", stderr: "" };
        const output = args[1] === "list-all" ? known.map((label) => ({ label, count: 1 })) : [];
        return { code: 0, stdout: JSON.stringify(output), stderr: "" };
      },
    });
    const tracker = await beadsTracker({ root: checkout(), on: null }, { tracker: "beads" });
    const labelCommands = () => commands.filter((args) => args[0] === "label" && args[1] !== "list-all");
    return { tracker, labelCommands };
  }

  test("adds and removes labels with bd label add and remove", async (t) => {
    const { tracker, labelCommands } = await labelTracker(t, ["ui", "bug"]);
    await tracker.update({ id: "bd-1", labels: ["bug"] }, { addLabels: ["ui"], removeLabels: ["bug"] });
    assert.deepEqual(labelCommands(), [
      ["label", "add", "bd-1", "ui"],
      ["label", "remove", "bd-1", "bug"],
    ]);
  });

  test("refuses a label no issue has, naming it and changing nothing", async (t) => {
    const { tracker, labelCommands } = await labelTracker(t, ["ui"]);
    await assert.rejects(
      tracker.update({ id: "bd-1", labels: [] }, { addLabels: ["ui", "urgent"] }),
      /Beads has no label named urgent/,
    );
    assert.deepEqual(labelCommands(), []);
  });

  test("has no list of labels to choose from", async (t) => {
    const { tracker } = await labelTracker(t, []);
    assert.equal(tracker.labels, undefined);
  });
});

describe("Beads issue prefix", () => {
  test("takes the first letter of each word, in lower case, from a folder name", () => {
    assert.equal(beadsPrefix("astro-escape"), "ae");
    assert.equal(beadsPrefix("Astro Escape"), "ae");
    assert.equal(beadsPrefix("my_cool.app"), "mca");
  });

  test("keeps a single word whole, in lower case", () => {
    assert.equal(beadsPrefix("Notes"), "notes");
  });

  test("leaves the prefix to bd init when the name has no letters or digits", () => {
    assert.equal(beadsPrefix("--__"), null);
  });

  test("bd init names the database with the main checkout's folder initials", async (t) => {
    const runs = [];
    stubHerdr(t, {
      exec: async (command, args, options) => {
        runs.push({ command, args, cwd: options.cwd });
        return { code: 0, stdout: "", stderr: "" };
      },
    });
    const root = join(realpathSync(mkdtempSync(join(tmpdir(), "beads-init-"))), "astro-escape");
    await initializeBeads(root);
    assert.deepEqual(runs, [
      {
        command: "bd",
        args: [
          "init",
          "--non-interactive",
          "--quiet",
          "--skip-agents",
          "--skip-hooks",
          "--setup-exclude",
          "--prefix",
          "ae",
        ],
        cwd: root,
      },
    ]);
  });
});
