import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { linearTracker } from "../mod/trackers/linear.js";
import { forgetLookups } from "../mod/lookups.js";
import { clearKeychain, saveKeychainPassword } from "./support/keychain.js";
import { createRepository, temporaryFolder } from "./support/repository.js";

// The issue filters a view's list sends to Linear, when the view belongs to `viewTeam` and saves `filterData`.
async function issueFiltersSent(t, viewSlug, { viewTeam, filterData }) {
  const issueFilters = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const { query, variables } = JSON.parse(options.body);
    let data;
    if (query.includes("customView(")) data = { customView: { filterData, team: viewTeam } };
    else if (query.includes("issues(")) {
      issueFilters.push(variables.filter);
      data = { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } };
    } else data = { team: { name: "Calendar", projects: { nodes: [] } } };
    return { status: 200, ok: true, text: async () => JSON.stringify({ data }) };
  });
  const repository = createRepository(temporaryFolder(t), { name: "calendar" });
  const tracker = await linearTracker(
    { root: repository, on: null },
    { team: "CAL", views: { Core: `https://linear.app/acme/view/${viewSlug}` } },
  );
  await tracker.list(`view:${viewSlug.split("-").pop()}`);
  return issueFilters;
}

const teamOrSubTeam = (teamId) => ({
  team: { or: [{ id: { eq: teamId } }, { ancestors: { some: { id: { eq: teamId } } } }] },
});

beforeEach(() => {
  clearKeychain();
  saveKeychainPassword("herdr-issues", "linear", "lin_api_test");
  forgetLookups();
});

test("limits a team's view whose filter names no team to that team and its sub-teams", async (t) => {
  const filterData = { labels: { name: { eq: "Core" } } };
  const filters = await issueFiltersSent(t, "core-000000000001", { viewTeam: { id: "team-cal" }, filterData });
  assert.ok(filters.length > 0);
  for (const filter of filters) assert.deepEqual(filter, { and: [filterData, teamOrSubTeam("team-cal")] });
});

test("keeps the team a parent team's view names, alongside the parent team's limit", async (t) => {
  const filterData = { team: { key: { eq: "CAL" } }, labels: { name: { eq: "Core" } } };
  const filters = await issueFiltersSent(t, "core-000000000002", { viewTeam: { id: "team-eng" }, filterData });
  assert.ok(filters.length > 0);
  for (const filter of filters) assert.deepEqual(filter, { and: [filterData, teamOrSubTeam("team-eng")] });
});

test("sends a workspace view's filter unchanged", async (t) => {
  const filterData = { labels: { name: { eq: "Core" } } };
  const filters = await issueFiltersSent(t, "core-000000000003", { viewTeam: null, filterData });
  assert.ok(filters.length > 0);
  for (const filter of filters) assert.deepEqual(filter, filterData);
});
