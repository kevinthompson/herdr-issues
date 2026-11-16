import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { useTracker } from "./support/tracker.js";
import { createRepository, temporaryFolder } from "./support/repository.js";

const { main } = await import("../cli/main.js");

const startingFolder = process.cwd();
afterEach(() => process.chdir(startingFolder));

const issue = (id, status, title) => ({ id, status, title, priority: 0, labels: [], blockedBy: [] });

const SCOPES = [
  { id: "mine", label: "My issues" },
  { id: "team", label: "Issues", group: "Core" },
  { id: "project:p1", label: "Panel", group: "Core Projects", milestones: [{ id: "project:p1:m1", label: "Beta" }] },
];

const ISSUES_BY_SCOPE = {
  mine: [issue("CORE-1", "todo", "Mine first"), issue("CORE-2", "backlog", "Mine later")],
  team: [issue("CORE-3", "in-progress", "The team's")],
  "project:p1:m1": [issue("CORE-4", "todo", "In the milestone")],
};

// A tracker in a fresh repository listing ISSUES_BY_SCOPE, with SCOPES unless `scopes` is null; records each
// list call as [scope ID, the groups loaded].
function stubbedTracker(t, { scopes = SCOPES } = {}) {
  const calls = [];
  useTracker(t, {
    kind: "linear",
    name: "Linear",
    team: "CORE",
    scopes: scopes ?? undefined,
    async list(scopeId, loads) {
      calls.push([scopeId, [...loads]]);
      return ISSUES_BY_SCOPE[scopeId ?? "mine"];
    },
  });
  process.chdir(createRepository(temporaryFolder(t)));
  return calls;
}

async function run(t, ...args) {
  const out = [],
    err = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", (line) => err.push(line));
  const code = await main(args);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("scopes prints each scope's ID, label and group, default first, milestones under their project", async (t) => {
  stubbedTracker(t);
  const result = await run(t, "scopes");
  assert.equal(result.code, 0, result.err);
  assert.equal(
    result.out,
    ["mine\tMy issues", "team\tIssues\tCore", "project:p1\tPanel\tCore Projects", "project:p1:m1\tBeta\tPanel"].join(
      "\n",
    ),
  );
});

test("scopes --json prints the tracker's scopes", async (t) => {
  stubbedTracker(t);
  const result = await run(t, "scopes", "--json");
  assert.deepEqual(JSON.parse(result.out), SCOPES);
});

test("scopes prints just the default for a tracker with one list", async (t) => {
  stubbedTracker(t, { scopes: null });
  assert.equal((await run(t, "scopes")).out, "default\tLinear");
  assert.deepEqual(JSON.parse((await run(t, "scopes", "--json")).out), [{ id: "default", label: "Linear" }]);
});

test("list prints the default scope's open issues, Backlog's included", async (t) => {
  const calls = stubbedTracker(t);
  const result = await run(t, "list");
  assert.equal(result.code, 0, result.err);
  assert.equal(result.out, "CORE-1\ttodo\tMine first\nCORE-2\tbacklog\tMine later");
  assert.deepEqual(calls, [[undefined, ["backlog"]]]);
});

test("list prints a named scope's issues, a milestone's among them", async (t) => {
  stubbedTracker(t);
  assert.equal((await run(t, "list", "team")).out, "CORE-3\tin-progress\tThe team's");
  assert.equal((await run(t, "list", "project:p1:m1")).out, "CORE-4\ttodo\tIn the milestone");
});

test("list --json prints the issues as the tracker returns them", async (t) => {
  stubbedTracker(t);
  const result = await run(t, "list", "team", "--json");
  assert.deepEqual(JSON.parse(result.out), ISSUES_BY_SCOPE.team);
});

test("list refuses an unknown scope, naming the scopes there are", async (t) => {
  const calls = stubbedTracker(t);
  const result = await run(t, "list", "nowhere");
  assert.equal(result.code, 1);
  assert.equal(result.out, "");
  assert.equal(result.err, "nowhere: no such scope; the scopes are mine, team, project:p1, project:p1:m1");
  assert.deepEqual(calls, []);
});

test("list takes the default scope's ID for a tracker with one list", async (t) => {
  const calls = stubbedTracker(t, { scopes: null });
  assert.equal((await run(t, "list", "default")).code, 0);
  assert.deepEqual(calls, [[undefined, ["backlog"]]]);
});

test("scopes and list appear in issues --help", async (t) => {
  const { out } = await run(t, "--help");
  assert.match(out, /^ {2}scopes \[--json\]/m);
  assert.match(out, /^ {2}list \[<scope>\] \[--json\]/m);
});
