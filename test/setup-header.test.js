import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { byId, callArg, texts, walk } from "./support/gpui.js";
import { iconButton } from "../mod/header.js";
import { TrackerSetup } from "../mod/setup.js";

const theme = new Proxy({}, { get: () => "#000" });

function setupAt(step, { checking = false, saving = false, failure = null } = {}) {
  const setup = new TrackerSetup("/repo", () => {});
  setup.step = step;
  setup.failure = failure;
  setup.saving = saving;
  setup.tracker.checking = checking;
  setup.proposed = { approval: "ask", onApproval: "merge", waitForChecks: false };
  return setup;
}

test("the setup header reads Issues then Setup, with Cancel and collapse on its right", (t) => {
  stubHerdr(t);
  const bar = setupAt("tracker").stepBar(theme);

  assert.deepEqual(texts(bar).slice(0, 2), ["Issues", "Setup"]);
  assert.ok(byId(bar, "setup-cancel"));
  assert.ok(byId(bar, "issues-collapse"));
  assert.equal(texts(bar).includes("Set up issues"), false);
});

test("Cancel is an icon button styled as the settings gear, just before collapse, and drops the answers", (t) => {
  stubHerdr(t);
  const setup = setupAt("approval");
  setup.settingUp = true;
  const bar = setup.stepBar(theme);
  const cancel = byId(bar, "setup-cancel");
  const gear = iconButton({ id: "issues-settings-open", icon: "settings", tooltip: "Settings", onClick() {} }, theme);

  assert.equal(callArg(cancel, "tooltip"), "Cancel setup");
  assert.equal(cancel.kids[0].calls.find(([name]) => name === "path")[1], "mods/issues/icons/x.svg");
  assert.deepEqual(
    cancel.calls.filter(([name]) => !["id", "tooltip", "on_click"].includes(name)).map(([name]) => name),
    gear.calls.filter(([name]) => !["id", "tooltip", "on_click"].includes(name)).map(([name]) => name),
  );
  const trailing = [...walk(bar)].filter((node) => ["setup-cancel", "issues-collapse"].includes(callArg(node, "id")));
  assert.deepEqual(
    trailing.map((node) => callArg(node, "id")),
    ["setup-cancel", "issues-collapse"],
  );

  callArg(cancel, "on_click")(null, { notify() {} });
  assert.equal(setup.settingUp, false);
  assert.equal(setup.step, "tracker");
});

test("the setup view's first step has no back button but shows its step count", (t) => {
  stubHerdr(t);
  const bar = setupAt("tracker").stepBar(theme);

  assert.equal(byId(bar, "setup-back"), undefined);
  assert.ok(texts(bar).some((text) => /^Step 1 of \d+$/.test(text)));
});

test("a later step shows an enabled back button, drawn with the other buttons' height", (t) => {
  stubHerdr(t);
  const setup = setupAt("approval");
  const back = byId(setup.stepBar(theme), "setup-back");

  assert.ok(back);
  assert.equal(callArg(back, "h"), 26);
  assert.equal(callArg(back, "tooltip"), "Back");
  assert.ok(back.calls.some(([name]) => name === "on_mouse_down"));
  assert.equal(setup.stepBarState().backEnabled, true);
  assert.match(setup.stepBarState().stepText, /^Step [2-9] of \d+$/);
});

test("the back button is disabled while checking or saving", (t) => {
  stubHerdr(t);
  assert.equal(setupAt("approval", { checking: true }).stepBarState().backEnabled, false);
  assert.equal(setupAt("approval", { saving: true }).stepBarState().backEnabled, false);
});

test("a failure shows the back button on the first step and hides Cancel", (t) => {
  stubHerdr(t);
  const bar = setupAt("tracker", { failure: { sentence: "No." } }).stepBar(theme);

  assert.ok(byId(bar, "setup-back"));
  assert.equal(byId(bar, "setup-cancel"), undefined);
});
