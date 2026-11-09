// Issues in Linear, for repositories named in ~/.config/herdr-app/linear.json:
// { "apiKey": "lin_api_…", "repos": { "<team key>": "~/Code/repo" } }, or, with saved Linear views,
// { "<team key>": { "path": "~/Code/repo", "views": { "<name>": "https://linear.app/…/view/…" } } }.
// A repository lists one scope of issues at a time: its first view, else every open issue assigned to
// you, across teams. Scopes other than a view add the issues completed most recently.
import { home, appHome, readTextFile } from "herdr";
import { mainCheckout } from "../location.js";
import { STATUS_LABELS } from "../issue.js";

const API_URL = "https://api.linear.app/graphql";
// Linear refuses a query costing over 10,000, roughly each page's size times its nested lists.
const PAGE_SIZE = 50;
const MAX_PAGES = 20;
const RECENTLY_COMPLETED = 10;

const ISSUE_FIELDS = `id identifier title description priority sortOrder branchName createdAt url
  state { type name } team { id }
  labels(first: 10) { nodes { name color } }
  inverseRelations(first: 20) { nodes { type issue { identifier state { type } } } }`;

const PAGE = `pageInfo { hasNextPage endCursor } nodes { ${ISSUE_FIELDS} }`;
const OPEN = `state: { type: { nin: ["completed", "canceled"] } }`;
const COMPLETED = `state: { type: { eq: "completed" } }`;

const MY_OPEN_ISSUES = `query($first: Int!, $after: String) { viewer {
  assignedIssues(first: $first, after: $after, filter: { ${OPEN} }) { ${PAGE} } } }`;
const MY_COMPLETED_ISSUES = `query($first: Int!) { viewer {
  assignedIssues(first: $first, orderBy: updatedAt, filter: { ${COMPLETED} }) { ${PAGE} } } }`;
const TEAM_OPEN_ISSUES = `query($team: String!, $first: Int!, $after: String) {
  issues(first: $first, after: $after, filter: { team: { key: { eq: $team } }, ${OPEN} }) { ${PAGE} } }`;
const TEAM_COMPLETED_ISSUES = `query($team: String!, $first: Int!) {
  issues(first: $first, orderBy: updatedAt, filter: { team: { key: { eq: $team } }, ${COMPLETED} }) { ${PAGE} } }`;
const VIEW_FILTER = `query($view: String!) { customView(id: $view) { filterData } }`;
const FILTERED_ISSUES = `query($filter: IssueFilter, $first: Int!, $after: String) {
  issues(first: $first, after: $after, filter: $filter) { ${PAGE} } }`;

const ISSUE = `query($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`;
const TEAM_STATES = `query($id: String!) { team(id: $id) { states { nodes { id name type position } } } }`;
const UPDATE = `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`;

// Linear's workflow state types, as the panel's statuses.
const STATUS_TYPES = { backlog: ["triage", "backlog"], todo: ["unstarted"], "in-progress": ["started"], done: ["completed"], canceled: ["canceled"] };
const statusOf = (stateType) => Object.keys(STATUS_TYPES).find((status) => STATUS_TYPES[status].includes(stateType)) ?? stateType;
const FINISHED_TYPES = ["completed", "canceled"];

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

// The issue lists a repository can show: { id, label }, its default first.
function scopesFor({ views }) {
  const viewScopes = views.map((view) => ({ id: `view:${view.id}`, label: view.name }));
  return [...viewScopes, { id: "mine", label: "My issues" }, { id: "team", label: "Team issues" }];
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

function toIssue(node) {
  return {
    id: node.identifier,
    linearId: node.id,
    teamId: node.team.id,
    title: node.title,
    status: statusOf(node.state.type),
    priority: node.priority ?? 0,
    order: node.sortOrder ?? null,
    labels: node.labels.nodes.map((label) => label.name),
    labelColors: Object.fromEntries(node.labels.nodes.map((label) => [label.name, label.color])),
    // Linear keeps finished blockers as relations; only the unfinished ones still block.
    blockedBy: node.inverseRelations.nodes
      .filter((relation) => relation.type === "blocks" && !FINISHED_TYPES.includes(relation.issue.state.type))
      .map((relation) => relation.issue.identifier),
    branch: node.branchName || null,
    created: node.createdAt,
    body: (node.description ?? "").trim(),
    url: node.url,
  };
}

export async function linearTracker({ root: projectRoot, on }) {
  if (on != null) return null;
  const config = await loadConfig(), root = await mainCheckout(projectRoot, on);
  const repo = config?.repos.find((each) => each.path === root);
  if (!repo) return null;
  if (!config.apiKey) throw new Error("No apiKey in ~/.config/herdr-app/linear.json");
  const linear = (query, variables = {}) => request(config.apiKey, query, variables);
  const scopes = scopesFor(repo);

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

  async function openAndRecentlyCompleted(openQuery, completedQuery, variables, connectionOf) {
    const [open, completed] = await Promise.all([
      allPages(openQuery, variables, connectionOf),
      linear(completedQuery, { ...variables, first: RECENTLY_COMPLETED }).then((data) => connectionOf(data).nodes),
    ]);
    return [...open, ...completed];
  }

  // A view's saved filter decides which issues it holds, finished ones included. Running the filter
  // ourselves, rather than asking for the view's issues, keeps a view filed under one team from
  // limiting another team's issues to that team.
  async function viewIssues(viewId) {
    const { customView } = await linear(VIEW_FILTER, { view: viewId });
    if (!customView) throw new Error(`Linear has no view ${viewId}`);
    return allPages(FILTERED_ISSUES, { filter: customView.filterData }, (data) => data.issues);
  }

  function issuesIn(scopeId) {
    if (scopeId === "team") return openAndRecentlyCompleted(TEAM_OPEN_ISSUES, TEAM_COMPLETED_ISSUES, { team: repo.teamKey }, (data) => data.issues);
    if (scopeId.startsWith("view:")) return viewIssues(scopeId.slice(5));
    return openAndRecentlyCompleted(MY_OPEN_ISSUES, MY_COMPLETED_ISSUES, {}, (data) => data.viewer.assignedIssues);
  }

  const teamStates = new Map();
  function statesOf(teamId) {
    if (!teamStates.has(teamId)) teamStates.set(teamId, linear(TEAM_STATES, { id: teamId }).then((data) => data.team.states.nodes));
    return teamStates.get(teamId);
  }

  // The team's state named like the status (In Progress rather than In Review), else its first of that type.
  async function stateFor(issue, status) {
    const candidates = (await statesOf(issue.teamId))
      .filter((state) => STATUS_TYPES[status]?.includes(state.type))
      .sort((a, b) => a.position - b.position);
    const state = candidates.find((each) => each.name.toLowerCase() === STATUS_LABELS[status]?.toLowerCase()) ?? candidates[0];
    if (!state) throw new Error(`${issue.id}'s team has no ${STATUS_LABELS[status] ?? status} state`);
    return state.id;
  }

  async function get(id) {
    const { issue } = await linear(ISSUE, { id }).catch(() => ({ issue: null }));
    return issue ? toIssue(issue) : null;
  }

  const tracker = {
    kind: "linear",
    name: "Linear",
    writable: true,
    scopes,
    // An unknown scope, such as a view since removed from the config, lists the default.
    async list(scopeId) {
      const scope = scopes.find((each) => each.id === scopeId) ?? scopes[0];
      return (await issuesIn(scope.id)).map(toIssue);
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
    async start(issue) {
      await tracker.update(issue, { status: "in-progress" });
    },
    async finish(issue) {
      await tracker.update(issue, { status: "done" });
    },
    // Every Linear save is already final.
    async commitChecklists() {},
    changed: null,
  };
  return tracker;
}
