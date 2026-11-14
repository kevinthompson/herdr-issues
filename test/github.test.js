import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { githubTracker } from "../mod/trackers/github.js";

const REPO = "owner/name";
const VIEWER = "me";

const issueNode = (number, { state = "OPEN", stateReason = null, labels = [], assignees = [], pullRequests = [] } = {}) => ({
  number, title: `Issue ${number}`, url: `https://github.com/${REPO}/issues/${number}`, body: "",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", closedAt: null, state, stateReason, milestone: null,
  labels: { nodes: labels.map((name) => ({ name, color: "ededed" })) },
  assignees: { nodes: assignees.map((login) => ({ login, name: login, avatarUrl: null })) },
  blockedBy: { nodes: [] },
  closedByPullRequestsReferences: { nodes: pullRequests.map((pullRequestState) => ({
    number: 100, title: "Fix", url: `https://github.com/${REPO}/pull/100`, state: pullRequestState, isDraft: false,
    headRefName: `${number}-fix`, repository: { nameWithOwner: REPO } })) },
});

// A tracker whose `gh` answers every issue query with `nodes`, recording each REST request it makes.
async function trackerWith(t, nodes) {
  const restRequests = [];
  const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
  stubHerdr(t, {
    exec: async (command, args) => {
      if (command === "git") return { code: 1, stdout: "", stderr: "" };
      if (args[1] === "graphql") {
        const number = args.find((arg) => arg.startsWith("number="))?.split("=")[1];
        const matching = number ? nodes.find((node) => node.number === Number(number)) : null;
        return ok(JSON.stringify({ data: { repository: number
          ? { issue: matching }
          : { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } }));
      }
      if (args[1] === "user") return ok(`${VIEWER}\n`);
      restRequests.push(args.slice(2, 4).join(" "));
      return ok("{}");
    },
  });
  const tracker = await githubTracker({ root: "/repository", on: null }, { repo: REPO });
  return { tracker, restRequests };
}

const statusesOf = (issues) => Object.fromEntries(issues.map((issue) => [issue.id, issue.status]));

describe("GitHub tracker statuses", () => {
  test("derive each status from state, linked pull requests and assignees, never from labels", async (t) => {
    const { tracker } = await trackerWith(t, [
      issueNode(1),
      issueNode(2, { labels: ["todo"] }),
      issueNode(3, { labels: ["bug"] }),
      issueNode(4, { assignees: ["someone"] }),
      issueNode(5, { pullRequests: ["OPEN"] }),
      issueNode(6, { pullRequests: ["CLOSED"] }),
      issueNode(7, { state: "CLOSED", stateReason: "COMPLETED" }),
      issueNode(8, { state: "CLOSED", stateReason: "NOT_PLANNED" }),
    ]);
    assert.deepEqual(statusesOf(await tracker.list()), {
      "#1": "todo", "#2": "todo", "#3": "todo", "#4": "in-progress",
      "#5": "in-review", "#6": "todo", "#7": "done", "#8": "canceled",
    });
  });

  test("list a todo label like any other label", async (t) => {
    const { tracker } = await trackerWith(t, [issueNode(1, { labels: ["todo", "bug"] })]);
    const [issue] = await tracker.list();
    assert.deepEqual(issue.labels, ["todo", "bug"]);
    assert.deepEqual(Object.keys(issue.labelColors), ["todo", "bug"]);
  });

  test("offer no backlog status", async (t) => {
    const { tracker } = await trackerWith(t, []);
    assert.deepEqual(tracker.statuses, ["todo", "in-progress", "done", "canceled"]);
  });

  test("set an issue to todo by unassigning the person, without touching labels", async (t) => {
    const { tracker, restRequests } = await trackerWith(t, [issueNode(1, { assignees: [VIEWER] })]);
    const [issue] = await tracker.list();
    await tracker.update(issue, { status: "todo" });
    assert.deepEqual(restRequests, [`DELETE repos/${REPO}/issues/1/assignees`]);
  });

  test("set an issue to in progress by assigning the person, without touching labels", async (t) => {
    const { tracker, restRequests } = await trackerWith(t, [issueNode(1)]);
    const [issue] = await tracker.list();
    await tracker.update(issue, { status: "in-progress" });
    assert.deepEqual(restRequests, [`POST repos/${REPO}/issues/1/assignees`]);
  });
});
