// Setup's approval, onApproval, waitForChecks and pushAfterMerge steps: a select of the settings view's choices, the chosen
// option's detail, and Next.
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

// The step's page, with the props its select was rendered with.
function renderStep(t, setup) {
  const select = setup.selects[setup.step];
  const render = t.mock.method(select, "render");
  const page = setup.render(theme, { onRetry() {}, header: null, onCollapse() {} });
  return { page, props: render.mock.calls.at(-1).arguments[1] };
}

const pressNext = (page, key) => callArg(byId(page, `setup-${key}-next`), "on_click")(null, cx);

test("each approval step renders a select of its question's choices instead of buttons", (t) => {
  stubHerdr(t);
  const setup = readySetup();
  for (const key of ["approval", "onApproval", "waitForChecks", "pushAfterMerge"]) {
    setup.step = key;
    const { page, props } = renderStep(t, setup);

    assert.deepEqual(props.options, APPROVAL_QUESTIONS[key].choices);
    for (const { id } of APPROVAL_QUESTIONS[key].choices) assert.equal(byId(page, `setup-${key}-${id}`), undefined);
    assert.ok(byId(page, `setup-${key}-next`));
  }
});

test("a select starts on the proposed value, shows its detail, and starts on the earlier answer when revisited", (t) => {
  stubHerdr(t);
  const setup = readySetup();
  setup.step = "approval";
  let { page, props } = renderStep(t, setup);
  assert.equal(props.value, "ask");
  assert.ok(texts(page).includes(APPROVAL_QUESTIONS.approval.choices[0].detail));

  props.onChoose("auto", cx);
  assert.equal(setup.step, "approval");
  pressNext(renderStep(t, setup).page, "approval");
  assert.equal(setup.step, "onApproval");

  setup.back(cx);
  ({ page, props } = renderStep(t, setup));
  assert.equal(props.value, "auto");
  assert.ok(texts(page).includes(APPROVAL_QUESTIONS.approval.choices[1].detail));
});

test("onApproval's choice decides whether waitForChecks or pushAfterMerge is asked, and Next follows it", (t) => {
  stubHerdr(t);
  const setup = readySetup();
  setup.step = "onApproval";
  const { props } = renderStep(t, setup);

  props.onChoose("pull-request", cx);
  assert.deepEqual(setup.steps(), ["tracker", "approval", "onApproval", "waitForChecks", "review"]);
  props.onChoose("merge", cx);
  assert.deepEqual(setup.steps(), ["tracker", "approval", "onApproval", "pushAfterMerge", "review"]);

  pressNext(renderStep(t, setup).page, "onApproval");
  assert.equal(setup.step, "pushAfterMerge");
  assert.deepEqual(setup.answers, { onApproval: "merge" });
});

test("Next on pushAfterMerge records the select's value for the review", (t) => {
  stubHerdr(t);
  const setup = readySetup({ approval: "ask", onApproval: "merge", waitForChecks: "yes", pushAfterMerge: "yes" });
  for (const key of ["approval", "onApproval", "pushAfterMerge"]) {
    setup.step = key;
    pressNext(renderStep(t, setup).page, key);
  }

  assert.equal(setup.step, "review");
  assert.deepEqual(setup.answers, { approval: "ask", onApproval: "merge", pushAfterMerge: "yes" });
});

test("Next on waitForChecks records the select's value for the review", (t) => {
  stubHerdr(t);
  const setup = readySetup({ approval: "auto", onApproval: "pull-request", waitForChecks: "yes" });
  for (const key of ["approval", "onApproval", "waitForChecks"]) {
    setup.step = key;
    pressNext(renderStep(t, setup).page, key);
  }

  assert.equal(setup.step, "review");
  assert.deepEqual(setup.answers, { approval: "auto", onApproval: "pull-request", waitForChecks: "yes" });
});
