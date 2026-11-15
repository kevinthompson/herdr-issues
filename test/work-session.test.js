import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { forgetLookups } from "../mod/lookups.js";
import { issuesWorktreeArgs, workIssueSession } from "../mod/work-session.js";

const issue = { id: "#7", branch: "7-fix-the-list" };

// Stubs exec so `claude` runs only when `installed`, counting each time it's checked.
function stubClaude(t, { installed }) {
  const checks = { count: 0 };
  stubHerdr(t, {
    exec: async (command) => {
      assert.equal(command, "claude");
      checks.count++;
      if (!installed) throw Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
      return { code: 0, stdout: "2.0.0 (Claude Code)\n", stderr: "" };
    },
  });
  return checks;
}

describe("Start's worktree session", () => {
  beforeEach(() => forgetLookups());

  test("passes --claude to issues worktree when claude runs", async (t) => {
    stubClaude(t, { installed: true });
    assert.deepEqual(await issuesWorktreeArgs(issue, { spaceName: "#7 Fix", isNew: true }),
      ["worktree", "--branch", "7-fix-the-list", "--new", "--name", "#7 Fix", "--claude", "/issues:work #7"]);
    assert.deepEqual(await workIssueSession(issue), { tab: "Claude", argv: ["claude"], task: "/issues:work #7" });
  });

  test("leaves out --claude and the Claude tab when claude doesn't run", async (t) => {
    stubClaude(t, { installed: false });
    assert.deepEqual(await issuesWorktreeArgs(issue, { spaceName: "#7 Fix", isNew: false }),
      ["worktree", "--branch", "7-fix-the-list", "--name", "#7 Fix"]);
    assert.deepEqual(await workIssueSession(issue), {});
  });

  test("checks whether claude runs once", async (t) => {
    const checks = stubClaude(t, { installed: false });
    await issuesWorktreeArgs(issue, { spaceName: "#7", isNew: false });
    await workIssueSession(issue);
    assert.equal(checks.count, 1);
  });
});
