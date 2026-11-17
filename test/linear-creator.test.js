import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { linearTracker } from "../mod/trackers/linear.js";
import { forgetLookups } from "../mod/lookups.js";
import { clearKeychain, saveKeychainPassword } from "./support/keychain.js";
import { createRepository, temporaryFolder } from "./support/repository.js";

const issueNode = {
  id: "uuid-1",
  identifier: "WEB-1",
  title: "Fix the header",
  team: { id: "team-1" },
  state: { type: "started", name: "In Progress" },
  priority: 2,
  sortOrder: 1,
  branchName: "web-1-fix-the-header",
  labels: { nodes: [] },
  inverseRelations: { nodes: [] },
  attachments: { nodes: [] },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  description: "",
};

// The issue as the tracker reads it from Linear's answer of this node.
async function issueFrom(t, node) {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const { query } = JSON.parse(options.body);
    const data = query.includes("issue(id") ? { issue: node } : { team: { name: "Web", projects: { nodes: [] } } };
    return { status: 200, ok: true, text: async () => JSON.stringify({ data }) };
  });
  const repository = createRepository(temporaryFolder(t), { name: "web-app" });
  const tracker = await linearTracker({ root: repository, on: null }, { team: "WEB" });
  return tracker.get("WEB-1");
}

beforeEach(() => {
  clearKeychain();
  saveKeychainPassword("herdr-issues", "linear", "lin_api_test");
  forgetLookups();
});

test("carries the name and avatar of the person who created an issue", async (t) => {
  const issue = await issueFrom(t, {
    ...issueNode,
    creator: { name: "Ada Lovelace", avatarUrl: "https://avatars.example/ada" },
  });
  assert.equal(issue.creator, "Ada Lovelace");
  assert.equal(issue.creatorAvatar, "https://avatars.example/ada");
});

test("carries no creator for an issue an integration created", async (t) => {
  const issue = await issueFrom(t, { ...issueNode, creator: null });
  assert.equal(issue.creator, null);
  assert.equal(issue.creatorAvatar, null);
});
