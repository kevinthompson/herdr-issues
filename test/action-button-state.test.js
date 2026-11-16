import assert from "node:assert/strict";
import { test } from "node:test";
import { actionButtonState } from "../mod/action-button-state.js";

test("an idle button is clickable at full opacity with its own icon", () => {
  assert.deepEqual(actionButtonState({}), { interactive: true, icon: null, spin: 0, opacity: 1, outlined: true });
});

test("a busy button spins rotate-cw for a second and ignores clicks", () => {
  const state = actionButtonState({ busy: true });
  assert.equal(state.interactive, false);
  assert.equal(state.icon, "rotate-cw");
  assert.equal(state.spin, 1000);
});

test("a disabled button is at half opacity and ignores clicks", () => {
  const state = actionButtonState({ enabled: false });
  assert.equal(state.interactive, false);
  assert.equal(state.opacity, 0.5);
  assert.equal(state.spin, 0);
});

test("a busy button that is also disabled still spins", () => {
  assert.equal(actionButtonState({ enabled: false, busy: true }).icon, "rotate-cw");
});

test("a secondary button is outlined and a primary one is not", () => {
  assert.equal(actionButtonState({}).outlined, true);
  assert.equal(actionButtonState({ primary: true }).outlined, false);
});

test("a disabled or busy secondary button stays outlined", () => {
  assert.equal(actionButtonState({ enabled: false }).outlined, true);
  assert.equal(actionButtonState({ busy: true }).outlined, true);
});
