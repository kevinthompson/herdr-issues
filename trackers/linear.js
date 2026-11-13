// Issues in Linear, for Planning Center repositories (their team found by linear-team.js) and those named in
// ~/.config/herdr-app/linear.json, whose entries win:
// { "apiKey": "lin_api_…", "repos": { "<team key>": "~/Code/repo" } }, or, with saved Linear views,
// { "<team key>": { "path": "~/Code/repo", "views": { "<name>": "https://linear.app/…/view/…" } } }.
// A repository lists one scope of issues at a time, every open issue assigned to you, across teams, by
// default. The team's issues waiting in triage, all its issues and its saved views are scopes, and its
// open projects are scopes too, each narrowed further to one of its milestones. Scopes other than a view and triage add the issues
// completed or merged most recently.
import { home, appHome, readTextFile } from "herdr";
import { mainCheckout } from "../location.js";
import { planningCenterRepoName, detectedTeam } from "./linear-team.js";
import { STATUSES, STATUS_LABELS } from "../issue.js";

const API_URL = "https://api.linear.app/graphql";
// Linear refuses a query costing over 10,000, roughly each page's size times its nested lists.
const PAGE_SIZE = 50;
const MAX_PAGES = 20;
const RECENTLY_FINISHED = 10;
// How long a view's saved filter, or a team's name and projects, is reused before it is read again, to pick up
// edits made in Linear.
const VIEW_FILTER_TTL_MS = 10 * 60 * 1000;
const TEAM_TTL_MS = 10 * 60 * 1000;

// Lists leave out descriptions, by far the largest field, and an issue's description loads when it opens.
const ISSUE_FIELDS = `id identifier title priority sortOrder branchName createdAt updatedAt completedAt url
  slaBreachesAt slaMediumRiskAt slaHighRiskAt assignee { name avatarUrl } delegate { id }
  state { type name } team { id }
  labels(first: 10) { nodes { name color } }
  inverseRelations(first: 20) { nodes { type issue { identifier state { type name } } } }
  attachments(first: 10) { nodes { url title sourceType metadata } }`;

const PAGE = `pageInfo { hasNextPage endCursor } nodes { ${ISSUE_FIELDS} }`;
// Started states named Merged count as done, so they are listed with the finished issues instead.
const MERGED_STATE = { type: { eq: "started" }, name: { containsIgnoreCase: "merged" } };
const TRIAGE_STATE = { type: { eq: "triage" } };
const OPEN_STATE = { type: { nin: ["completed", "canceled"] }, name: { notContainsIgnoreCase: "merged" } };
const FINISHED_STATES = [{ type: { eq: "completed" } }, MERGED_STATE];

const MY_ISSUES = `query($state: WorkflowStateFilter, $first: Int!, $after: String) { viewer {
  assignedIssues(first: $first, after: $after, orderBy: updatedAt, filter: { state: $state }) { ${PAGE} } } }`;
const TEAM_ISSUES = `query($team: String!, $state: WorkflowStateFilter, $first: Int!, $after: String) {
  issues(first: $first, after: $after, orderBy: updatedAt, filter: { team: { key: { eq: $team } }, state: $state }) { ${PAGE} } }`;
const VIEW_FILTER = `query($view: String!) { customView(id: $view) { filterData } }`;
const FILTERED_ISSUES = `query($filter: IssueFilter, $first: Int!, $after: String) {
  issues(first: $first, after: $after, filter: $filter) { ${PAGE} } }`;
const FILTERED_ISSUES_IN_STATE = `query($filter: IssueFilter!, $state: WorkflowStateFilter, $first: Int!, $after: String) {
  issues(first: $first, after: $after, orderBy: updatedAt, filter: { and: [$filter, { state: $state }] }) { ${PAGE} } }`;
const TEAM_PROJECTS = `query($team: String!) { team(id: $team) { name
  projects(first: 50, filter: { status: { type: { nin: ["completed", "canceled"] } } }) { nodes {
    id name url status { name type } projectMilestones(first: 50) { nodes { id name sortOrder } } } } } }`;

const ISSUE = `query($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} description } }`;
const TEAM_STATES = `query($id: String!) { team(id: $id) { states { nodes { id name type position } } } }`;
const ASSIGNEE_AND_VIEWER = `query($id: String!) { viewer { id } issue(id: $id) { assignee { id } } }`;
// The cloud-agent > one-shot label marks an issue as ready for Planning Center's Cloud Agent, which
// works the issues delegated to it.
const CLOUD_AGENT = `query { users(filter: { app: { eq: true }, name: { eq: "Cloud Agent" } }) { nodes { id } }
  issueLabels(filter: { name: { eq: "one-shot" }, parent: { name: { eq: "cloud-agent" } } }) { nodes { id } } }`;
const UPDATE = `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`;

// Linear's workflow state types, as the panel's statuses. Started states split in three: one named for
// review is In review, one named Merged is Done, and the rest are In progress.
const STATUS_TYPES = { triage: ["triage"], backlog: ["backlog"], todo: ["unstarted"], "in-progress": ["started"], "in-review": ["started"], done: ["completed"], canceled: ["canceled"] };
const isReviewState = (state) => /review/i.test(state.name);
const isMergedState = (state) => /merged/i.test(state.name);
function statusOf(state) {
  if (state.type === "started" && isMergedState(state)) return "done";
  if (state.type === "started") return isReviewState(state) ? "in-review" : "in-progress";
  return Object.keys(STATUS_TYPES).find((status) => STATUS_TYPES[status].includes(state.type)) ?? state.type;
}
const isFinished = (state) => ["done", "canceled"].includes(statusOf(state));

// GitHub's pull requests attached to an issue: { url, title, repo, number, status, branch }, where status
// is Linear's, such as "open", "draft", "inReview", "approved", "merged" or "closed".
function pullRequestsOf(attachments) {
  return attachments.nodes
    .filter((attachment) => attachment.sourceType === "github" && /\/pull\/\d+/.test(attachment.url))
    .map(({ url, title, metadata }) => ({
      url,
      title: metadata.title ?? title,
      repo: metadata.repoName ?? null,
      number: metadata.number ?? null,
      status: metadata.draft && !["merged", "closed"].includes(metadata.status) ? "draft" : (metadata.status ?? "open"),
      branch: metadata.branch ?? null,
    }));
}

const expandHome = (path) => (path.startsWith("~/") ? `${home()}${path.slice(1)}` : path);

// A view's URL ends in its name and its ID, which the API takes in place of the view's UUID:
// …/view/calendar-core-a8875271fcf5 is a8875271fcf5.
const viewId = (url) => url.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop().split("-").pop();

function repoConfig(teamKey, entry) {
  const { path, views = {} } = typeof entry === "string" ? { path: entry } : entry;
  return { teamKey, path: expandHome(path), views: Object.entries(views).map(([name, url]) => ({ name, id: viewId(url) })) };
}

async function loadConfig() {
  const text = await readTextFile(`${appHome()}/linear.json`).catch(() => null);
  if (text === null) return null;
  const config = JSON.parse(text);
  return { apiKey: config.apiKey, repos: Object.entries(config.repos ?? {}).map(([teamKey, entry]) => repoConfig(teamKey, entry)) };
}

// Projects in the scope menu, by status: in progress, then planned, paused and backlog.
const PROJECT_STATUS_ORDER = ["started", "planned", "paused", "backlog"];
const statusRank = (project) => {
  const rank = PROJECT_STATUS_ORDER.indexOf(project.status?.type);
  return rank === -1 ? PROJECT_STATUS_ORDER.length : rank;
};

// The issue lists a repository can show: { id, label, group?, subgroup?, milestones? }, its default first.
// My issues stands alone, then the team's lists and saved views under the team's name, then its projects,
// grouped under their status. A project scope lists its milestones as scopes of their own: { id, label }.
function scopesFor({ views }, { name: teamName, projects }) {
  const mine = { id: "mine", label: "My issues" };
  const teamScopes = [{ id: "triage", label: "Triage" }, { id: "team", label: "Issues" },
    ...views.map((view) => ({ id: `view:${view.id}`, label: view.name }))].map((scope) => ({ ...scope, group: teamName }));
  const byStatus = [...projects].sort((a, b) => statusRank(a) - statusRank(b));
  const projectScopes = byStatus.map((project) => ({
    id: `project:${project.id}`, label: project.name, group: `${teamName} Projects`, subgroup: project.status?.name, url: project.url,
    milestones: [...project.projectMilestones.nodes].sort((a, b) => a.sortOrder - b.sortOrder)
      .map((milestone) => ({ id: `project:${project.id}:${milestone.id}`, label: milestone.name })),
  }));
  return [mine, ...teamScopes, ...projectScopes];
}

// The scope with this ID, a milestone's under its project: { scope, project, milestone }, or null.
export function findScope(scopes, scopeId) {
  for (const scope of scopes) {
    if (scope.id === scopeId) return { scope, project: scope.milestones ? scope : null, milestone: null };
    const milestone = scope.milestones?.find((each) => each.id === scopeId);
    if (milestone) return { scope: milestone, project: scope, milestone };
  }
  return null;
}

async function request(apiKey, query, variables) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });
  if (response.status === 401) throw new Error("Invalid Linear API key");
  const json = /** @type {any} */ (JSON.parse(await response.text()));
  const error = json?.errors?.[0];
  if (error) throw new Error(error.extensions?.userPresentableMessage ?? error.message);
  if (!response.ok) throw new Error(`Linear answered ${response.status}`);
  return json.data;
}

// The branch work on the issue continues on: its open pull request's in this repository, where the work
// may sit on a branch other than the one Linear suggests, else Linear's.
function workBranch(node, pullRequests, repoName) {
  const open = pullRequests.find((pullRequest) => pullRequest.repo === repoName && pullRequest.branch
    && !["merged", "closed"].includes(pullRequest.status));
  return open?.branch ?? (node.branchName || null);
}

function toIssue(node, repoName) {
  const pullRequests = pullRequestsOf(node.attachments);
  return {
    id: node.identifier,
    linearId: node.id,
    teamId: node.team.id,
    title: node.title,
    status: statusOf(node.state),
    priority: node.priority ?? 0,
    order: node.sortOrder ?? null,
    labels: node.labels.nodes.map((label) => label.name),
    labelColors: Object.fromEntries(node.labels.nodes.map((label) => [label.name, label.color])),
    // Linear keeps finished blockers as relations; only the unfinished ones still block.
    blockedBy: node.inverseRelations.nodes
      .filter((relation) => relation.type === "blocks" && !isFinished(relation.issue.state))
      .map((relation) => relation.issue.identifier),
    branch: workBranch(node, pullRequests, repoName),
    assignee: node.assignee?.name ?? "Unassigned",
    assigneeAvatar: node.assignee?.avatarUrl ?? null,
    sla: node.slaBreachesAt ? { breachesAt: node.slaBreachesAt, mediumRiskAt: node.slaMediumRiskAt, highRiskAt: node.slaHighRiskAt } : null,
    created: node.createdAt,
    completed: node.completedAt ?? null,
    body: node.description === undefined ? null : (node.description ?? "").trim(),
    pullRequests,
    updated: node.updatedAt,
    url: node.url,
    delegateId: node.delegate?.id ?? null,
  };
}

// { agentId, labelId } once read, shared by every tracker since neither changes.
let cloudAgent = null;
async function cloudAgentIds(linear) {
  if (cloudAgent) return cloudAgent;
  const { users, issueLabels } = await linear(CLOUD_AGENT);
  const agentId = users.nodes[0]?.id, labelId = issueLabels.nodes[0]?.id;
  if (agentId && labelId) cloudAgent = { agentId, labelId };
  return cloudAgent;
}

// view ID → { filter, at }, and team key → { team, at }. Outlive each tracker, since the panel
// makes a new one every refresh.
const viewFilters = new Map();
const teams = new Map();

// The team's name and its projects that aren't completed or canceled, with their milestones: { name,
// projects }. A failure names the team by its key and lists no projects, so the panel's other scopes
// still work.
async function teamOf(teamKey, linear) {
  const cached = teams.get(teamKey);
  if (cached && Date.now() - cached.at < TEAM_TTL_MS) return cached.team;
  try {
    const answer = (await linear(TEAM_PROJECTS, { team: teamKey })).team;
    const team = { name: answer?.name ?? teamKey, projects: answer?.projects.nodes ?? [] };
    teams.set(teamKey, { team, at: Date.now() });
    return team;
  } catch {
    return cached?.team ?? { name: teamKey, projects: [] };
  }
}

export async function linearTracker({ root: projectRoot, on }) {
  if (on != null) return null;
  const config = await loadConfig(), root = await mainCheckout(projectRoot, on);
  const configured = config?.repos.find((each) => each.path === root);
  const repoName = await planningCenterRepoName(root);
  if (!configured && !repoName) return null;
  if (!config?.apiKey) throw new Error("No apiKey in ~/.config/herdr-app/linear.json");
  const linear = (query, variables = {}) => request(config.apiKey, query, variables);
  const teamKey = configured?.teamKey ?? (await detectedTeam(root, repoName, linear));
  if (!teamKey) return null;
  const repo = configured ?? { teamKey, path: root, views: [] };
  const scopes = scopesFor(repo, await teamOf(repo.teamKey, linear));
  const agent = repoName ? await cloudAgentIds(linear) : null;

  // Every page of the connection `connectionOf` picks out of each answer.
  async function allPages(query, variables, connectionOf) {
    const nodes = [];
    let after = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const connection = connectionOf(await linear(query, { ...variables, first: PAGE_SIZE, after }));
      nodes.push(...connection.nodes);
      if (!connection.pageInfo.hasNextPage) break;
      after = connection.pageInfo.endCursor;
    }
    return nodes;
  }

  // Each finished state, completed and merged, adds its own most recent issues.
  async function openAndRecentlyFinished(query, variables, connectionOf) {
    const recentlyFinished = (state) =>
      linear(query, { ...variables, state, first: RECENTLY_FINISHED }).then((data) => connectionOf(data).nodes);
    const [open, ...finished] = await Promise.all([
      allPages(query, { ...variables, state: OPEN_STATE }, connectionOf),
      ...FINISHED_STATES.map(recentlyFinished),
    ]);
    return [...open, ...finished.flat()];
  }

  // A view's saved filter decides which issues it holds, finished ones included. Running the filter
  // ourselves, rather than asking for the view's issues, keeps a view filed under one team from
  // limiting another team's issues to that team.
  async function viewFilter(viewId) {
    const cached = viewFilters.get(viewId);
    if (cached && Date.now() - cached.at < VIEW_FILTER_TTL_MS) return cached.filter;
    const { customView } = await linear(VIEW_FILTER, { view: viewId });
    if (!customView) throw new Error(`Linear has no view ${viewId}`);
    viewFilters.set(viewId, { filter: customView.filterData, at: Date.now() });
    return customView.filterData;
  }

  async function viewIssues(viewId) {
    return allPages(FILTERED_ISSUES, { filter: await viewFilter(viewId) }, (data) => data.issues);
  }

  function issuesIn(scopeId) {
    const [kind, projectId, milestoneId] = scopeId.split(":");
    if (kind === "project") {
      const filter = milestoneId ? { projectMilestone: { id: { eq: milestoneId } } } : { project: { id: { eq: projectId } } };
      return openAndRecentlyFinished(FILTERED_ISSUES_IN_STATE, { filter }, (data) => data.issues);
    }
    if (scopeId === "triage") return allPages(TEAM_ISSUES, { team: repo.teamKey, state: TRIAGE_STATE }, (data) => data.issues);
    if (scopeId === "team") return openAndRecentlyFinished(TEAM_ISSUES, { team: repo.teamKey }, (data) => data.issues);
    if (scopeId.startsWith("view:")) return viewIssues(scopeId.slice(5));
    return openAndRecentlyFinished(MY_ISSUES, {}, (data) => data.viewer.assignedIssues);
  }

  const teamStates = new Map();
  function statesOf(teamId) {
    if (!teamStates.has(teamId)) teamStates.set(teamId, linear(TEAM_STATES, { id: teamId }).then((data) => data.team.states.nodes));
    return teamStates.get(teamId);
  }

  // The team's state named like the status (In Progress rather than In Review), else its first of that
  // type that maps back to the same status.
  async function stateFor(issue, status) {
    const candidates = (await statesOf(issue.teamId))
      .filter((state) => STATUS_TYPES[status]?.includes(state.type) && statusOf(state) === status)
      .sort((a, b) => a.position - b.position);
    const state = candidates.find((each) => each.name.toLowerCase() === STATUS_LABELS[status]?.toLowerCase()) ?? candidates[0];
    if (!state) throw new Error(`${issue.id}'s team has no ${STATUS_LABELS[status] ?? status} state`);
    return state.id;
  }

  async function get(id) {
    const { issue } = await linear(ISSUE, { id }).catch(() => ({ issue: null }));
    return issue ? toIssue(issue, repoName) : null;
  }

  const tracker = {
    kind: "linear",
    name: "Linear",
    team: repo.teamKey,
    writable: true,
    statuses: STATUSES,
    scopes,
    // An unknown scope, such as a view since removed from the config, lists the default.
    async list(scopeId) {
      const scope = findScope(scopes, scopeId)?.scope ?? scopes[0];
      return (await issuesIn(scope.id)).map((node) => toIssue(node, repoName));
    },
    get,
    // A new body only saves over the description `issue` was read with, so edits made in Linear
    // meanwhile are never overwritten.
    async update(issue, fields) {
      const { status, priority, order, body } = fields, input = {};
      if (status !== undefined) input.stateId = await stateFor(issue, status);
      if (priority !== undefined) input.priority = priority;
      if (order !== undefined) input.sortOrder = order;
      if (body !== undefined) {
        const current = await get(issue.id);
        if (!current) throw new Error(`${issue.id} no longer exists`);
        if (current.body !== issue.body) throw new Error(`${issue.id} changed in Linear while you were editing it`);
        input.description = body;
      }
      await linear(UPDATE, { id: issue.linearId, input });
    },
    // Claims an unassigned issue in the same save. The assignee is read fresh from Linear, since a list
    // shown from the cache may be out of date and someone else may have claimed it since.
    async start(issue) {
      const input = { stateId: await stateFor(issue, "in-progress") };
      const { viewer, issue: current } = await linear(ASSIGNEE_AND_VIEWER, { id: issue.linearId });
      if (!current) throw new Error(`${issue.id} no longer exists`);
      if (!current.assignee) input.assigneeId = viewer.id;
      await linear(UPDATE, { id: issue.linearId, input });
    },
    isDelegated: agent && ((issue) => issue.delegateId === agent.agentId),
    delegate: agent && (async (issue) => {
      await linear(UPDATE, { id: issue.linearId, input: { delegateId: agent.agentId, addedLabelIds: [agent.labelId] } });
      issue.delegateId = agent.agentId;
    }),
    async finish(issue) {
      await tracker.update(issue, { status: "done" });
    },
    // Every Linear save is already final.
    async commitChecklists() {},
    changed: null,
  };
  return tracker;
}
