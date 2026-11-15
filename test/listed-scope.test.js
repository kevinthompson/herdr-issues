import assert from "node:assert/strict";
import { test } from "node:test";
import { listedScopeName, headerTitlePieces } from "../mod/listed-scope.js";
import { scopesFor } from "../mod/trackers/linear.js";

const project = {
  id: "p1", name: "Checkout redesign", url: "https://linear.app/project/p1", priority: 0, status: { name: "In Progress", type: "started" },
  projectMilestones: { nodes: [{ id: "m1", name: "Milestone 1", sortOrder: 1 }] },
};
const linear = {
  name: "Linear",
  scopes: scopesFor({ views: [{ id: "v1", name: "Bugs" }] }, { name: "Web", projects: [project] }),
};

test("My issues is named by its label alone", () => {
  assert.equal(listedScopeName(linear, "mine"), "My issues");
});

test("a team's lists and saved views are named after the team", () => {
  assert.equal(listedScopeName(linear, "triage"), "Web > Triage");
  assert.equal(listedScopeName(linear, "team"), "Web > Issues");
  assert.equal(listedScopeName(linear, "view:v1"), "Web > Bugs");
});

test("a project is named after the team, not its projects group", () => {
  assert.equal(listedScopeName(linear, "project:p1"), "Web > Checkout redesign");
});

test("a selected milestone follows its project", () => {
  assert.equal(listedScopeName(linear, "project:p1:m1"), "Web > Checkout redesign > Milestone 1");
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

test("the header titles each tracker by the repository's name, then the tracker's name, without the owner", () => {
  assert.deepEqual(headerTitlePieces({ name: "GitHub", repo: "kevinthompson/herdr-issues" }, "herdr-issues"), ["herdr-issues", "GitHub"]);
  assert.deepEqual(headerTitlePieces({ name: "Linear", scopes: [] }, "calendar"), ["calendar", "Linear"]);
  assert.deepEqual(headerTitlePieces({ name: "Beads" }, "notes"), ["notes", "Beads"]);
});

test("before the name setting loads, the header shows only the tracker's name", () => {
  assert.deepEqual(headerTitlePieces({ name: "GitHub", repo: "kevinthompson/herdr-issues" }, null), ["GitHub"]);
});
