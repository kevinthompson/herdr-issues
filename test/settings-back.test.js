import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { callArg } from "./support/gpui.js";
import { actionButton } from "../mod/action-button.js";
import { SettingsView } from "../mod/settings.js";

const theme = new Proxy({}, { get: () => "#000" });

const backButtonWhile = (leaving, back = () => {}) => SettingsView.prototype.backButton.call({ leaving, back }, theme);
const calledNames = (node) => node.calls.map(([name]) => name);

test("the settings back button is drawn like the issue view's back button", (t) => {
  stubHerdr(t);
  const back = backButtonWhile(false);
  const issueBack = actionButton({ id: "issue-back", icon: "chevron-left", tooltip: "Back", onClick: () => {} }, theme);

  assert.equal(callArg(back, "id"), "settings-back");
  assert.equal(callArg(back, "tooltip"), "Back");
  assert.deepEqual(calledNames(back), calledNames(issueBack));
  assert.equal(callArg(back, "h"), callArg(issueBack, "h"));
  assert.equal(callArg(back, "w"), callArg(issueBack, "w"));
  assert.equal(callArg(back.kids[0], "path"), "mods/issues/icons/chevron-left.svg");
});

test("clicking the settings back button goes back", (t) => {
  stubHerdr(t);
  let wentBack = false;
  const back = backButtonWhile(false, () => (wentBack = true));

  callArg(back, "on_click")(null, {});
  assert.equal(wentBack, true);
});

test("the settings back button is dimmed and inert while the view is leaving", (t) => {
  stubHerdr(t);
  const back = backButtonWhile(true);

  assert.ok(callArg(back, "opacity") < 1);
  for (const name of ["on_click", "cursor_pointer", "hover"]) assert.equal(calledNames(back).includes(name), false);
});
