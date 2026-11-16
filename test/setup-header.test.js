import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { byId, callArg, texts } from "./support/gpui.js";
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
