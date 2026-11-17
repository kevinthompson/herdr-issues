// The layout of setup's pages: each step's question as a heading above sections whose cards hold the tracker
// rows, Linear's team dropdown or the review's answers, as the settings view draws its own.
import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { byId, callArg, texts, walk } from "./support/gpui.js";
import { TrackerSetup } from "../mod/setup.js";

const theme = new Proxy({}, { get: () => "#000" });
const cx = {
  focus_handle: () => ({ focus() {}, is_focused: () => false }),
  notify() {},
  spawn() {},
};
const proposed = { approval: "ask", onApproval: "pull-request", waitForChecks: "yes", pushAfterMerge: "no" };

function startedSetup() {
  const setup = new TrackerSetup("/repo", () => {});
  setup.settingUp = true;
  return setup;
}

const render = (setup) => setup.render(theme, { onRetry() {}, header: null, onCollapse() {} });

// The bordered card holding `text`.
const cardWith = (page, text) =>
  [...walk(page)].find((node) => node.calls.some(([name]) => name === "border_1") && texts(node).includes(text));

test("the tracker step lists each tracker as a row in one card under a Tracker heading", (t) => {
  stubHerdr(t);
  const page = render(startedSetup());
  const card = cardWith(page, "GitHub Issues");

  assert.ok(texts(page).includes("TRACKER"));
  assert.deepEqual(
    card.kids.map((row) => callArg(row, "id")),
    ["setup-tracker-github", "setup-tracker-linear", "setup-tracker-beads"],
  );
  assert.ok(texts(page).includes("Where do this repository's issues live?"));
  assert.equal(texts(card).includes("Where do this repository's issues live?"), false);
});

test("pressing a tracker's row runs its check, and the checked tracker is marked", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  const choose = t.mock.method(setup.tracker, "choose", () => {});
  callArg(byId(render(setup), "setup-tracker-linear"), "on_click")(null, cx);

  assert.deepEqual(choose.mock.calls[0].arguments.slice(0, 1), ["linear"]);
  setup.tracker.choice = "beads";
  const page = render(setup);
  assert.ok(texts(byId(page, "setup-tracker-beads")).includes("✓"));
  assert.equal(texts(byId(page, "setup-tracker-github")).includes("✓"), false);
});

test("while a tracker is checked, its rows can't be pressed and the check's status shows", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "github";
  setup.tracker.checking = true;
  const page = render(setup);

  assert.equal(callArg(byId(page, "setup-tracker-github"), "on_click"), undefined);
  assert.ok(texts(page).includes("Checking…"));
  assert.equal(texts(byId(page, "setup-tracker-github")).includes("✓"), false);
});

test("back on the tracker step, Next goes on with the tracker that passed its check", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "github";
  setup.ready(proposed, cx);
  setup.back(cx);
  assert.equal(setup.step, "tracker");

  callArg(byId(render(setup), "setup-tracker-next"), "on_click")(null, cx);
  assert.equal(setup.step, "approval");
});

test("the tracker step has no Next before a tracker's check passes", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "github";

  assert.equal(byId(render(setup), "setup-tracker-next"), undefined);
});

test("Linear's team step shows the team dropdown in a card under a Team heading", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "linear";
  setup.ready(proposed, cx);
  setup.tracker.teams = [{ key: "ENG", name: "Engineering" }];
  const page = render(setup);
  const card = [...walk(page)].find(
    (node) => node.calls.some(([name]) => name === "border_1") && byId(node, "setup-team"),
  );

  assert.equal(setup.step, "team");
  assert.ok(texts(page).includes("TEAM"));
  assert.ok(card);
  assert.equal(texts(card).includes("Which Linear team?"), false);
});

// A setup on its review, having chosen Linear's ENG team and answered approval with `answers`.
function reviewingSetup(answers) {
  const setup = startedSetup();
  setup.tracker.choice = "linear";
  setup.tracker.teams = [{ key: "ENG", name: "Engineering" }];
  setup.tracker.team = "ENG";
  setup.ready(proposed, cx);
  Object.assign(setup, { answers, step: "review" });
  return setup;
}

// Each row of the card holding `text`, as its texts.
const cardRows = (page, text) => cardWith(page, text).kids.map((row) => texts(row));

test("the review lists each answer as a name and value row, in cards under Tracker and Approval", (t) => {
  stubHerdr(t);
  const page = render(reviewingSetup({ approval: "ask", onApproval: "pull-request", waitForChecks: "yes" }));

  assert.ok(texts(page).includes("TRACKER"));
  assert.ok(texts(page).includes("APPROVAL"));
  assert.deepEqual(cardRows(page, "Issue source"), [
    ["Issue source", "Linear"],
    ["Team", "Engineering (ENG)"],
  ]);
  assert.deepEqual(cardRows(page, "Approve work"), [
    ["Approve work", "Ask me"],
    ["When approved", "Open a pull request"],
    ["Wait for checks", "Wait for checks"],
  ]);
});

test("the review's approval card names Push main after a merge", (t) => {
  stubHerdr(t);
  const page = render(reviewingSetup({ approval: "auto", onApproval: "merge", pushAfterMerge: "no" }));

  assert.deepEqual(cardRows(page, "Approve work").at(-1), ["Push main", "Don't push"]);
});

test("the review ends with the gear hint and Save, and a save problem shows with its retry instead of Save", (t) => {
  stubHerdr(t);
  const setup = reviewingSetup({ approval: "ask", onApproval: "merge", pushAfterMerge: "no" });
  const hint = "Change this repository's other settings later with the gear in the panel's header.";
  const page = render(setup);

  assert.ok(byId(page, "setup-save"));
  assert.ok(texts(page).includes(hint));

  setup.saveProblem = { message: "Could not write issues.json." };
  const failed = render(setup);
  assert.equal(byId(failed, "setup-save"), undefined);
  assert.ok(byId(failed, "setup-problem-check"));
  assert.ok(texts(failed).includes("Could not write issues.json."));
  assert.ok(texts(failed).includes(hint));
});

test("a configured tracker that fails to load shows the problem under a page heading", (t) => {
  stubHerdr(t);
  const setup = new TrackerSetup("/repo", () => {});
  setup.showFailure({ message: "gh isn't logged in." });
  const page = render(setup);

  assert.ok(texts(page).includes("Issues can't load"));
  assert.ok(texts(page).includes("gh isn't logged in."));
  assert.ok(byId(page, "setup-failure-check"));
  assert.ok(byId(page, "setup-choose-another"));
});
