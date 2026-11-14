import assert from "node:assert/strict";
import { test } from "node:test";
import { collapsibleNodeId, isCollapsed, remembersWidth } from "../mod/collapse.js";

const issuesBlock = { id: "issues", type: "block", content: { mod: "issues" } };
const workBody = (children) => ({
  id: "root", type: "row", children: [{ id: "work", type: "column", children: [{ id: "work-body", type: "row", children }] }],
});

test("collapsibleNodeId finds the column holding the panel beside the side panel", () => {
  const layout = workBody([
    { id: "main", type: "block" },
    { id: "panel", type: "column", children: [{ id: "panel-body", type: "stack", children: [{ id: "files", type: "block" }] }] },
    { id: "issues-panel", type: "column", children: [issuesBlock] },
  ]);

  assert.equal(collapsibleNodeId(layout), "issues-panel");
});

test("collapsibleNodeId takes the panel's own block when a row holds it", () => {
  assert.equal(collapsibleNodeId(workBody([{ id: "main", type: "block" }, issuesBlock])), "issues");
});

test("collapsibleNodeId is null when the layout doesn't place the panel", () => {
  assert.equal(collapsibleNodeId(workBody([{ id: "main", type: "block" }])), null);
  assert.equal(collapsibleNodeId({ id: "root", type: "column", children: [issuesBlock] }), null);
  assert.equal(collapsibleNodeId(null), null);
});

test("a panel narrower than the threshold is collapsed, and only wide ones are remembered", () => {
  assert.equal(isCollapsed(32), true);
  assert.equal(isCollapsed(63), true);
  assert.equal(isCollapsed(64), false);
  assert.equal(isCollapsed(undefined), false);
  assert.equal(remembersWidth(200), false);
  assert.equal(remembersWidth(368), true);
});
