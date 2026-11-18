import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { linearTracker } from "../mod/trackers/linear.js";
import { forgetLookups } from "../mod/lookups.js";
import { saveLinearKeyFile } from "./support/linear-key.js";
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
  labels: { nodes: [{ name: "Bug", color: "#eb5757", parent: null }] },
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
  saveLinearKeyFile("lin_api_test");
  forgetLookups();
});

test("carries the project an issue belongs to, apart from its labels", async (t) => {
  const issue = await issueFrom(t, {
    ...issueNode,
    project: { id: "project-1", name: "Calendar N+1", color: "#5e6ad2", url: "https://linear.app/p/1" },
  });
  assert.deepEqual(issue.project, { id: "project-1", name: "Calendar N+1", color: "#5e6ad2" });
  assert.deepEqual(issue.labels, ["Bug"]);
});

test("carries no project for an issue outside every project", async (t) => {
  const issue = await issueFrom(t, { ...issueNode, project: null });
  assert.equal(issue.project, null);
});
