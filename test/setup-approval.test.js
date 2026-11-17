// Setup's approval step: one page asking approval, onApproval and, depending on onApproval, waitForChecks or
// pushAfterMerge, each a select of the settings view's choices with the chosen option's detail, and one Next.
import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { byId, callArg, texts } from "./support/gpui.js";
import { APPROVAL_QUESTIONS, TrackerSetup } from "../mod/setup.js";

const theme = new Proxy({}, { get: () => "#000" });
const cx = {
  focus_handle: () => ({ focus() {}, is_focused: () => false }),
  notify() {},
};

function readySetup(proposed = { approval: "ask", onApproval: "merge", waitForChecks: "no", pushAfterMerge: "no" }) {
  const setup = new TrackerSetup("/repo", () => {});
  setup.tracker.choice = "github";
  setup.settingUp = true;
  setup.ready(proposed, cx);
  return setup;
}

// The approval page, with the props each question's select was last rendered with, by question.
function renderApproval(t, setup) {
  const renders = Object.fromEntries(
    Object.entries(setup.selects).map(([key, select]) => [key, t.mock.method(select, "render")]),
  );
  const page = setup.render(theme, { onRetry() {}, header: null, onCollapse() {} });
  const props = Object.fromEntries(
    Object.entries(renders)
      .filter(([, render]) => render.mock.calls.length > 0)
      .map(([key, render]) => [key, render.mock.calls.at(-1).arguments[1]]),
  );
  return { page, props };
}

const pressNext = (page) => callArg(byId(page, "setup-approval-next"), "on_click")(null, cx);

test("the approval questions share one step between the tracker and the review", (t) => {
  stubHerdr(t);
  const setup = readySetup();

  assert.equal(setup.step, "approval");
  assert.deepEqual(setup.steps(), ["tracker", "approval", "review"]);
});

test("the approval step asks each question with a select of its choices and the chosen option's detail", (t) => {
  stubHerdr(t);
  const setup = readySetup();
  const { page, props } = renderApproval(t, setup);

  assert.deepEqual(Object.keys(props), ["approval", "onApproval", "pushAfterMerge"]);
  for (const [key, { options, value }] of Object.entries(props)) {
    assert.deepEqual(options, APPROVAL_QUESTIONS[key].choices);
    assert.equal(value, setup.approvalValue(key));
    assert.ok(texts(page).includes(APPROVAL_QUESTIONS[key].title));
    assert.ok(texts(page).includes(APPROVAL_QUESTIONS[key].choices.find(({ id }) => id === value).detail));
  }
});

test("onApproval's choice decides whether waitForChecks or pushAfterMerge is asked on the same step", (t) => {
  stubHerdr(t);
  const setup = readySetup();

  renderApproval(t, setup).props.onApproval.onChoose("pull-request", cx);
  assert.equal(setup.step, "approval");
  assert.deepEqual(Object.keys(renderApproval(t, setup).props), ["approval", "onApproval", "waitForChecks"]);

  renderApproval(t, setup).props.onApproval.onChoose("merge", cx);
  assert.deepEqual(Object.keys(renderApproval(t, setup).props), ["approval", "onApproval", "pushAfterMerge"]);
});

test("Next records the shown questions' values for the review", (t) => {
  stubHerdr(t);
  const setup = readySetup({ approval: "ask", onApproval: "merge", waitForChecks: "yes", pushAfterMerge: "yes" });
  pressNext(renderApproval(t, setup).page);

  assert.equal(setup.step, "review");
  assert.deepEqual(setup.answers, { approval: "ask", onApproval: "merge", pushAfterMerge: "yes" });
});

test("Next after choosing a pull request records waitForChecks instead of pushAfterMerge", (t) => {
  stubHerdr(t);
  const setup = readySetup({ approval: "auto", onApproval: "merge", waitForChecks: "yes", pushAfterMerge: "no" });
  renderApproval(t, setup).props.onApproval.onChoose("pull-request", cx);
  pressNext(renderApproval(t, setup).page);

  assert.deepEqual(setup.answers, { approval: "auto", onApproval: "pull-request", waitForChecks: "yes" });
});

test("going back from the review shows the earlier answers", (t) => {
  stubHerdr(t);
  const setup = readySetup();
  renderApproval(t, setup).props.approval.onChoose("auto", cx);
  pressNext(renderApproval(t, setup).page);

  setup.back(cx);
  assert.equal(setup.step, "approval");
  assert.equal(renderApproval(t, setup).props.approval.value, "auto");
});
