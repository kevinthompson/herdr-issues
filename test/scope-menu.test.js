import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { byId, callArg, texts, walk } from "./support/gpui.js";
import { openScopeMenu, openLabelMenu, ScopeMenu, HAIR_SPACE } from "../mod/menu.js";
import { scopesFor } from "../mod/trackers/linear.js";

const THEME = { foreground: "#eeeeee", muted: "#999999", border: "#333333", popover: "#111111" };

/** @param {string} type */
const project = (id, type) => ({
  id,
  name: `Project ${id}`,
  url: `https://linear.app/project/${id}`,
  priority: 0,
  status: { name: type, type },
  projectMilestones: { nodes: [] },
});
const linearScopes = scopesFor(
  { views: [{ id: "v1", name: "Bugs" }] },
  {
    name: "Web",
    projects: [project("p1", "started"), project("p2", "planned"), project("p3", "paused"), project("p4", "backlog")],
  },
);

// The scope menu `open` opens, rendered, with the height it was opened at.
function openAndRender(t, open) {
  let overlay;
  stubHerdr(t, { openOverlay: (options) => (overlay = options), theme: () => THEME });
  open();
  stubHerdr(t, { props: () => overlay.props, theme: () => THEME });
  return { menu: new ScopeMenu().render(), height: overlay.height };
}

const iconOf = (option) =>
  [...walk(option)].find((node) => node !== option && ["svg", "image"].includes(node.tag) && callArg(node, "path"));

test("My issues shows the person icon", (t) => {
  const { menu } = openAndRender(t, () => openScopeMenu(linearScopes, "mine", "repo"));
  assert.equal(callArg(iconOf(byId(menu, "option-mine")), "path"), "mods/issues/icons/user.svg");
});

test("each project shows the icon of the closest issue status", (t) => {
  const { menu } = openAndRender(t, () => openScopeMenu(linearScopes, "mine", "repo"));
  const icons = ["p1", "p2", "p3", "p4"].map((id) => callArg(iconOf(byId(menu, `option-project:${id}`)), "path"));
  assert.deepEqual(icons, [
    "mods/issues/icons/in-progress.png",
    "mods/issues/icons/todo.png",
    "mods/issues/icons/blocked.png",
    "mods/issues/icons/backlog.png",
  ]);
});

test("each project status subheading shows its status's icon before its dimmed text", (t) => {
  const { menu } = openAndRender(t, () => openScopeMenu(linearScopes, "mine", "repo"));
  const subheadings = ["started", "planned", "paused", "backlog"].map((status) => byId(menu, `subheading-${status}`));
  assert.deepEqual(
    subheadings.map((subheading) => callArg(iconOf(subheading), "path")),
    [
      "mods/issues/icons/in-progress.png",
      "mods/issues/icons/todo.png",
      "mods/issues/icons/blocked.png",
      "mods/issues/icons/backlog.png",
    ],
  );
  for (const subheading of subheadings) {
    assert.equal(iconOf(subheading.kids[0]), iconOf(subheading));
    assert.ok(callArg(iconOf(subheading), "size") < callArg(iconOf(byId(menu, "option-mine")), "size"));
  }
});

test("subheadings without an icon show only their text", (t) => {
  const scopes = [
    { id: "a", label: "A", subgroup: "Plain" },
    { id: "b", label: "B" },
  ];
  const { menu } = openAndRender(t, () => openScopeMenu(scopes, "a", "repo"));
  const subheading = byId(menu, "subheading-Plain");
  assert.equal(iconOf(subheading), undefined);
  assert.deepEqual(texts(subheading), ["Plain"]);
});

test("the team's views line their text up with the options that have icons", (t) => {
  const { menu } = openAndRender(t, () => openScopeMenu(linearScopes, "mine", "repo"));
  const iconWidth = callArg(iconOf(byId(menu, "option-mine")), "size");
  for (const id of ["triage", "team", "view:v1"]) {
    const [spacer] = byId(menu, `option-${id}`).kids;
    assert.equal(callArg(spacer, "w"), iconWidth, id);
  }
});

test("group headings are muted semibold capitals without a band, divided from the section above", (t) => {
  const { menu } = openAndRender(t, () => openScopeMenu(linearScopes, "mine", "repo"));
  for (const heading of ["heading-Web", "heading-Web Projects"]) {
    const node = byId(menu, heading);
    assert.equal(callArg(node, "bg"), undefined, heading);
    assert.equal(callArg(node, "text_color"), THEME.muted);
    assert.ok(node.calls.some(([name]) => name === "font_semibold"));
    assert.ok(callArg(node, "text_size") > 10.5);
    assert.equal(callArg(node, "border_t"), 1);
    assert.ok(texts(node).join("").startsWith(["W", "E", "B"].join(HAIR_SPACE)));
  }
});

// The height the rendered rows take: each row's height or border, and its margins, inside the list's padding.
const renderedHeight = (menu) =>
  menu.kids.reduce(
    (height, row) =>
      height +
      (callArg(row, "h") ?? callArg(row, "border_t") ?? 0) +
      (callArg(row, "mt") ?? 0) +
      (callArg(row, "mb") ?? 0) +
      (callArg(row, "my") ?? 0) * 2,
    callArg(menu, "py") * 2,
  );

test("the menu opens at the height its rows take", (t) => {
  const { menu, height } = openAndRender(t, () => openScopeMenu(linearScopes.slice(0, 6), "mine", "repo"));
  assert.equal(height, renderedHeight(menu));
});

test("scopes without icons, such as GitHub's and the labels', keep today's inset", (t) => {
  const githubScopes = [
    { id: "open", label: "Open" },
    { id: "mine", label: "Assigned to me" },
  ];
  for (const open of [
    () => openScopeMenu(githubScopes, "open", "repo"),
    () => openLabelMenu(["bug", "feature"], null, "repo"),
  ]) {
    const { menu } = openAndRender(t, open);
    for (const option of menu.kids) {
      assert.equal(iconOf(option), undefined);
      assert.ok(option.kids[0].calls.some(([name]) => name === "flex_1"));
    }
  }
});
