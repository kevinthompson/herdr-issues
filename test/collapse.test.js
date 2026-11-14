import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import {
  COLLAPSED_PX, collapsibleNodeId, isCollapsed, noticeWidth, remembersWidth, toggleCollapsed,
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

// Herdr as the panel sees it: the terminals' main node at weight 2 shares a row of `rowPx` with the panel's
// node, sized at zoom 1 in px or by weight, and the panel measures its frame zoomed and inside the node's
// padding, as on_size_change reports it to noticeWidth.
function fakeHerdr(t, { size = { weight: 1 }, rowPx = 1100, zoom = 1.2, inset = 8, values = {} } = {}) {
  const mainWeight = 2;
  const node = { id: "issues-panel", type: "column", size, children: [issuesBlock] };
  const root = workBody([{ id: "main", type: "block", size: { weight: mainWeight } }, node]);
  const resizes = [];
  let row = rowPx;
  const nodePx = () => node.size.px ?? (row * node.size.weight) / (node.size.weight + mainWeight);
  const measuredWidth = () => nodePx() * zoom - inset;
  const app = {
    resizes,
    measuredWidth,
    drag(weight) { node.size = { weight }; noticeWidth(measuredWidth()); },
    resizeWindow(px) { row = px; noticeWidth(measuredWidth()); },
    toggle() { toggleCollapsed(measuredWidth()); },
  };
  stubHerdr(t, {
    layout: () => root,
    shared: (key) => values[key],
    setShared: (key, value) => { values[key] = value; },
    run: (command, { id, ...resized }) => {
      assert.equal(command, "layout.resize");
      assert.equal(id, "issues-panel");
      resizes.push(resized);
      node.size = resized;
      noticeWidth(measuredWidth());
    },
  });
  return app;
}

test("collapsing and expanding returns the panel to the weight it had, however often it's toggled", (t) => {
  const app = fakeHerdr(t, { size: { weight: 0.8 } }), width = app.measuredWidth();
  for (let cycle = 0; cycle < 5; cycle++) {
    app.toggle();
    assert.deepEqual(app.resizes.at(-1), { px: COLLAPSED_PX });
    app.toggle();
    assert.deepEqual(app.resizes.at(-1), { weight: 0.8 });
    assert.equal(app.measuredWidth(), width);
  }
});

test("the expanded panel keeps its share when the window resizes while it's collapsed", (t) => {
  const app = fakeHerdr(t);
  app.toggle();
  app.resizeWindow(1600);
  assert.equal(app.measuredWidth(), COLLAPSED_PX * 1.2 - 8);
  app.toggle();
  assert.equal(app.measuredWidth(), (1600 / 3) * 1.2 - 8);
});

test("a divider drag sets the weight the panel returns to", (t) => {
  const app = fakeHerdr(t);
  app.drag(1.5);
  app.toggle();
  app.toggle();
  assert.deepEqual(app.resizes.at(-1), { weight: 1.5 });
});

test("a drag down to the strip expands to the last wide weight it passed", (t) => {
  const app = fakeHerdr(t);
  app.drag(1.2);
  for (const weight of [0.5, 0.2, 0.05]) app.drag(weight);
  app.toggle();
  assert.deepEqual(app.resizes.at(-1), { weight: 1.2 });
});

test("expanding with no remembered weight takes a third of the row beside the terminals", (t) => {
  const app = fakeHerdr(t, { size: { px: COLLAPSED_PX } });
  app.toggle();
  assert.deepEqual(app.resizes, [{ weight: 1 }]);
});

test("expanding a panel remembered in pixels gives it a weight instead", (t) => {
  const app = fakeHerdr(t, { size: { px: COLLAPSED_PX }, values: { "issues.expandedSize:main": { px: 368 } } });
  app.toggle();
  assert.deepEqual(app.resizes, [{ weight: 1 }]);
});

test("collapsing a panel fixed in pixels expands it to a weight", (t) => {
  const app = fakeHerdr(t, { size: { px: 368 } });
  app.toggle();
  app.toggle();
  assert.deepEqual(app.resizes, [{ px: COLLAPSED_PX }, { weight: 1 }]);
});

test("expanding beside unsized siblings takes half their default weight", (t) => {
  const node = { id: "issues-panel", type: "column", size: { px: COLLAPSED_PX }, children: [issuesBlock] };
  const resizes = [];
  stubHerdr(t, {
    layout: () => workBody([{ id: "main", type: "block" }, { id: "side", type: "column", size: { px: 368 } }, node]),
    run: (command, args) => { resizes.push(args); },
  });
  toggleCollapsed(COLLAPSED_PX);
  assert.deepEqual(resizes, [{ id: "issues-panel", weight: 0.5 }]);
});
