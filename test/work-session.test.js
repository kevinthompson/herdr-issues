import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, test } from "node:test";
import { defaults, stubHerdr } from "./support/herdr.js";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { settingsPath } from "../mod/trackers/setting.js";
import { issuesWorktreeArgs, workIssueSession, workSessionArgv } from "../mod/work-session.js";

const issue = { id: "#7", branch: "7-fix-the-list" };

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

// Stubs exec so `claude` runs only when `installed`, counting each time it's checked; other commands run.
function stubClaude(t, { installed }) {
  const checks = { count: 0 };
  stubHerdr(t, {
    exec: async (command, ...rest) => {
      if (command !== "claude") return defaults.exec(command, ...rest);
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
    assert.deepEqual(await workIssueSession(issue, null), { tab: "Claude", argv: ["claude"], task: "/issues:work #7" });
  });

  test("leaves out --claude and the Claude tab when claude doesn't run", async (t) => {
    stubClaude(t, { installed: false });
    assert.deepEqual(await issuesWorktreeArgs(issue, { spaceName: "#7 Fix", isNew: false }),
      ["worktree", "--branch", "7-fix-the-list", "--name", "#7 Fix"]);
    assert.deepEqual(await workIssueSession(issue, null), {});
  });

  test("checks whether claude runs once", async (t) => {
    const checks = stubClaude(t, { installed: false });
    await issuesWorktreeArgs(issue, { spaceName: "#7", isNew: false });
    await workIssueSession(issue, null);
    assert.equal(checks.count, 1);
  });
});

describe("the Claude session's model and effort", () => {
  beforeEach(() => forgetLookups());

  test("starts plain claude without workModel or workEffort", async (t) => {
    stubClaude(t, { installed: true });
    const repository = createRepository(temporaryFolder(t));
    writeSettings({ repos: { [repository]: { tracker: "github", repo: "owner/name" } } });
    const project = { root: repository, on: null };
    assert.deepEqual(await workSessionArgv(project), ["claude"]);
    assert.deepEqual((await workIssueSession(issue, project)).argv, ["claude"]);
  });

  test("passes the repository's workModel and workEffort to claude", async (t) => {
    stubClaude(t, { installed: true });
    const repository = createRepository(temporaryFolder(t));
    writeSettings({ workEffort: "low", repos: { [repository]: { tracker: "github", repo: "owner/name", workModel: "sonnet", workEffort: "high" } } });
    const project = { root: repository, on: null };
    assert.deepEqual(await workSessionArgv(project), ["claude", "--model", "sonnet", "--effort", "high"]);
    assert.deepEqual(await workIssueSession(issue, project), { tab: "Claude", argv: ["claude", "--model", "sonnet", "--effort", "high"], task: "/issues:work #7" });
  });

  test("passes only the setting that isn't its default", async (t) => {
    stubClaude(t, { installed: true });
    const repository = createRepository(temporaryFolder(t));
    writeSettings({ workEffort: "max", repos: {} });
    assert.deepEqual(await workSessionArgv({ root: repository, on: null }), ["claude", "--effort", "max"]);
  });
});

describe("the Claude session's work prompt", () => {
  beforeEach(() => forgetLookups());

  test("appends the top level's and the repository's workPrompt to the system prompt as one argument", async (t) => {
    stubClaude(t, { installed: true });
    const repository = createRepository(temporaryFolder(t));
    const workPrompt = `Run "npm test" before each commit.\nDon't use 'git stash'.`;
    writeSettings({ workPrompt: "Top level", repos: { [repository]: { tracker: "github", repo: "owner/name", workPrompt } } });
    const project = { root: repository, on: null };
    const appended = `Top level\n\n${workPrompt}`;
    assert.deepEqual(await workSessionArgv(project), ["claude", "--append-system-prompt", appended]);
    assert.deepEqual((await workIssueSession(issue, project)).argv, ["claude", "--append-system-prompt", appended]);
  });

  test("uses the top level's workPrompt without the repository's", async (t) => {
    stubClaude(t, { installed: true });
    const repository = createRepository(temporaryFolder(t));
    writeSettings({ workPrompt: "Top level", repos: { [repository]: { tracker: "github", repo: "owner/name", workPrompt: "  " } } });
    assert.deepEqual(await workSessionArgv({ root: repository, on: null }), ["claude", "--append-system-prompt", "Top level"]);
  });

  test("adds nothing for a blank or missing workPrompt", async (t) => {
    stubClaude(t, { installed: true });
    const repository = createRepository(temporaryFolder(t));
    writeSettings({ repos: { [repository]: { tracker: "github", repo: "owner/name", workPrompt: " \n " } } });
    assert.deepEqual(await workSessionArgv({ root: repository, on: null }), ["claude"]);
    forgetLookups();
    writeSettings({ repos: {} });
    assert.deepEqual(await workSessionArgv({ root: repository, on: null }), ["claude"]);
  });
});
