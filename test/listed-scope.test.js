import assert from "node:assert/strict";
import { test } from "node:test";
import { listedScopeName } from "../mod/listed-scope.js";
import { scopesFor } from "../mod/trackers/linear.js";

const project = {
  id: "p1", name: "N+1 Project", url: "https://linear.app/project/p1", priority: 0, status: { name: "In Progress", type: "started" },
  projectMilestones: { nodes: [{ id: "m1", name: "Milestone 1", sortOrder: 1 }] },
};
const linear = {
  name: "Linear",
  scopes: scopesFor({ views: [{ id: "v1", name: "Bugs" }] }, { name: "Calendar", projects: [project] }),
};

test("My issues is named by its label alone", () => {
  assert.equal(listedScopeName(linear, "mine"), "My issues");
});

test("a team's lists and saved views are named after the team", () => {
  assert.equal(listedScopeName(linear, "triage"), "Calendar > Triage");
  assert.equal(listedScopeName(linear, "team"), "Calendar > Issues");
  assert.equal(listedScopeName(linear, "view:v1"), "Calendar > Bugs");
});

test("a project is named after the team, not its projects group", () => {
  assert.equal(listedScopeName(linear, "project:p1"), "Calendar > N+1 Project");
});

test("a selected milestone follows its project", () => {
  assert.equal(listedScopeName(linear, "project:p1:m1"), "Calendar > N+1 Project > Milestone 1");
});

test("a scope that no longer exists names the default scope", () => {
  assert.equal(listedScopeName(linear, "project:gone"), "My issues");
  assert.equal(listedScopeName(linear, undefined), "My issues");
});

test("a tracker without scopes is named by the tracker", () => {
  assert.equal(listedScopeName({ name: "GitHub", scopes: null }, undefined), "GitHub");
  assert.equal(listedScopeName({ name: "Beads" }, undefined), "Beads");
});

test("before a tracker is known, the name falls back to plain text", () => {
  assert.equal(listedScopeName(null, undefined), "Expand Issues");
  assert.equal(listedScopeName(undefined, "mine"), "Expand Issues");
});
