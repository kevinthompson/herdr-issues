import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import {
  COLLAPSED_PX, DEFAULT_EXPANDED_PX, collapsibleNodeId, isCollapsed, noticeWidth, remembersWidth, toggleCollapsed,
} from "../mod/collapse.js";

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

// Herdr as the panel sees it: layout.resize sets the node's size in px at zoom 1, and the panel measures its
// frame zoomed and inside the node's padding, as on_size_change reports it to noticeWidth.
function fakeHerdr(t, { px = 368, zoom = 1.2, inset = 8 } = {}) {
  const node = { id: "issues-panel", type: "column", size: { px }, children: [issuesBlock] };
  const root = workBody([{ id: "main", type: "block" }, node]);
  const values = {}, resizes = [];
  const measuredWidth = () => node.size.px * zoom - inset;
  const app = {
    resizes,
    measuredWidth,
    drag(px) { node.size = { px }; noticeWidth(measuredWidth()); },
    toggle() { toggleCollapsed(measuredWidth()); },
  };
  stubHerdr(t, {
    layout: () => root,
    shared: (key) => values[key],
    setShared: (key, value) => { values[key] = value; },
    run: (command, { id, ...size }) => {
      assert.equal(command, "layout.resize");
      assert.equal(id, "issues-panel");
      resizes.push(size);
      node.size = size;
      noticeWidth(measuredWidth());
    },
  });
  return app;
}

test("collapsing and expanding returns the panel to the width it had, however often it's toggled", (t) => {
  const app = fakeHerdr(t), width = app.measuredWidth();
  for (let cycle = 0; cycle < 5; cycle++) {
    app.toggle();
    assert.deepEqual(app.resizes.at(-1), { px: COLLAPSED_PX });
    app.toggle();
    assert.equal(app.measuredWidth(), width);
  }
});

test("a divider drag sets the width the panel returns to", (t) => {
  const app = fakeHerdr(t);
  app.drag(500);
  const width = app.measuredWidth();
  app.toggle();
  app.toggle();
  assert.equal(app.measuredWidth(), width);
});

test("a drag down to the strip expands to the last wide width it passed", (t) => {
  const app = fakeHerdr(t);
  app.drag(420);
  const width = app.measuredWidth();
  for (const px of [200, 100, COLLAPSED_PX]) app.drag(px);
  app.toggle();
  assert.equal(app.measuredWidth(), width);
});

test("expanding with no remembered width uses the default", (t) => {
  const app = fakeHerdr(t, { px: COLLAPSED_PX });
  app.toggle();
  assert.deepEqual(app.resizes, [{ px: DEFAULT_EXPANDED_PX }]);
});
