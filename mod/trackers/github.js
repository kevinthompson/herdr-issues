// Issues in a GitHub repository, for repositories whose entry in issues.json says { "tracker": "github" } (setting.js),
// with an optional "repo": "owner/name" in place of origin's. Every request goes through the GitHub CLI, so
// `gh auth login` is the only credential.
//
// GitHub issues are only open or closed, so their status is derived: closed as completed is done, closed
// any other way is canceled; an open issue with a linked pull request (one that closes it) is in review,
// an assigned one is in progress, and the rest are todo. Labels never carry a status. GitHub has no priority
// or backlog; blockers come from its issue dependencies.
import { exec } from "herdr";
import { mainCheckout } from "../location.js";
import { ghMissing, ghLoggedOut, ghFailed } from "./problems.js";

const PAGE_SIZE = 50;
const MAX_PAGES = 20;
const RECENTLY_CLOSED = 20;
const BLOCKERS = 20;
const BRANCH_SLUG_LENGTH = 50;
const MAX_LABELS = 200;

const ISSUE_FIELDS = `number title url createdAt updatedAt closedAt state stateReason milestone { dueOn }
  labels(first: 20) { nodes { name color } }
  assignees(first: 10) { nodes { login name avatarUrl } }
  blockedBy(first: ${BLOCKERS}) { nodes { number state repository { nameWithOwner } } }
  closedByPullRequestsReferences(first: 10, includeClosedPrs: true) {
    nodes { number title url state isDraft headRefName repository { nameWithOwner } } }`;
const ISSUES = (state, orderBy) => `query($owner: String!, $name: String!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $name) { issues(states: [${state}], first: $first, after: $after,
    orderBy: { field: ${orderBy}, direction: DESC }) {
    pageInfo { hasNextPage endCursor } nodes { ${ISSUE_FIELDS} } } } }`;
const ISSUE = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { issue(number: $number) { ${ISSUE_FIELDS} body } } }`;

// The statuses a person can pick. In review follows from a linked pull request, so it can't be set.
const SETTABLE_STATUSES = ["todo", "in-progress", "done", "canceled"];

const issueNumber = (id) => Number(String(id).replace(/^#/, ""));

function pullRequestStatus({ state, isDraft }) {
  if (state === "MERGED") return "merged";
  if (state === "CLOSED") return "closed";
  return isDraft ? "draft" : "open";
}

function statusOf(node, pullRequests) {
  if (node.state === "CLOSED") return node.stateReason === "COMPLETED" ? "done" : "canceled";
  if (pullRequests.some((pullRequest) => pullRequest.status !== "closed")) return "in-review";
  return node.assignees.nodes.length ? "in-progress" : "todo";
}

// The branch GitHub's "Create a branch" names for an issue: its number, then its title as a slug.
function suggestedBranch(node) {
  const slug = node.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, BRANCH_SLUG_LENGTH).replace(/^-+|-+$/g, "");
  return slug ? `${node.number}-${slug}` : String(node.number);
}

// Closed blockers are only listed once Done or Canceled is expanded, so only the open ones may block.
function openBlockers(node, repo) {
  return node.blockedBy.nodes.filter((blocker) => blocker.state === "OPEN").map((blocker) =>
    blocker.repository.nameWithOwner === repo ? `#${blocker.number}` : `${blocker.repository.nameWithOwner}#${blocker.number}`);
}

function toIssue(node, repo) {
  const pullRequests = node.closedByPullRequestsReferences.nodes.map((pullRequest) => ({
    url: pullRequest.url,
    title: pullRequest.title,
    repo: pullRequest.repository.nameWithOwner.split("/").pop(),
    fullRepo: pullRequest.repository.nameWithOwner,
    number: pullRequest.number,
    status: pullRequestStatus(pullRequest),
    branch: pullRequest.headRefName,
  }));
  const open = pullRequests.find((pullRequest) => pullRequest.fullRepo === repo && ["open", "draft"].includes(pullRequest.status));
  const [assignee] = node.assignees.nodes;
  const labels = node.labels.nodes;
  return {
    id: `#${node.number}`,
    number: node.number,
    title: node.title,
    status: statusOf(node, pullRequests),
    priority: 0,
    order: null,
    labels: labels.map((label) => label.name),
    labelColors: Object.fromEntries(labels.map((label) => [label.name, `#${label.color}`])),
    blockedBy: openBlockers(node, repo),
    branch: open?.branch ?? suggestedBranch(node),
    assignee: assignee ? assignee.name || assignee.login : "Unassigned",
    assigneeAvatar: assignee?.avatarUrl ?? null,
    assigneeLogins: node.assignees.nodes.map((each) => each.login),
    due: node.milestone?.dueOn?.slice(0, 10) ?? null,
    created: node.createdAt,
    completed: node.state === "CLOSED" ? node.closedAt : null,
    body: node.body === undefined ? null : (node.body ?? "").trim(),
    pullRequests,
    updated: node.updatedAt,
    url: node.url,
  };
}

// The signed-in GitHub user's login, read once.
let viewerLogin = null;

// Each main checkout's origin repository as "owner/name", looked up once while the mod runs; a failed
// lookup is forgotten so the next refresh asks again.
const originRepositories = new Map();

function originRepository(root, gh) {
  if (!originRepositories.has(root)) {
    const lookup = gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).then((stdout) => stdout.trim());
    lookup.catch(() => originRepositories.delete(root));
    originRepositories.set(root, lookup);
  }
  return originRepositories.get(root);
}

// Runs the GitHub CLI in the main checkout `root`, resolving with its output.
const ghIn = (root) => async (args) => {
  const result = await exec("gh", args, { cwd: root }).catch(() => null);
  if (!result) throw await ghMissing();
  if (result.code !== 0) throw ghFailed(result.stderr.trim().split("\n").pop() || `gh ${args[0]} failed`);
  return result.stdout;
};

// Throws the problem that stops the GitHub CLI from answering as the person: not installed, or not logged in.
export async function checkGitHubLogin() {
  const installed = await exec("gh", ["--version"]).catch(() => null);
  if (installed?.code !== 0) throw await ghMissing();
  const auth = await exec("gh", ["auth", "status", "--hostname", "github.com"]).catch(() => null);
  if (auth?.code !== 0) throw ghLoggedOut();
}

// The repository a GitHub-tracked main checkout's issues live in, as "owner/name".
export const githubRepository = (root, setting) => setting.repo ?? originRepository(root, ghIn(root));

export async function githubTracker({ root: projectRoot, on }, setting) {
  if (on != null) return null;
  const root = await mainCheckout(projectRoot, on);
  const gh = ghIn(root);
  const repo = await githubRepository(root, setting);
  const [owner, name] = repo.split("/");

  async function graphql(query, variables) {
    const args = ["api", "graphql", "-f", `query=${query}`, "-f", `owner=${owner}`, "-f", `name=${name}`];
    for (const [key, value] of Object.entries(variables)) {
      if (value !== null) args.push(typeof value === "number" ? "-F" : "-f", `${key}=${value}`);
    }
    const answer = JSON.parse(await gh(args));
    if (answer.errors?.length) throw new Error(answer.errors[0].message);
    return answer.data;
  }

  async function issuePages(query, pageLimit) {
    const nodes = [];
    let after = null;
    for (let page = 0; page < pageLimit.pages; page++) {
      const { issues } = (await graphql(query, { first: pageLimit.size, after })).repository;
      nodes.push(...issues.nodes);
      if (!issues.pageInfo.hasNextPage) break;
      after = issues.pageInfo.endCursor;
    }
    return nodes;
  }

  async function viewer() {
    viewerLogin ??= (await gh(["api", "user", "--jq", ".login"])).trim();
    return viewerLogin;
  }

  const rest = (method, path, fields) =>
    gh(["api", "-X", method, `repos/${repo}/${path}`, ...Object.entries(fields).flatMap(([key, value]) => ["-f", `${key}=${value}`])]);
  const editIssue = (issue, fields) => rest("PATCH", `issues/${issue.number}`, fields);
  const assignees = (issue, method, login) => rest(method, `issues/${issue.number}/assignees`, { "assignees[]": login });

  async function get(id) {
    const number = issueNumber(id);
    if (!Number.isInteger(number)) return null;
    const answer = await graphql(ISSUE, { number }).catch(() => null);
    const node = answer?.repository?.issue;
    return node ? toIssue(node, repo) : null;
  }

  async function setStatus(issue, status) {
    if (!SETTABLE_STATUSES.includes(status)) throw new Error(`GitHub issues can't be set to ${status}`);
    if (status === "done") return editIssue(issue, { state: "closed", state_reason: "completed" });
    if (status === "canceled") return editIssue(issue, { state: "closed", state_reason: "not_planned" });
    if (issue.status === "done" || issue.status === "canceled") await editIssue(issue, { state: "open" });
    const login = await viewer(), current = await get(issue.id);
    if (!current) throw new Error(`${issue.id} no longer exists`);
    if (status === "in-progress" && !current.assigneeLogins.length) await assignees(issue, "POST", login);
    if (status === "todo" && current.assigneeLogins.includes(login)) await assignees(issue, "DELETE", login);
  }

  return {
    kind: "github",
    name: "GitHub",
    repo,
    writable: true,
    prioritized: false,
    statuses: SETTABLE_STATUSES,
    // Every open issue, and once Done or Canceled is expanded, the most recently closed ones.
    async list(_scopeId, loads = new Set()) {
      const lists = await Promise.all([
        issuePages(ISSUES("OPEN", "CREATED_AT"), { pages: MAX_PAGES, size: PAGE_SIZE }),
        loads.has("done") || loads.has("canceled")
          ? issuePages(ISSUES("CLOSED", "UPDATED_AT"), { pages: 1, size: RECENTLY_CLOSED }) : [],
      ]);
      return lists.flat().map((node) => toIssue(node, repo));
    },
    deferred: () => ["done", "canceled"],
    get,
    async labels() {
      return JSON.parse(await gh(["label", "list", "--repo", repo, "--json", "name", "--limit", String(MAX_LABELS)])).map((label) => label.name);
    },
    // A new body only saves over the body `issue` was read with, so edits made on GitHub meanwhile are
    // never overwritten. Priority and order have nowhere to go.
    async update(issue, { status, body }) {
      if (body !== undefined) {
        const current = await get(issue.id);
        if (!current) throw new Error(`${issue.id} no longer exists`);
        if (current.body !== issue.body) throw new Error(`${issue.id} changed on GitHub while you were editing it`);
        await editIssue(issue, { body });
      }
      if (status !== undefined) await setStatus(issue, status);
    },
    // Claims an unassigned issue, reopening it if it was closed.
    async start(issue) {
      await setStatus(issue, "in-progress");
    },
  };
}
