import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLEAR_CHOICE,
  OTHER_WORK_MODEL,
  yesNoChoiceId,
  globalSettingsFields,
  settingsFields,
  yesNoValue,
  workModelChoice,
} from "../mod/settings-fields.js";

const fields = (choices) =>
  settingsFields({
    trackerChoice: null,
    trackerReady: false,
    onApproval: "merge",
    workModel: null,
    otherWorkModelPicked: false,
    ...choices,
  });

test("Linear's team shows only once Linear is chosen and checked", () => {
  assert.equal(fields({ trackerChoice: "linear", trackerReady: true }).teamSelect, true);
  assert.equal(fields({ trackerChoice: "linear", trackerReady: false }).teamSelect, false);
  assert.equal(fields({ trackerChoice: "github", trackerReady: true }).teamSelect, false);
});

test("waiting for checks shows only when the onApproval that applies is a pull request", () => {
  assert.equal(fields({ onApproval: "pull-request" }).waitForChecksSelect, true);
  assert.equal(fields({ onApproval: "merge" }).waitForChecksSelect, false);
  assert.equal(fields({ onApproval: null }).waitForChecksSelect, false);
  assert.equal(fields({ onApproval: null, fallbackOnApproval: "pull-request" }).waitForChecksSelect, true);
  assert.equal(fields({ onApproval: null, fallbackOnApproval: "merge" }).waitForChecksSelect, false);
  assert.equal(fields({ onApproval: "merge", fallbackOnApproval: "pull-request" }).waitForChecksSelect, false);
});

test("the Global form shows waiting for checks for a pull request or the default onApproval", () => {
  const global = (onApproval) => globalSettingsFields({ onApproval, workModel: null, otherWorkModelPicked: false });
  assert.equal(global(null).waitForChecksSelect, true);
  assert.equal(global("pull-request").waitForChecksSelect, true);
  assert.equal(global("merge").waitForChecksSelect, false);
});

test("pushing after merging shows only when the onApproval that applies is a merge", () => {
  assert.equal(fields({ onApproval: "merge" }).pushAfterMergeSelect, true);
  assert.equal(fields({ onApproval: "pull-request" }).pushAfterMergeSelect, false);
  assert.equal(fields({ onApproval: null }).pushAfterMergeSelect, false);
  assert.equal(fields({ onApproval: null, fallbackOnApproval: "merge" }).pushAfterMergeSelect, true);
  assert.equal(fields({ onApproval: null, fallbackOnApproval: "pull-request" }).pushAfterMergeSelect, false);
  assert.equal(fields({ onApproval: "pull-request", fallbackOnApproval: "merge" }).pushAfterMergeSelect, false);
});

test("the Global form shows pushing after merging for a merge or the default onApproval", () => {
  const global = (onApproval) => globalSettingsFields({ onApproval, workModel: null, otherWorkModelPicked: false });
  assert.equal(global(null).pushAfterMergeSelect, true);
  assert.equal(global("merge").pushAfterMergeSelect, true);
  assert.equal(global("pull-request").pushAfterMergeSelect, false);
});

test("a yes-or-no setting converts to and from its select's ids", () => {
  assert.deepEqual([true, false, null].map(yesNoChoiceId), ["yes", "no", null]);
  assert.deepEqual(["yes", "no", null].map(yesNoValue), [true, false, null]);
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
