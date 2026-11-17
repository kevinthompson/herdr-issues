// The layout of setup's pages: each step's question as a heading above sections whose cards hold the tracker
// rows, Linear's team dropdown or the review's answers, as the settings view draws its own.
import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { byId, callArg, texts, walk } from "./support/gpui.js";
import { TrackerSetup } from "../mod/setup.js";
import { BEADS_NOT_INITIALIZED, LINEAR_KEY_PROBLEM } from "../mod/trackers/problems.js";
import { TEXT_SM_PX } from "../mod/type-scale.js";

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

// The tracker step's Next, and whether pressing it would do anything.
const trackerNext = (setup) => byId(render(setup), "setup-tracker-next");
const pressable = (button) => button.calls.some(([name]) => name === "on_click");

// Whether a tracker row's radio indicator is filled.
const radioFilled = (page, id) => Boolean(callArg(byId(page, `setup-tracker-${id}-radio`), "bg"));

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

test("pressing a tracker's row runs its check, and the chosen tracker's radio is filled", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  const choose = t.mock.method(setup.tracker, "choose", () => {});
  callArg(byId(render(setup), "setup-tracker-linear"), "on_click")(null, cx);

  assert.deepEqual(choose.mock.calls[0].arguments.slice(0, 1), ["linear"]);
  setup.tracker.choice = "beads";
  const page = render(setup);
  assert.ok(radioFilled(page, "beads"));
  assert.equal(radioFilled(page, "github"), false);
  assert.equal(callArg(byId(page, "setup-tracker-beads"), "on_click"), undefined);
  assert.ok(callArg(byId(page, "setup-tracker-github"), "on_click"));
});

test("while a tracker is checked, its rows can't be pressed and the check's status shows", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "github";
  setup.tracker.checking = true;
  const page = render(setup);

  assert.equal(callArg(byId(page, "setup-tracker-github"), "on_click"), undefined);
  assert.ok(texts(byId(page, "setup-tracker-github")).includes("Checking…"));
  assert.ok(radioFilled(page, "github"));
});

test("a failed check shows its problem, fix and buttons inside the chosen tracker's row", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "beads";
  setup.tracker.problem = { code: BEADS_NOT_INITIALIZED, message: "No Beads database.", fix: "Run `bd init`." };
  const row = byId(render(setup), "setup-tracker-beads");

  assert.ok(texts(row).includes("No Beads database."));
  assert.ok([...walk(row)].some((node) => callArg(node, "path") === "mods/issues/icons/circle-alert.svg"));
  assert.ok(byId(row, "setup-problem-check"));
  assert.ok(byId(row, "setup-problem-beads-init"));
  assert.equal(pressable(trackerNext(setup)), false);
});

test("a Linear key problem puts the key form in the Linear row", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "linear";
  setup.tracker.problem = { code: LINEAR_KEY_PROBLEM, message: "No Linear API key." };

  assert.ok(byId(byId(render(setup), "setup-tracker-linear"), "setup-problem-save-key"));
});

test("once the chosen tracker's check passes, setup stays on the tracker step with Next enabled", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "github";
  setup.ready(proposed, cx);

  assert.equal(setup.step, "tracker");
  assert.ok(setup.selects);
  assert.ok(pressable(trackerNext(setup)));
});

test("the tracker step's Next goes to the approval step, or for Linear to the team step", (t) => {
  stubHerdr(t);
  for (const [choice, step] of [
    ["github", "approval"],
    ["linear", "team"],
  ]) {
    const setup = startedSetup();
    setup.tracker.choice = choice;
    setup.ready(proposed, cx);

    callArg(trackerNext(setup), "on_click")(null, cx);
    assert.equal(setup.step, step);
  }
});

test("back on the tracker step, Next goes on with the tracker that passed its check", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "github";
  setup.ready(proposed, cx);
  setup.leaveTrackerStep(cx);
  setup.back(cx);
  assert.equal(setup.step, "tracker");

  callArg(trackerNext(setup), "on_click")(null, cx);
  assert.equal(setup.step, "approval");
});

test("the tracker step's Next shows disabled before a choice, while checking and after a failed check", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  assert.equal(pressable(trackerNext(setup)), false);

  setup.tracker.choice = "github";
  setup.tracker.checking = true;
  assert.equal(pressable(trackerNext(setup)), false);

  setup.tracker.checking = false;
  setup.tracker.problem = BEADS_NOT_INITIALIZED;
  assert.equal(pressable(trackerNext(setup)), false);
});

test("a disabled Next leaves setup on the tracker step", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "github";

  setup.leaveTrackerStep(cx);
  assert.equal(setup.step, "tracker");
});

test("choosing another tracker after one passed disables Next until the new one's check passes", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "github";
  setup.ready(proposed, cx);

  setup.tracker.choose("beads", cx);
  setup.tracker.checking = false;
  assert.equal(pressable(trackerNext(setup)), false);

  setup.ready(proposed, cx);
  assert.ok(pressable(trackerNext(setup)));
});

test("Linear's team step shows the team dropdown in a card under a Team heading", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "linear";
  setup.ready(proposed, cx);
  setup.leaveTrackerStep(cx);
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

// A theme whose every color is its own name, so a test can tell which theme color a view used.
const namedTheme = new Proxy({}, { get: (_, name) => name });
const renderNamed = (setup) => setup.render(namedTheme, { onRetry() {}, header: null, onCollapse() {} });

// Each step line under `listId`: its text, icon, icon color, text color and text size.
function stepLines(page, listId) {
  const list = byId(page, listId);
  return list.kids.map((line) => {
    const icon = [...walk(line)].find((node) => node.tag === "svg");
    const label = [...walk(line)].find((node) => node.kids.some((kid) => typeof kid === "string"));
    return {
      text: texts(line).join(""),
      icon: callArg(icon, "path").split("/").pop(),
      iconColor: callArg(icon, "text_color"),
      textColor: callArg(line, "text_color"),
      size: callArg(label, "text_size"),
    };
  });
}

// Runs the chosen tracker's check to the end, as the app would.
async function runCheck(setup, choice) {
  const spawned = [];
  const runCx = { ...cx, spawn: (body) => spawned.push(body(runCx)) };
  setup.tracker.choose(choice, runCx);
  await Promise.all(spawned);
}

test("once Linear's check passes, the Linear row lists its key and API access steps as passed", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "linear";
  assert.equal(byId(render(setup), "setup-ready"), undefined);

  setup.ready(proposed, cx);
  const lines = stepLines(byId(renderNamed(setup), "setup-tracker-linear"), "setup-ready");
  assert.deepEqual(
    lines.map(({ text, icon, iconColor, textColor }) => [text, icon, iconColor, textColor]),
    [
      ["Linear API key found", "circle-check.svg", "ansi2", "foreground"],
      ["Linear API access verified", "circle-check.svg", "ansi2", "foreground"],
    ],
  );
});

test("each tracker's passing check lists every step it checked, in order", (t) => {
  stubHerdr(t);
  for (const [choice, steps] of [
    ["github", ["GitHub CLI installed", "GitHub CLI logged in", "Origin on GitHub"]],
    ["beads", ["Beads installed", "Beads database found"]],
  ]) {
    const setup = startedSetup();
    setup.tracker.choice = choice;
    setup.ready(proposed, cx);
    const lines = stepLines(renderNamed(setup), "setup-ready");
    assert.deepEqual(
      lines.map(({ text }) => text),
      steps,
    );
    assert.ok(lines.every(({ icon }) => icon === "circle-check.svg"));
  }
});

test("with bd missing, the Beads check fails its first step and skips the database step", async (t) => {
  stubHerdr(t, { exec: async () => ({ code: 127, stdout: "", stderr: "" }) });
  const setup = startedSetup();
  await runCheck(setup, "beads");

  const row = byId(renderNamed(setup), "setup-tracker-beads");
  assert.deepEqual(
    stepLines(row, "setup-problem-steps").map(({ text, icon, iconColor, textColor, size }) => [
      text,
      icon,
      iconColor,
      textColor,
      size,
    ]),
    [
      ["The Beads CLI (bd) isn't installed", "circle-alert.svg", "ansi1", "ansi1", TEXT_SM_PX],
      ["Beads database found", "circle-dashed.svg", "dim", "muted", TEXT_SM_PX],
    ],
  );
  assert.ok(byId(row, "setup-problem-check"));
});

test("with bd installed and no database, the Beads check passes bd and fails the database with Run bd init", async (t) => {
  stubHerdr(t, { exec: async () => ({ code: 0, stdout: "", stderr: "" }) });
  const setup = startedSetup();
  await runCheck(setup, "beads");

  const row = byId(renderNamed(setup), "setup-tracker-beads");
  assert.deepEqual(
    stepLines(row, "setup-problem-steps").map(({ text, icon }) => [text, icon]),
    [
      ["Beads installed", "circle-check.svg"],
      ["This repository has no Beads database", "circle-alert.svg"],
    ],
  );
  assert.ok(byId(row, "setup-problem-beads-init"));
});

test("with gh logged out, the GitHub check passes installed, fails logged in and skips origin", async (t) => {
  stubHerdr(t, {
    exec: async (command, args) => ({ code: command === "gh" && args[0] === "auth" ? 1 : 0, stdout: "", stderr: "" }),
  });
  const setup = startedSetup();
  await runCheck(setup, "github");

  assert.deepEqual(
    stepLines(renderNamed(setup), "setup-problem-steps").map(({ text, icon }) => [text, icon]),
    [
      ["GitHub CLI installed", "circle-check.svg"],
      ["The GitHub CLI (gh) isn't logged in", "circle-alert.svg"],
      ["Origin on GitHub", "circle-dashed.svg"],
    ],
  );
});

test("the success message hides while checking, with a problem, and after choosing another tracker", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "github";
  setup.ready(proposed, cx);

  setup.tracker.checking = true;
  assert.equal(byId(render(setup), "setup-ready"), undefined);

  setup.tracker.checking = false;
  setup.tracker.problem = { code: null, message: "Not logged in.", fix: "Log in." };
  assert.equal(byId(render(setup), "setup-ready"), undefined);

  setup.tracker.problem = null;
  setup.tracker.choose("beads", cx);
  setup.tracker.checking = false;
  assert.equal(byId(render(setup), "setup-ready"), undefined);
});

test("after bd init makes the missing database and the check passes, the Beads success message shows", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "beads";
  setup.tracker.problem = { code: BEADS_NOT_INITIALIZED, message: "No Beads database.", fix: "Run `bd init`." };
  assert.equal(byId(render(setup), "setup-ready"), undefined);

  setup.tracker.problem = null;
  setup.ready(proposed, cx);
  assert.ok(texts(byId(byId(render(setup), "setup-tracker-beads"), "setup-ready")).includes("Beads database found"));
});
