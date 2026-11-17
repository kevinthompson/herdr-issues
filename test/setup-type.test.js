// The type sizes and weights of setup's pages, its blank state and the setting rows it shares with the settings
// view, so the question, labels, values and descriptions read as distinct levels.
import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { byId, callArg, walk } from "./support/gpui.js";
import { TrackerSetup } from "../mod/setup.js";
import { settingRow } from "../mod/setting-row.js";

const FOREGROUND = "#ffffff";
const MUTED = "#888888";
const ERROR = "#ff0000";
const SOLID = "#0000ff";
const theme = new Proxy(
  {},
  { get: (_, key) => ({ foreground: FOREGROUND, muted: MUTED, ansi1: ERROR, solid: SOLID })[key] ?? "#000000" },
);
const cx = {
  focus_handle: () => ({ focus() {}, is_focused: () => false }),
  notify() {},
  spawn() {},
};
const proposed = { approval: "ask", onApproval: "merge", waitForChecks: null, pushAfterMerge: "no" };

const render = (setup) => setup.render(theme, { onRetry() {}, header: null, onCollapse() {} });

function startedSetup() {
  const setup = new TrackerSetup("/repo", () => {});
  setup.settingUp = true;
  return setup;
}

// The element whose own children include `text`.
const holding = (tree, text) => [...walk(tree)].find((node) => node.kids.includes(text));
const parentOf = (tree, child) => [...walk(tree)].find((node) => node.kids.includes(child));
const called = (node, name) => node.calls.some(([call]) => call === name);
// The size an element's text is drawn at: its own, or the nearest one an ancestor sets.
function sizeOf(tree, text) {
  const path = [];
  const find = (node) => {
    path.push(node);
    if (node.kids.includes(text)) return true;
    if (node.kids.some((kid) => typeof kid === "object" && kid && find(kid))) return true;
    path.pop();
    return false;
  };
  find(tree);
  return path.map((node) => callArg(node, "text_size")).findLast((size) => size != null);
}

test("each page's question is 20px semibold and its sentence 14px", (t) => {
  stubHerdr(t);
  const page = render(startedSetup());
  const question = holding(page, "Where do this repository's issues live?");

  assert.equal(callArg(question, "text_size"), 20);
  assert.ok(called(question, "font_semibold"));
  assert.equal(callArg(question, "text_color"), FOREGROUND);
  assert.equal(sizeOf(page, "This repository has no issue tracker yet. Choose where its issues live."), 14);
});

test("the step bar's step text is 14px", (t) => {
  stubHerdr(t);
  assert.equal(sizeOf(render(startedSetup()), "Step 1 of 3"), 14);
});

test("tracker and setting row labels are 16px semibold over 12px descriptions", (t) => {
  stubHerdr(t);
  const trackers = render(startedSetup());
  const row = settingRow(
    { title: "Model", sentence: "Empty uses the default.", after: "After merging" },
    theme,
    (c) => c,
  );

  for (const [tree, label] of [
    [trackers, "GitHub Issues"],
    [row, "Model"],
  ]) {
    assert.equal(sizeOf(tree, label), 16);
    assert.ok(called(holding(tree, label), "font_semibold"));
  }
  assert.equal(sizeOf(trackers, "Issues in the repository's GitHub repository, read and written with gh."), 12);
  assert.equal(sizeOf(row, "Empty uses the default."), 12);
  assert.equal(sizeOf(row, "After merging"), 12);
});

test("a problem's message is 14px semibold in the error color over a 12px muted fix, with a regular Check again", (t) => {
  stubHerdr(t);
  const setup = new TrackerSetup("/repo", () => {});
  setup.showFailure({ message: "gh isn't logged in.", fix: "Run `gh auth login`." });
  const page = render(setup);
  const message = holding(page, "gh isn't logged in.");
  const fix = holding(page, "Run `gh auth login`.");

  assert.equal(sizeOf(page, "gh isn't logged in."), 14);
  assert.ok(called(message, "font_semibold"));
  assert.equal(callArg(message, "text_color") ?? callArg(parentOf(page, message), "text_color"), ERROR);
  assert.equal(callArg(fix, "text_size"), 12);
  assert.equal(callArg(fix, "text_color"), MUTED);
  assert.notEqual(callArg(byId(page, "setup-failure-check"), "bg"), SOLID);
});

test("a review row draws the setting's name muted and its value semibold in the foreground, both 14px", (t) => {
  stubHerdr(t);
  const setup = startedSetup();
  setup.tracker.choice = "github";
  setup.ready(proposed, cx);
  Object.assign(setup, { answers: proposed, step: "review" });
  const page = render(setup);
  const name = holding(page, "Approve work");
  const value = holding(page, "Ask me");

  assert.equal(sizeOf(page, "Approve work"), 14);
  assert.equal(sizeOf(page, "Ask me"), 14);
  assert.equal(callArg(name, "text_color"), MUTED);
  assert.equal(called(name, "font_semibold"), false);
  assert.equal(callArg(value, "text_color"), FOREGROUND);
  assert.ok(called(value, "font_semibold"));
});

test("the blank state sets its heading at 18px semibold above a 14px muted sentence", (t) => {
  stubHerdr(t);
  const page = render(new TrackerSetup("/repo", () => {}));
  const heading = holding(page, "Issues isn't set up for this repository");
  const sentence = holding(page, "Choose an issue tracker and how finished work is approved.");

  assert.equal(callArg(heading, "text_size"), 18);
  assert.ok(called(heading, "font_semibold"));
  assert.equal(callArg(sentence, "text_size"), 14);
  assert.equal(callArg(sentence, "text_color"), MUTED);
});
