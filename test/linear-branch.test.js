import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { linearTracker } from "../mod/trackers/linear.js";
import { forgetLookups } from "../mod/lookups.js";
import { clearKeychain, saveKeychainPassword } from "./support/keychain.js";
import { createRepository, git, temporaryFolder } from "./support/repository.js";

// An issue whose open pull request, in the repository `prRepo`, works on `prBranch`.
function issueWithPullRequest(prRepo, prBranch) {
  return {
    id: "uuid-1",
    identifier: "WEB-1",
    title: "Fix the header",
    team: { id: "team-1" },
    state: { type: "started", name: "In Progress" },
    priority: 2,
    sortOrder: 1,
    labels: { nodes: [] },
    inverseRelations: { nodes: [] },
    branchName: "web-1-fix-the-header",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    description: "",
    attachments: {
      nodes: [
        {
          sourceType: "github",
          url: `https://github.com/acme/${prRepo}/pull/7`,
          title: "Fix the header",
          metadata: { repoName: prRepo, number: 7, status: "open", branch: prBranch },
        },
      ],
    },
  };
}

// Answers Linear's API with the team, and with `issue` for any issue asked for.
function stubLinear(t, issue) {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const { query } = JSON.parse(options.body);
    const data = query.includes("issue(id") ? { issue } : { team: { name: "Web", projects: { nodes: [] } } };
    return { status: 200, ok: true, text: async () => JSON.stringify({ data }) };
  });
}

async function branchOf(t, prRepo) {
  const repository = createRepository(temporaryFolder(t), { name: "web-app" });
  git(repository, "remote", "add", "origin", "git@github.com:acme/web-app.git");
  stubLinear(t, issueWithPullRequest(prRepo, "header-fix"));
  const tracker = await linearTracker({ root: repository, on: null }, { team: "WEB" });
  return (await tracker.get("WEB-1")).branch;
}

beforeEach(() => {
  clearKeychain();
  saveKeychainPassword("herdr-issues", "linear", "lin_api_test");
  forgetLookups();
});

test("an issue's branch is its open pull request's in origin's GitHub repository", async (t) => {
  assert.equal(await branchOf(t, "web-app"), "header-fix");
});

test("an issue's branch is Linear's when its pull request is in another repository", async (t) => {
  assert.equal(await branchOf(t, "api"), "web-1-fix-the-header");
});
