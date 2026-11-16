import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { defaults, stubHerdr } from "./support/herdr.js";
import { commitFile, createRepository, git, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { settingsPath } from "../mod/trackers/setting.js";
import { main } from "../cli/main.js";
import { CLOSING_LINES } from "../cli/finish.js";
import { markedSpaceName } from "../mod/space-name.js";

const PULL_REQUEST_URL = "https://github.com/owner/name/pull/9";

const listing = {
  spaces: [
    {
      id: "space-session",
      name: "󰄱   #72",
      tabs: [{ id: "tab-session", name: "Tab names", terminals: [{ terminal: "t1" }] }],
    },
  ],
};

// Stubs herdr-app, hc and gh, recording each herdr-app do and hc call; git runs. `pullRequest` is what gh pr view
// prints for the branch, none when null, and `checks` what gh pr checks prints.
function stubTools(t, { pullRequest = null, checks = [] } = {}) {
  const calls = [];
  stubHerdr(t, {
    exec: async (command, args, options) => {
      if (command === "hc") {
        calls.push([command, ...args]);
        return { code: 0, stdout: "", stderr: "" };
      }
      if (command === "herdr-app") {
        if (args[0] === "ls") return { code: 0, stdout: JSON.stringify(listing), stderr: "" };
        calls.push([command, ...args]);
        return { code: 0, stdout: '{"ok":true}', stderr: "" };
      }
      if (command === "gh" && args[1] === "view") {
        return pullRequest
          ? { code: 0, stdout: JSON.stringify(pullRequest), stderr: "" }
          : { code: 1, stdout: "", stderr: "no pull requests found" };
      }
      if (command === "gh" && args[1] === "checks") {
        return {
          code: checks.some((check) => check.bucket !== "pass") ? 1 : 0,
          stdout: JSON.stringify(checks),
          stderr: "",
        };
      }
      return defaults.exec(command, args, options);
    },
  });
  return calls;
}

// A repository with `settings` in its issues.json entry and a worktree on the branch feature, with one commit main
// lacks unless `merged`; the test runs in the worktree.
function inWorktree(t, settings = {}, { merged = true } = {}) {
  const folder = temporaryFolder(t);
  const repository = createRepository(folder);
  const worktree = join(folder, "feature");
  git(repository, "worktree", "add", "-q", "-b", "feature", worktree);
  commitFile(worktree, "change", "work\n");
  if (merged) git(repository, "merge", "-q", "--ff-only", "feature");
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(
    settingsPath(),
    JSON.stringify({ repos: { [repository]: { tracker: "github", repo: "owner/name", ...settings } } }),
  );
  const previous = process.cwd();
  process.chdir(worktree);
  t.after(() => process.chdir(previous));
  return worktree;
}

async function run(t, args, { terminal = "t1" } = {}) {
  const previous = process.env.HC_TERMINAL_ID;
  process.env.HC_TERMINAL_ID = terminal;
  t.after(() => {
    process.env.HC_TERMINAL_ID = previous ?? "";
  });
  const out = [];
  const err = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", (line) => err.push(line));
  const code = await main(args);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const HANDOFF_CALLS = [
  ["hc", "label", "t1", "issues.complete=#72"],
  [
    "herdr-app",
    "do",
    "space.rename",
    "--id",
    "space-session",
    "--name",
    markedSpaceName(listing.spaces[0].name, "done"),
  ],
  ["hc", "label", "t1", "issues.close=#72"],
];

const openPullRequest = (worktree) => ({
  state: "OPEN",
  url: PULL_REQUEST_URL,
  headRefOid: git(worktree, "rev-parse", "HEAD"),
});

beforeEach(() => forgetLookups());

test("finish with close ask hands off, asks the panel to close and prints the block and the question", async (t) => {
  inWorktree(t, { onApproval: "merge", close: "ask" });
  const calls = stubTools(t);
  const { code, out } = await run(t, ["finish", "#72"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, HANDOFF_CALLS);
  assert.match(
    out,
    /## ✅ Session finished: #72\n\nMerged into main; nothing is uncommitted\.\n\n\*\*This session is finished\. This worktree closes once you choose Close it\.\*\*/,
  );
  assert.match(
    out,
    /Question: This issue is complete and the work has been merged\. Would you like to close this worktree\?/,
  );
  assert.match(out, /Choices: Close it, Keep it open/);
  assert.match(out, /On Keep it open: run issues close --cancel #72/);
  assert.ok(out.includes(CLOSING_LINES.kept));
});

test("finish with close auto prints the block with the auto closing line and no question", async (t) => {
  inWorktree(t, { onApproval: "merge", close: "auto" });
  const calls = stubTools(t);
  const { code, out } = await run(t, ["finish", "#72"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, HANDOFF_CALLS);
  assert.ok(out.includes(`**${CLOSING_LINES.auto}**`));
  assert.match(out, /End your final message with this block/);
  assert.doesNotMatch(out, /AskUserQuestion/);
});

test("finish says the final message is only the block when approval and close are both auto", async (t) => {
  inWorktree(t, { approval: "auto", onApproval: "merge", close: "auto" });
  stubTools(t);
  const { code, out } = await run(t, ["finish", "#72"]);
  assert.equal(code, 0);
  assert.match(out, /Your final message is only this block, with no summary above it/);
});

test("finish reads the retired close manual as ask", async (t) => {
  inWorktree(t, { onApproval: "merge", close: "manual" });
  stubTools(t);
  const { code, out } = await run(t, ["finish", "#72"]);
  assert.equal(code, 0);
  assert.ok(out.includes(`**${CLOSING_LINES.ask}**`));
});

test("finish outside Herdr runs nothing in Herdr and prints the outside-Herdr closing line", async (t) => {
  inWorktree(t, { onApproval: "merge", close: "auto" });
  const calls = stubTools(t);
  const { code, out } = await run(t, ["finish", "#72"], { terminal: "" });
  assert.equal(code, 0);
  assert.deepEqual(calls, []);
  assert.ok(out.includes(`**${CLOSING_LINES.outsideHerdr}**`));
  assert.doesNotMatch(out, /AskUserQuestion/);
});

test("finish refuses uncommitted work, changing nothing", async (t) => {
  const worktree = inWorktree(t, { onApproval: "merge" });
  writeFileSync(join(worktree, "draft"), "unsaved\n");
  const calls = stubTools(t);
  const { code, out, err } = await run(t, ["finish", "#72"]);
  assert.equal(code, 1);
  assert.deepEqual(calls, []);
  assert.equal(out, "");
  assert.match(
    err,
    /#72 isn't finished, so nothing was changed\. Outstanding:\n {2}- The worktree has uncommitted changes/,
  );
});

test("finish refuses a branch that isn't merged into main when the repository merges locally", async (t) => {
  inWorktree(t, { onApproval: "merge" }, { merged: false });
  const calls = stubTools(t, { pullRequest: { state: "OPEN", url: PULL_REQUEST_URL, headRefOid: "x" } });
  const { code, err } = await run(t, ["finish", "#72"]);
  assert.equal(code, 1);
  assert.deepEqual(calls, []);
  assert.match(err, /feature isn't merged into main\./);
});

test("finish with onApproval pull-request accepts a pushed branch with an open pull request", async (t) => {
  const worktree = inWorktree(t, { onApproval: "pull-request", close: "ask" }, { merged: false });
  const calls = stubTools(t, { pullRequest: openPullRequest(worktree) });
  const { code, out } = await run(t, ["finish", "#72"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, HANDOFF_CALLS);
  assert.ok(out.includes(`PR open at ${PULL_REQUEST_URL}; nothing is uncommitted.`));
  assert.match(out, /This issue is complete and its pull request has been opened\./);
});

test("finish with onApproval pull-request accepts a branch merged into main without asking gh", async (t) => {
  inWorktree(t, { onApproval: "pull-request" });
  stubTools(t);
  const { code, out } = await run(t, ["finish", "#72"]);
  assert.equal(code, 0);
  assert.match(out, /Merged into main; nothing is uncommitted\./);
});

test("finish with onApproval pull-request refuses a branch without a pull request", async (t) => {
  inWorktree(t, { onApproval: "pull-request" }, { merged: false });
  const calls = stubTools(t);
  const { code, err } = await run(t, ["finish", "#72"]);
  assert.equal(code, 1);
  assert.deepEqual(calls, []);
  assert.match(err, /feature isn't merged into main and has no pull request\./);
});

test("finish with onApproval pull-request refuses commits the pull request doesn't have", async (t) => {
  inWorktree(t, { onApproval: "pull-request" }, { merged: false });
  stubTools(t, { pullRequest: { state: "OPEN", url: PULL_REQUEST_URL, headRefOid: "0000000" } });
  const { code, err } = await run(t, ["finish", "#72"]);
  assert.equal(code, 1);
  assert.match(err, /feature has commits its pull request doesn't: push them\./);
});

test("finish ignores the pull request's checks when waitForChecks is false", async (t) => {
  const worktree = inWorktree(t, { onApproval: "pull-request" }, { merged: false });
  stubTools(t, { pullRequest: openPullRequest(worktree), checks: [{ name: "test", bucket: "fail" }] });
  const { code } = await run(t, ["finish", "#72"]);
  assert.equal(code, 0);
});

test("finish with waitForChecks refuses failing and running checks", async (t) => {
  const worktree = inWorktree(t, { onApproval: "pull-request", waitForChecks: true }, { merged: false });
  stubTools(t, {
    pullRequest: openPullRequest(worktree),
    checks: [
      { name: "test", bucket: "fail" },
      { name: "lint", bucket: "pending" },
    ],
  });
  const { code, err } = await run(t, ["finish", "#72"]);
  assert.equal(code, 1);
  assert.match(err, /checks are still running: lint\./);
  assert.match(err, /checks fail: test\..*issues finish #72 --checks-recorded/);
});

test("finish with waitForChecks accepts failing checks recorded in an issue comment", async (t) => {
  const worktree = inWorktree(t, { onApproval: "pull-request", waitForChecks: true }, { merged: false });
  stubTools(t, { pullRequest: openPullRequest(worktree), checks: [{ name: "test", bucket: "fail" }] });
  const { code } = await run(t, ["finish", "#72", "--checks-recorded"]);
  assert.equal(code, 0);
});

test("finish --canceled skips the checks", async (t) => {
  const worktree = inWorktree(t, { onApproval: "merge", close: "ask" }, { merged: false });
  writeFileSync(join(worktree, "draft"), "unsaved\n");
  const calls = stubTools(t);
  const { code, out } = await run(t, ["finish", "#72", "--canceled"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, HANDOFF_CALLS);
  assert.match(out, /The work was canceled\./);
  assert.match(out, /This issue's work was canceled\. Would you like to close this worktree\?/);
});

test("finish needs an issue ID", async (t) => {
  const { code, err } = await run(t, ["finish"]);
  assert.equal(code, 2);
  assert.match(err, /finish needs an issue ID/);
});

test("--help lists finish", async (t) => {
  const { code, out } = await run(t, ["--help"]);
  assert.equal(code, 0);
  assert.match(out, /^ {2}finish <id> /m);
});
