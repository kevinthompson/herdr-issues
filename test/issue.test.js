import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { canStartWork, groupIssues, holdingBlockers, waitingIssues } from "../issue.js";

const issue = (id, status, { priority = 0, blockedBy = [] } = {}) =>
  ({ id, status, priority, blockedBy, labels: [], order: null, sla: null });
const groupIds = (groups) => Object.fromEntries(groups.map((group) => [group.id, group.issues.map((each) => each.id)]));

describe("groupIssues", () => {
  test("puts a todo issue with an unfinished blocker in Blocked", () => {
    const issues = [issue("#1", "in-progress"), issue("#2", "todo", { blockedBy: ["#1"] })];
    assert.deepEqual(groupIds(groupIssues(issues)), { "in-progress": ["#1"], blocked: ["#2"] });
  });

  test("puts a todo issue whose blockers are done in Todo", () => {
    const issues = [issue("#1", "done"), issue("#2", "todo", { blockedBy: ["#1"] })];
    assert.deepEqual(groupIds(groupIssues(issues)), { todo: ["#2"], done: ["#1"] });
  });

  test("sorts by priority, with no priority last, then by ID in number order", () => {
    const issues = [
      issue("#10", "todo", { priority: 2 }), issue("#3", "todo"), issue("#2", "todo", { priority: 2 }), issue("#4", "todo", { priority: 1 }),
    ];
    assert.deepEqual(groupIds(groupIssues(issues)).todo, ["#4", "#2", "#10", "#3"]);
  });

  test("marks a group whose issues weren't listed as unloaded, with no issues", () => {
    const groups = groupIssues([issue("#1", "todo"), issue("#2", "done")], new Set(["done", "canceled"]));
    const done = groups.find((group) => group.id === "done");
    assert.equal(done.unloaded, true);
    assert.deepEqual(done.issues, []);
    assert.equal(groups.find((group) => group.id === "canceled").unloaded, true);
    assert.equal(groups.find((group) => group.id === "todo").unloaded, undefined);
  });
});

describe("canStartWork", () => {
  test("allows an unstarted issue whose blockers are done", () => {
    const issues = [issue("#1", "done"), issue("#2", "todo", { blockedBy: ["#1"] })];
    assert.equal(canStartWork(issues[1], issues), true);
  });

  test("refuses an issue with an unfinished blocker", () => {
    const issues = [issue("#1", "in-review"), issue("#2", "backlog", { blockedBy: ["#1"] })];
    assert.equal(canStartWork(issues[1], issues), false);
  });

  test("refuses an issue already underway", () => {
    const issues = [issue("#1", "in-progress")];
    assert.equal(canStartWork(issues[0], issues), false);
  });
});

describe("holdingBlockers", () => {
  test("lists an unstarted issue's unfinished blockers", () => {
    const issues = [issue("#1", "done"), issue("#2", "todo"), issue("#3", "todo", { blockedBy: ["#1", "#2"] })];
    assert.deepEqual(holdingBlockers(issues[2], issues), ["#2"]);
  });

  test("lists none once work could have started", () => {
    const issues = [issue("#1", "todo"), issue("#2", "in-progress", { blockedBy: ["#1"] })];
    assert.deepEqual(holdingBlockers(issues[1], issues), []);
  });
});

describe("waitingIssues", () => {
  test("lists the unfinished issues an unfinished issue blocks", () => {
    const issues = [
      issue("#1", "in-progress"),
      issue("#2", "todo", { blockedBy: ["#1"] }),
      issue("#3", "canceled", { blockedBy: ["#1"] }),
      issue("#4", "backlog", { blockedBy: ["#1"] }),
    ];
    assert.deepEqual(waitingIssues(issues[0], issues), ["#2", "#4"]);
  });

  test("lists none once the issue is done", () => {
    const issues = [issue("#1", "done"), issue("#2", "todo", { blockedBy: ["#1"] })];
    assert.deepEqual(waitingIssues(issues[0], issues), []);
  });
});
