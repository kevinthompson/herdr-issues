import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { defaults, stubHerdr } from "./support/herdr.js";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { settingsPath } from "../mod/trackers/setting.js";
import { main } from "../cli/main.js";

const REPO = "owner/name";
const startingFolder = process.cwd();

beforeEach(() => forgetLookups());
afterEach(() => process.chdir(startingFolder));

const ISSUE_NODE = {
  number: 7, title: "Show an issue", url: `https://github.com/${REPO}/issues/7`, body: "The issue's body.\n",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z", closedAt: null, state: "OPEN", stateReason: null,
  milestone: null,
  labels: { nodes: [{ name: "bug", color: "ff0000" }, { name: "cli", color: "00ff00" }] },
  assignees: { nodes: [] },
  blockedBy: { nodes: [{ number: 3, state: "OPEN", repository: { nameWithOwner: REPO } }] },
  closedByPullRequestsReferences: { nodes: [{
    number: 9, title: "Add show", url: `https://github.com/${REPO}/pull/9`, state: "OPEN", isDraft: true,
    headRefName: "7-show-an-issue", repository: { nameWithOwner: REPO },
  }] },
};

// A repository tracked in GitHub Issues whose only issue is ISSUE_NODE; other programs, such as git, run.
function githubRepository(t) {
  const repository = createRepository(temporaryFolder(t));
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify({ repos: { [repository]: { tracker: "github", repo: REPO } } }));
  stubHerdr(t, {
    exec: async (command, args, options) => {
      if (command !== "gh") return defaults.exec(command, args, options);
      const issue = args.includes(`number=${ISSUE_NODE.number}`) ? ISSUE_NODE : null;
      return { code: 0, stdout: JSON.stringify({ data: { repository: { issue } } }), stderr: "" };
    },
  });
  process.chdir(repository);
}

async function show(t, args) {
  const out = [], err = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", (line) => err.push(line));
  const code = await main(["show", ...args]);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("show prints the issue as text", async (t) => {
  githubRepository(t);
  const result = await show(t, ["#7"]);
  assert.equal(result.code, 0, result.err);
  assert.equal(result.out, [
    "#7 Show an issue",
    "Status: in-review",
    "Labels: bug, cli",
    "Blocked by: #3",
    "Branch: 7-show-an-issue",
    "Assignee: Unassigned",
    `Pull requests: https://github.com/${REPO}/pull/9 (draft)`,
    `URL: https://github.com/${REPO}/issues/7`,
    "Updated: 2026-01-02T00:00:00Z",
    "",
    "The issue's body.",
  ].join("\n"));
});

test("show --json prints the whole issue", async (t) => {
  githubRepository(t);
  const result = await show(t, ["#7", "--json"]);
  assert.equal(result.code, 0, result.err);
  const issue = JSON.parse(result.out);
  assert.equal(issue.id, "#7");
  assert.equal(issue.body, "The issue's body.");
  assert.equal(issue.updated, "2026-01-02T00:00:00Z");
  assert.deepEqual(issue.blockedBy, ["#3"]);
  assert.equal(issue.pullRequests[0].number, 9);
});

test("show refuses an issue the tracker can't find", async (t) => {
  githubRepository(t);
  const result = await show(t, ["#404"]);
  assert.equal(result.code, 1);
  assert.equal(result.out, "");
  assert.equal(result.err, "#404: not found");
});

test("show appears in issues --help", async (t) => {
  const out = [];
  t.mock.method(console, "log", (line) => out.push(line));
  await main(["show", "--help"]);
  assert.match(out.join("\n"), /^ {2}show <id> \[--json\]/m);
});
