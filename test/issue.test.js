import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { canStartWork, groupCountText, groupIssues, holdingBlockers, statusIcon, stripBadges, waitingIssues } from "../mod/issue.js";

const issue = (id, status, { priority = 0, blockedBy = [] } = {}) =>
  ({ id, status, priority, blockedBy, labels: [], order: null, sla: null });
const groupIds = (groups) => Object.fromEntries(groups.map((group) => [group.id, group.issues.map((each) => each.id)]));

describe("groupIssues", () => {
  test("puts a todo issue with an unfinished blocker in Blocked", () => {
    const issues = [issue("#1", "in-progress"), issue("#2", "todo", { blockedBy: ["#1"] })];
    assert.deepEqual(groupIds(groupIssues(issues)), { "in-progress": ["#1"], todo: [], blocked: ["#2"] });
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

  test("keeps Todo when empty", () => {
    assert.deepEqual(groupIds(groupIssues([])), { todo: [] });
  });

  test("drops every other empty group", () => {
    assert.deepEqual(groupIds(groupIssues([issue("#1", "in-progress")])), { "in-progress": ["#1"], todo: [] });
    assert.deepEqual(groupIds(groupIssues([issue("#1", "started")])), { todo: [], unknown: ["#1"] });
  });

  test("keeps a group whose issues weren't listed", () => {
    assert.deepEqual(groupIds(groupIssues([], new Set(["done"]))), { todo: [], done: [] });
  });

  test("counts a group's issues, including none, and none while its issues weren't listed", () => {
    const groups = groupIssues([issue("#1", "in-progress")], new Set(["done"]));
    assert.deepEqual(groups.map(groupCountText), ["1", "0", null]);
  });

  test("counts Done and Canceled as the cap and + once the tracker listed as many closed issues as it lists at most", () => {
    const closed = [issue("#1", "done"), issue("#2", "done"), issue("#3", "canceled")];
    const capped = groupIssues(closed, new Set(), null, { recentlyClosed: 3 });
    assert.deepEqual(capped.map(groupCountText), ["0", "3+", "3+"]);
    const below = groupIssues(closed, new Set(), null, { recentlyClosed: 4 });
    assert.deepEqual(below.map(groupCountText), ["0", "2", "1"]);
  });

  test("counts only the issues carrying the label the list is narrowed to", () => {
    const labeled = { ...issue("#2", "todo"), labels: ["bug"] };
    const groups = groupIssues([issue("#1", "in-progress"), labeled], new Set(), "bug");
    assert.deepEqual(groupIds(groups), { todo: ["#2"] });
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

describe("stripBadges", () => {
  const issues = (status, count) => Array.from({ length: count }, (_, index) => issue(`#${status}-${index}`, status));

  test("counts each group the list shows, in the list's order", () => {
    const groups = groupIssues([...issues("todo", 2), ...issues("triage", 1), ...issues("in-review", 3)]);
    assert.deepEqual(stripBadges(groups), [
      { id: "triage", label: "Triage", count: 1, text: "1", unloaded: false },
      { id: "in-review", label: "In review", count: 3, text: "3", unloaded: false },
      { id: "todo", label: "Todo", count: 2, text: "2", unloaded: false },
    ]);
  });

  test("keeps an empty Todo with 0", () => {
    const groups = groupIssues([issue("#1", "in-progress")]);
    assert.deepEqual(stripBadges(groups).map(({ id, text }) => [id, text]), [["in-progress", "1"], ["todo", "0"]]);
  });

  test("includes Blocked, Backlog, Unknown status, Done and Canceled", () => {
    const groups = groupIssues([
      issue("#1", "in-progress"), issue("#2", "todo", { blockedBy: ["#1"] }), issue("#3", "backlog"),
      issue("#4", "started"), issue("#5", "done"), issue("#6", "canceled"),
    ]);
    assert.deepEqual(stripBadges(groups).map((badge) => badge.id),
      ["in-progress", "todo", "blocked", "backlog", "unknown", "done", "canceled"]);
  });

  test("marks a section whose issues weren't listed so the strip draws the refresh icon", () => {
    const groups = groupIssues([issue("#1", "todo")], new Set(["done"]));
    assert.deepEqual(stripBadges(groups).at(-1), { id: "done", label: "Done", count: 0, text: null, unloaded: true });
  });

  test("shows a capped Done or Canceled as the cap and +", () => {
    const groups = groupIssues([...issues("done", 2), ...issues("canceled", 1)], new Set(), null, { recentlyClosed: 3 });
    assert.deepEqual(stripBadges(groups).map((badge) => badge.text), ["0", "3+", "3+"]);
  });

  test("shows 99 issues as 99 and 100 or more as 99+", () => {
    assert.equal(stripBadges(groupIssues(issues("todo", 99)))[0].text, "99");
    assert.equal(stripBadges(groupIssues(issues("todo", 100)))[0].text, "99+");
  });

  test("counts only the issues carrying the label the list is narrowed to", () => {
    const labeled = { ...issue("#2", "todo"), labels: ["bug"] };
    assert.equal(stripBadges(groupIssues([issue("#1", "todo"), labeled], new Set(), "bug"))[0].count, 1);
  });
});

describe("statusIcon", () => {
  test("names the Linear icon of each group and status that has one", () => {
    for (const id of ["triage", "in-review", "in-progress", "todo", "blocked", "backlog", "done", "canceled"]) {
      assert.equal(statusIcon(id), `mods/issues/icons/${id}.png`);
    }
  });

  test("returns null for Unknown status and any other id", () => {
    assert.equal(statusIcon("unknown"), null);
    assert.equal(statusIcon("started"), null);
    assert.equal(statusIcon(undefined), null);
  });
});
