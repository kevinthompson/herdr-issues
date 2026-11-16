import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { useTracker } from "./support/tracker.js";
import { createRepository, temporaryFolder } from "./support/repository.js";

const { main } = await import("../cli/main.js");
const { nextIssues } = await import("../mod/next.js");

const startingFolder = process.cwd();
afterEach(() => process.chdir(startingFolder));

const VIEWER = "user-me";

const issue = (id, fields = {}) => ({
  id,
  title: `Title of ${id}`,
  status: "todo",
  priority: 0,
  order: null,
  labels: [],
  blockedBy: [],
  created: "2026-01-01T00:00:00Z",
  assigneeId: null,
  ...fields,
});

// A tracker of `kind` listing `issues`; records each scope it's asked to list.
function stubTracker(kind, issues, extra = {}) {
  const listed = [];
  return {
    listed,
    kind,
    name: kind,
    viewerId: async () => VIEWER,
    ...extra,
    async list(scopeId) {
      listed.push(scopeId);
      return issues;
    },
  };
}

const ids = (issues) => issues.map((each) => each.id);

test("GitHub ranks its open, unassigned issues with no open pull request oldest first", async () => {
  const tracker = stubTracker("github", [
    issue("#3", { created: "2026-03-01T00:00:00Z" }),
    issue("#1", { created: "2026-01-01T00:00:00Z" }),
    issue("#2", { created: "2026-02-01T00:00:00Z" }),
    issue("#4", { status: "in-progress", created: "2025-01-01T00:00:00Z" }),
    issue("#5", { status: "in-review", created: "2025-01-01T00:00:00Z" }),
  ]);
  assert.deepEqual(ids(await nextIssues(tracker, 10)), ["#1", "#2", "#3"]);
});

test("Linear ranks unstarted issues assigned to the person or to no one by priority, then the panel's order", async () => {
  const tracker = stubTracker("linear", [
    issue("CORE-1", { priority: 0 }),
    issue("CORE-2", { priority: 3, assigneeId: VIEWER }),
    issue("CORE-3", { priority: 1 }),
    issue("CORE-4", { priority: 3, order: 1 }),
    issue("CORE-5", { priority: 1, assigneeId: "someone-else" }),
    issue("CORE-6", { priority: 1, status: "backlog" }),
    issue("CORE-7", { priority: 1, status: "in-progress", assigneeId: VIEWER }),
  ]);
  assert.deepEqual(ids(await nextIssues(tracker, 10)), ["CORE-3", "CORE-4", "CORE-2", "CORE-1"]);
});

test("Linear lists the scope it's given", async () => {
  const tracker = stubTracker("linear", []);
  await nextIssues(tracker, 1, "project:p1");
  assert.deepEqual(tracker.listed, ["project:p1"]);
});

test("Beads ranks its open issues by priority, then oldest first", async () => {
  const tracker = stubTracker("beads", [
    issue("notes-a", { priority: 3, created: "2026-01-01T00:00:00Z" }),
    issue("notes-b", { priority: 1, created: "2026-02-01T00:00:00Z" }),
    issue("notes-c", { priority: 1, created: "2026-01-01T00:00:00Z" }),
    issue("notes-d", { priority: 0, created: "2025-01-01T00:00:00Z" }),
    issue("notes-e", { status: "backlog", priority: 1 }),
    issue("notes-f", { status: "in-progress", priority: 1 }),
  ]);
  assert.deepEqual(ids(await nextIssues(tracker, 10)), ["notes-c", "notes-b", "notes-a", "notes-d"]);
});

for (const kind of ["github", "linear", "beads"]) {
  test(`${kind} leaves out issues an unfinished issue blocks`, async () => {
    const tracker = stubTracker(kind, [issue("A-1", { blockedBy: ["A-2"] }), issue("A-2")]);
    assert.deepEqual(ids(await nextIssues(tracker, 10)), ["A-2"]);
  });
}

test("returns at most the count asked for", async () => {
  const tracker = stubTracker("beads", [issue("A-1"), issue("A-2"), issue("A-3")]);
  assert.equal((await nextIssues(tracker, 2)).length, 2);
});

function useStubbedTracker(t, tracker) {
  useTracker(t, tracker);
  process.chdir(createRepository(temporaryFolder(t)));
}

async function run(t, ...args) {
  const out = [],
    err = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", (line) => err.push(line));
  const code = await main(args);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const GITHUB_ISSUES = [issue("#1"), issue("#2"), issue("#3", { status: "in-progress" })];

test("next prints each issue's ID and title, fewer when fewer qualify", async (t) => {
  useStubbedTracker(t, stubTracker("github", GITHUB_ISSUES));
  const result = await run(t, "next", "5");
  assert.equal(result.code, 0, result.err);
  assert.equal(result.out, "#1\tTitle of #1\n#2\tTitle of #2");
});

test("next --json prints the issues", async (t) => {
  useStubbedTracker(t, stubTracker("github", GITHUB_ISSUES));
  const result = await run(t, "next", "1", "--json");
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(JSON.parse(result.out), [GITHUB_ISSUES[0]]);
});

test("next lists the scope it's given, and refuses one the tracker doesn't have", async (t) => {
  const tracker = stubTracker("linear", [], {
    scopes: [
      { id: "mine", label: "My issues" },
      { id: "team", label: "Issues" },
    ],
  });
  useStubbedTracker(t, tracker);
  assert.equal((await run(t, "next", "1", "team")).code, 0);
  assert.deepEqual(tracker.listed, ["team"]);
  const refused = await run(t, "next", "1", "nowhere");
  assert.equal(refused.code, 1);
  assert.match(refused.err, /nowhere: no such scope/);
});

for (const args of [[], ["0"], ["-1"], ["two"], ["1.5"], ["1", "team", "extra"]]) {
  test(`next ${args.join(" ") || "without a number"} exits with the usage status`, async (t) => {
    useStubbedTracker(t, stubTracker("github", GITHUB_ISSUES));
    assert.equal((await run(t, "next", ...args)).code, 2);
  });
}

test("--help lists next", async (t) => {
  const result = await run(t, "--help");
  assert.match(result.out, /^ {2}next <n> \[<scope>\] \[--json\]$/m);
});
