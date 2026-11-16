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

const issueNode = (number, title) => ({
  number,
  title,
  url: `https://github.com/${REPO}/issues/${number}`,
  body: "",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  closedAt: null,
  state: "OPEN",
  stateReason: null,
  milestone: null,
  labels: { nodes: [] },
  assignees: { nodes: [] },
  blockedBy: { nodes: [] },
  closedByPullRequestsReferences: { nodes: [] },
});

// A repository tracked in GitHub Issues whose `gh` is logged in unless `loggedIn` is false, has the labels
// `labels` and lists the open issues `nodes`; other programs, such as git, run.
function githubRepository(t, { labels = [], nodes = [], loggedIn = true } = {}) {
  const repository = createRepository(temporaryFolder(t));
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify({ repos: { [repository]: { tracker: "github", repo: REPO } } }));
  const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
  stubHerdr(t, {
    exec: async (command, args, options) => {
      if (command !== "gh") return defaults.exec(command, args, options);
      if (args[0] === "auth") return loggedIn ? ok("") : { code: 1, stdout: "", stderr: "not logged in" };
      if (args[0] === "label") return ok(JSON.stringify(labels.map((name) => ({ name }))));
      if (args[1] === "graphql")
        return ok(
          JSON.stringify({
            data: { repository: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } },
          }),
        );
      return ok("");
    },
  });
  process.chdir(repository);
}

async function context(t, words) {
  const out = [],
    err = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", (line) => err.push(line));
  const code = await main(["context", ...words]);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("context prints the tracker and its labels", async (t) => {
  githubRepository(t, { labels: ["bug", "enhancement"] });
  const result = await context(t, []);
  assert.equal(result.code, 0, result.err);
  const answer = JSON.parse(result.out);
  assert.deepEqual(answer.tracker, { kind: "github", name: "GitHub", team: null, repo: REPO });
  assert.deepEqual(answer.labels, ["bug", "enhancement"]);
  assert.deepEqual(answer.similarIssues, []);
});

test("context lists the issues sharing the most title words first, ignoring short words", async (t) => {
  githubRepository(t, {
    nodes: [
      issueNode(1, "Show the panel's poll interval"),
      issueNode(2, "Write issues in the background"),
      issueNode(3, "Write issues on a configurable model in the background"),
      issueNode(4, "Fix a typo in the README"),
    ],
  });
  const result = await context(t, ["write", "issues", "in", "the", "background"]);
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(
    JSON.parse(result.out).similarIssues.map((issue) => issue.id),
    ["#2", "#3"],
  );
});

test("context stops with the credentials' fix when gh isn't logged in", async (t) => {
  githubRepository(t, { loggedIn: false });
  const result = await context(t, ["anything"]);
  assert.equal(result.code, 1);
  assert.equal(result.out, "");
  assert.match(result.err, /isn't logged in/);
  assert.match(result.err, /gh auth login/);
});

test("context appears in issues --help", async (t) => {
  const out = [];
  t.mock.method(console, "log", (line) => out.push(line));
  await main(["--help"]);
  assert.match(out.join("\n"), /^ {2}context \[<words>\.\.\.\]/m);
});
