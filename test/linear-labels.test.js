import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { linearTracker } from "../mod/trackers/linear.js";
import { forgetLookups } from "../mod/lookups.js";
import { clearKeychain, saveKeychainPassword } from "./support/keychain.js";
import { createRepository, temporaryFolder } from "./support/repository.js";

// The team's labels as Linear lists them: workspace and team labels, a label group and the labels in it.
const TEAM_LABELS = [
  { id: "label-bug", name: "Bug", isGroup: false, parent: null },
  { id: "group-cloud", name: "cloud-agent", isGroup: true, parent: null },
  { id: "label-one-shot", name: "one-shot", isGroup: false, parent: { name: "cloud-agent" } },
  { id: "label-plan", name: "plan", isGroup: false, parent: { name: "cloud-agent" } },
  { id: "label-other-one-shot", name: "one-shot", isGroup: false, parent: { name: "experiments" } },
];

const issueNode = {
  id: "uuid-1",
  identifier: "WEB-1",
  title: "Fix the header",
  team: { id: "team-1" },
  state: { type: "started", name: "In Progress" },
  priority: 2,
  sortOrder: 1,
  branchName: "web-1-fix-the-header",
  labels: {
    nodes: [
      { name: "Bug", color: "#eb5757", parent: null },
      { name: "plan", color: "#4ea7fc", parent: { name: "cloud-agent" } },
    ],
  },
  inverseRelations: { nodes: [] },
  attachments: { nodes: [] },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  description: "",
};

// Answers Linear's API with the team, its labels and the issue, recording each mutation and the team each label
// list was read for.
async function trackerWith(t) {
  const mutations = [],
    labelTeams = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const { query, variables } = JSON.parse(options.body);
    let data;
    if (query.startsWith("mutation")) {
      mutations.push({ mutation: /\{ (\w+)\(/.exec(query)[1], ...variables });
      data = {};
    } else if (query.includes("labels(first: $first")) {
      labelTeams.push(variables.team);
      data = { team: { labels: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: TEAM_LABELS } } };
    } else if (query.includes("issue(id")) data = { issue: issueNode };
    else data = { team: { name: "Web", projects: { nodes: [] } } };
    return { status: 200, ok: true, text: async () => JSON.stringify({ data }) };
  });
  const repository = createRepository(temporaryFolder(t), { name: "web-app" });
  const tracker = await linearTracker({ root: repository, on: null }, { team: "WEB" });
  return { tracker, mutations, labelTeams, issue: await tracker.get("WEB-1") };
}

beforeEach(() => {
  clearKeychain();
  saveKeychainPassword("herdr-issues", "linear", "lin_api_test");
  forgetLookups();
});

test("names a label in a group after its group", async (t) => {
  const { issue } = await trackerWith(t);
  assert.deepEqual(issue.labels, ["Bug", "cloud-agent > plan"]);
  assert.equal(issue.labelColors["cloud-agent > plan"], "#4ea7fc");
});

test("gives a label in a group its group and value apart, by its full name", async (t) => {
  const { issue } = await trackerWith(t);
  assert.deepEqual(issue.labelParts, { "cloud-agent > plan": { group: "cloud-agent", value: "plan" } });
});

test("lists the team's labels, without the groups that hold them", async (t) => {
  const { tracker, labelTeams } = await trackerWith(t);
  assert.deepEqual(await tracker.labels(), [
    "Bug",
    "cloud-agent > one-shot",
    "cloud-agent > plan",
    "experiments > one-shot",
  ]);
  assert.deepEqual(labelTeams, ["WEB"]);
});

test("adds and removes labels one at a time by the IDs of the issue's team, keeping its others", async (t) => {
  const { tracker, issue, mutations, labelTeams } = await trackerWith(t);
  await tracker.update(issue, { addLabels: ["cloud-agent > one-shot"], removeLabels: ["Bug"] });
  assert.deepEqual(labelTeams, ["team-1"]);
  assert.deepEqual(mutations, [
    { mutation: "issueAddLabel", id: "uuid-1", labelId: "label-one-shot" },
    { mutation: "issueRemoveLabel", id: "uuid-1", labelId: "label-bug" },
  ]);
});

test("refuses a name with no matching label, naming it and changing nothing", async (t) => {
  const { tracker, issue, mutations } = await trackerWith(t);
  await assert.rejects(
    tracker.update(issue, { addLabels: ["Bug", "one-shot"] }),
    /WEB-1's team has no label named one-shot/,
  );
  await assert.rejects(tracker.update(issue, { addLabels: ["cloud-agent"] }), /has no label named cloud-agent/);
  assert.deepEqual(mutations, []);
});
