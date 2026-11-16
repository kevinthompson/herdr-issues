import { test } from "node:test";
import assert from "node:assert/strict";
import { CLEAR_CHOICE, OTHER_WORK_MODEL, globalSettingsFields, settingsFields, workModelChoice } from "../mod/settings-fields.js";

const fields = (choices) => settingsFields({ trackerChoice: null, trackerReady: false, merge: "auto", workModel: null, otherWorkModelPicked: false, ...choices });

test("Linear's team shows only once Linear is chosen and checked", () => {
  assert.equal(fields({ trackerChoice: "linear", trackerReady: true }).teamSelect, true);
  assert.equal(fields({ trackerChoice: "linear", trackerReady: false }).teamSelect, false);
  assert.equal(fields({ trackerChoice: "github", trackerReady: true }).teamSelect, false);
});

test("when the work is complete shows only for a pull request, with a note for the other merges", () => {
  assert.deepEqual([fields({ merge: "pull-request" }).completeSelect, fields({ merge: "pull-request" }).mergedNote], [true, false]);
  for (const merge of ["auto", "review"]) assert.deepEqual([fields({ merge }).completeSelect, fields({ merge }).mergedNote], [false, true]);
  assert.deepEqual([fields({ merge: null }).completeSelect, fields({ merge: null }).mergedNote], [false, false]);
});

test("the typed model shows for Other or a saved model the select doesn't list", () => {
  assert.equal(fields({ workModel: "opus" }).workModelInput, false);
  assert.equal(fields({ workModel: null }).workModelInput, false);
  assert.equal(fields({ workModel: "opus", otherWorkModelPicked: true }).workModelInput, true);
  assert.equal(fields({ workModel: "claude-opus-4-1" }).workModelInput, true);
});

test("the workModel select shows the listed model, Other, or the choice that removes it", () => {
  assert.equal(workModelChoice("sonnet", false), "sonnet");
  assert.equal(workModelChoice(null, false), CLEAR_CHOICE);
  assert.equal(workModelChoice("claude-opus-4-1", false), OTHER_WORK_MODEL);
  assert.equal(workModelChoice(null, true), OTHER_WORK_MODEL);
});

test("the Global form shows when the work is complete for a pull request or the default merge", () => {
  const global = (merge) => globalSettingsFields({ merge, workModel: null, otherWorkModelPicked: false });
  for (const merge of [null, "pull-request"]) assert.deepEqual([global(merge).completeSelect, global(merge).mergedNote], [true, false]);
  for (const merge of ["auto", "review"]) assert.deepEqual([global(merge).completeSelect, global(merge).mergedNote], [false, true]);
});
