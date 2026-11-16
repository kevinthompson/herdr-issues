import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { linearTracker } from "../mod/trackers/linear.js";
import { forgetLookups } from "../mod/lookups.js";
import { clearKeychain, saveKeychainPassword } from "./support/keychain.js";
import { temporaryFolder } from "./support/repository.js";

const comment = (name, createdAt, body) => ({ user: name && { name }, botActor: null, createdAt, body });

const issueNode = (comments) => ({
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
  attachments: { nodes: [] },
  comments: { nodes: comments },
});

// Answers Linear's API with `issue` for any issue or list of issues asked for, leaving out its comments when the
// query doesn't select them.
async function trackerWith(t, issue) {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const { query } = JSON.parse(options.body);
    const { comments, ...withoutComments } = issue;
    const answered = query.includes("comments(") ? { ...withoutComments, comments } : withoutComments;
    const connection = { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [answered] };
    const data = query.includes("issue(id")
      ? { issue: answered }
      : query.includes("assignedIssues")
        ? { viewer: { assignedIssues: connection } }
        : { team: { name: "Web", projects: { nodes: [] } } };
    return { status: 200, ok: true, text: async () => JSON.stringify({ data }) };
  });
  return linearTracker({ root: temporaryFolder(t), on: null }, { team: "WEB" });
}

beforeEach(() => {
  clearKeychain();
  saveKeychainPassword("herdr-issues", "linear", "lin_api_test");
  forgetLookups();
});

test("get loads an issue's comments with its body, oldest first", async (t) => {
  const tracker = await trackerWith(
    t,
    issueNode([
      comment("Second", "2026-01-03T00:00:00Z", "Later\n"),
      comment("First", "2026-01-02T00:00:00Z", "Earlier"),
      { user: null, botActor: { name: "GitHub" }, createdAt: "2026-01-04T00:00:00Z", body: "Linked a pull request" },
    ]),
  );
  assert.deepEqual((await tracker.get("WEB-1")).comments, [
    { author: "First", created: "2026-01-02T00:00:00Z", body: "Earlier" },
    { author: "Second", created: "2026-01-03T00:00:00Z", body: "Later" },
    { author: "GitHub", created: "2026-01-04T00:00:00Z", body: "Linked a pull request" },
  ]);
});

test("get gives an issue without comments an empty list", async (t) => {
  const tracker = await trackerWith(t, issueNode([]));
  assert.deepEqual((await tracker.get("WEB-1")).comments, []);
});

test("list leaves comments unloaded", async (t) => {
  const tracker = await trackerWith(t, issueNode([comment("First", "2026-01-02T00:00:00Z", "Earlier")]));
  const [issue] = await tracker.list("mine");
  assert.equal(issue.comments, null);
});
