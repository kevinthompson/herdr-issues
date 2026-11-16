import { test } from "node:test";
import assert from "node:assert/strict";
import { GLOBAL_SECTIONS, REPOSITORY_SECTIONS } from "../mod/settings-fields.js";

test("the Repository form groups its questions under all five sections", () => {
  assert.deepEqual(REPOSITORY_SECTIONS, [
    { title: "Tracker", keys: ["name", "tracker"] },
    { title: "Approval", keys: ["approval", "onApproval", "waitForChecks", "pushAfterMerge"] },
    { title: "Worktrees", keys: ["worktreeSetup", "spaceName", "close"] },
    { title: "Issue sessions", keys: ["workModel", "workEffort", "workPrompt"] },
    { title: "Panel", keys: ["pollSeconds"] },
  ]);
});

test("the Global form has no Tracker section and its Panel section adds the update check", () => {
  assert.deepEqual(GLOBAL_SECTIONS, [
    { title: "Approval", keys: ["approval", "onApproval", "waitForChecks", "pushAfterMerge"] },
    { title: "Worktrees", keys: ["spaceName", "close"] },
    { title: "Issue sessions", keys: ["workModel", "workEffort", "workPrompt"] },
    { title: "Panel", keys: ["pollSeconds", "updateCheckHours"] },
  ]);
});
