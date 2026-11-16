import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { byId, callArg, div, texts, walk } from "./support/gpui.js";
import { detailHeader } from "../mod/detail.js";

const theme = new Proxy({}, { get: () => "#000" });

const view = {
  failedEditAlert: div().id("failed-edit-alert"),
  refreshButton: div().id("issues-refresh"),
  settingsButton: div().id("issues-settings"),
  onCollapse: () => {},
};

test("the issue view's header shows the issues icon, then Issues and Detail", (t) => {
  stubHerdr(t);
  const bar = detailHeader(view, theme);

  const icon = [...walk(bar)].find((node) => node.tag === "svg");
  assert.equal(callArg(icon, "path"), "mods/issues/icons/issues.svg");
  assert.deepEqual(texts(bar).slice(0, 2), ["Issues", "Detail"]);
});

test("the issue view's header keeps its alert, refresh, settings and collapse buttons", (t) => {
  stubHerdr(t);
  const bar = detailHeader(view, theme);

  for (const id of ["failed-edit-alert", "issues-refresh", "issues-settings", "issues-collapse"])
    assert.ok(byId(bar, id));
});
