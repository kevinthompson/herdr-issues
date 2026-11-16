// Issues in Linear, for repositories whose entry in issues.json names a team (setting.js). The API key is the
// one secret, kept in the macOS Keychain, where
// a dotfiles repository tracking the app's folder can't commit it.
// A repository lists one scope of issues at a time, every open issue assigned to you, across teams, by
// default. The team's issues waiting in triage, its other issues and its saved views are scopes, and its
// open projects are scopes too, each narrowed further to one of its milestones. Scopes other than a view and triage add the issues
// completed or merged most recently.
import { appHome, exec, readTextFile, writeTextFile } from "herdr";
import { mainCheckout } from "../location.js";
import { cachedLookup, forgetLookups } from "../lookups.js";
import { STATUSES, STATUS_LABELS, priorityRank } from "../issue.js";
import { refuseUnknownLabels } from "./labels.js";
import { KEYCHAIN, linearKeyMissing, linearKeyUnreadable, linearKeyUnsaved, linearKeyInvalid, LINEAR_KEY_PROBLEM } from "./problems.js";

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
const ISSUE_FIELDS = `id identifier title priority sortOrder branchName createdAt updatedAt completedAt dueDate url
  slaBreachesAt slaMediumRiskAt slaHighRiskAt assignee { id name avatarUrl } delegate { id name avatarUrl }
  state { type name } team { id }
  labels(first: 10) { nodes { name color parent { name } } }
  inverseRelations(first: 20) { nodes { type issue { identifier state { type name } } } }
  attachments(first: 10) { nodes { url title sourceType metadata } }`;

const PAGE = `pageInfo { hasNextPage endCursor } nodes { ${ISSUE_FIELDS} }`;
// Started states named Merged count as done, so they are listed with the finished issues instead.
const MERGED_STATE = { type: { eq: "started" }, name: { containsIgnoreCase: "merged" } };
const TRIAGE_STATE = { type: { eq: "triage" } };
// Open states, leaving out the state types named too, such as backlog until its group is expanded.
const openState = (...without) =>
  ({ type: { nin: ["completed", "canceled", "duplicate", ...without] }, name: { notContainsIgnoreCase: "merged" } });
const FINISHED_STATES = [{ type: { eq: "completed" } }, MERGED_STATE];
const CANCELED_STATE = { type: { in: ["canceled", "duplicate"] } };

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
    id name url priority status { name type } projectMilestones(first: 50) { nodes { id name sortOrder } } } } } }`;

const ISSUE = `query($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} description } }`;
const TEAM_STATES = `query($id: String!) { team(id: $id) { states { nodes { id name type position } } } }`;
const ASSIGNEE_AND_VIEWER = `query($id: String!) { viewer { id } issue(id: $id) { assignee { id } } }`;
const VIEWER = "query { viewer { id } }";
const UPDATE = `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`;
// A team's labels include the workspace's and those it inherits from a parent team.
const TEAM_LABELS = `query($team: String!, $first: Int!, $after: String) { team(id: $team) {
  labels(first: $first, after: $after) { pageInfo { hasNextPage endCursor } nodes { id name isGroup parent { name } } } } }`;
const ADD_LABEL = `mutation($id: String!, $labelId: String!) { issueAddLabel(id: $id, labelId: $labelId) { success } }`;
const REMOVE_LABEL = `mutation($id: String!, $labelId: String!) { issueRemoveLabel(id: $id, labelId: $labelId) { success } }`;

// A label in a label group is named after its group too, since names repeat across groups: "cloud-agent > one-shot".
const labelName = (label) => (label.parent ? `${label.parent.name} > ${label.name}` : label.name);

// Linear's workflow state types, as the panel's statuses. Started states split in three: one named for
// review is In review, one named Merged is Done, and the rest are In progress.
const STATUS_TYPES = { triage: ["triage"], backlog: ["backlog"], todo: ["unstarted"], "in-progress": ["started"], "in-review": ["started"], done: ["completed"], canceled: ["canceled", "duplicate"] };
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

// A view's URL ends in its name and its ID, which the API takes in place of the view's UUID:
// …/view/checkout-bugs-a8875271fcf5 is a8875271fcf5.
const viewId = (url) => url.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop().split("-").pop();

function repoConfig(root, { team, views = {} }) {
  return { teamKey: team, path: root, views: Object.entries(views).map(([name, url]) => ({ name, id: viewId(url) })) };
}

// The key file: where the key lived before the Keychain, and where it lives on a system without `security`.
export const linearKeyPath = () => `${appHome()}/linear.json`;
const KEY_FILE_NAME = "~/.config/herdr-app/linear.json";

const KEYCHAIN_ITEM = ["-s", "herdr-issues", "-a", "linear"];
const KEYCHAIN_ITEM_NOT_FOUND = 44;

// Runs macOS's `security` with `args`, resolving with its result, or null where it isn't installed.
async function security(args) {
  const result = await exec("security", args).catch(() => null);
  return !result || result.code === 127 ? null : result;
}

// Saves the key in the Keychain, resolving false where there's no Keychain. Herdr's exec can't pass standard
// input, so the key is briefly in the command's arguments, visible only to processes running as the person.
async function saveInKeychain(apiKey) {
  const saved = await security(["add-generic-password", "-U", ...KEYCHAIN_ITEM, "-w", apiKey]);
  if (!saved) return false;
  if (saved.code !== 0) throw linearKeyUnsaved(saved.stderr.trim());
  return true;
}

// The key in the Keychain, null when it holds none, or undefined where there's no Keychain.
async function keychainKey() {
  const found = await security(["find-generic-password", ...KEYCHAIN_ITEM, "-w"]);
  if (!found) return undefined;
  if (found.code === KEYCHAIN_ITEM_NOT_FOUND) return null;
  if (found.code !== 0) throw linearKeyUnreadable(found.stderr.trim());
  return found.stdout.trim() || null;
}

// The key file's text and fields, which are none when it's missing or isn't a JSON object.
async function readKeyFile() {
  const text = await readTextFile(linearKeyPath()).catch(() => null);
  try {
    const fields = JSON.parse(text ?? "{}");
    return { text, fields: fields && typeof fields === "object" && !Array.isArray(fields) ? fields : {}, valid: true };
  } catch { return { text, fields: {}, valid: false }; }
}

// Takes the key out of the key file, deleting the file when the key is all it holds.
async function removeKeyFromFile({ text, fields: { apiKey, ...otherFields } }) {
  if (apiKey === undefined) return;
  if (!Object.keys(otherFields).length) await exec("rm", ["-f", linearKeyPath()]);
  else await writeTextFile(linearKeyPath(), `${JSON.stringify(otherFields, null, 2)}\n`, text);
}

// Writes the key to the key file, keeping its other fields, readable only by the person.
async function saveInKeyFile(apiKey, { text, fields }) {
  const path = linearKeyPath();
  await exec("mkdir", ["-p", appHome()]);
  await writeTextFile(path, `${JSON.stringify({ ...fields, apiKey }, null, 2)}\n`, text);
  const restricted = await exec("chmod", ["600", path]);
  if (restricted.code !== 0) throw new Error(`Could not make ${path} readable only by you: ${restricted.stderr.trim()}`);
}

// The key from the Keychain, after moving a key the key file still holds there, or from the key file where
// there's no Keychain: { apiKey, store }, where store names where it's kept.
const cachedApiKey = cachedLookup();
const readApiKey = () => cachedApiKey("apiKey", async () => {
  const keyFile = await readKeyFile();
  const { apiKey: fileKey } = keyFile.fields;
  if (fileKey && await saveInKeychain(fileKey)) await removeKeyFromFile(keyFile);
  const apiKey = await keychainKey();
  if (apiKey !== undefined) return { apiKey, store: KEYCHAIN };
  if (!keyFile.valid) throw linearKeyUnreadable("it isn't valid JSON", KEY_FILE_NAME);
  return { apiKey: fileKey ?? null, store: KEY_FILE_NAME };
});

// A function that asks Linear's API a query with the person's API key: (query, variables) → its data.
export async function linearClient() {
  const { apiKey, store } = await readApiKey();
  if (!apiKey) throw linearKeyMissing(store);
  return (query, variables = {}) => request(apiKey, query, variables, store);
}

// Saves the API key in the Keychain once Linear accepts it, taking any key out of the key file so it can't
// replace this one, or in the key file where there's no Keychain. A key Linear refuses rejects and saves nothing.
export async function saveLinearKey(apiKey) {
  try { await request(apiKey, VIEWER, {}); }
  catch (e) { throw e.code === LINEAR_KEY_PROBLEM ? new Error("Linear refused this API key, so it wasn't saved.") : e; }
  const keyFile = await readKeyFile();
  if (await saveInKeychain(apiKey)) await removeKeyFromFile(keyFile);
  else await saveInKeyFile(apiKey, keyFile);
  forgetLookups();
}

// Projects in the scope menu, by status: in progress, then planned, paused and backlog. Within a status, by
// priority (urgent first, "None" last).
const PROJECT_STATUS_ORDER = ["started", "planned", "paused", "backlog"];
const statusRank = (project) => {
  const rank = PROJECT_STATUS_ORDER.indexOf(project.status?.type);
  return rank === -1 ? PROJECT_STATUS_ORDER.length : rank;
};

// The list's sections a scope always shows: Triage only where the scope lists triage issues.
const SECTIONS = ["in-review", "in-progress", "todo", "blocked", "backlog", "done", "canceled"];
const LISTS_TRIAGE = ["team", "triage"];
export const linearSections = (scopeId) => (LISTS_TRIAGE.includes(scopeId) ? ["triage", ...SECTIONS] : SECTIONS);

// The issue lists a repository can show: { id, label, team?, group?, subgroup?, milestones? }, its default
// first. My issues stands alone, then the team's lists and saved views under the team's name, then its
// projects, grouped under their status. A project scope lists its milestones as scopes of their own: { id, label }.
export function scopesFor({ views }, { name: teamName, projects }) {
  const mine = { id: "mine", label: "My issues" };
  const teamScopes = [{ id: "triage", label: "Triage" }, { id: "team", label: "Issues" },
    ...views.map((view) => ({ id: `view:${view.id}`, label: view.name }))].map((scope) => ({ ...scope, team: teamName, group: teamName }));
  const byStatusAndPriority = [...projects].sort((a, b) => statusRank(a) - statusRank(b) || priorityRank(a) - priorityRank(b));
  const projectScopes = byStatusAndPriority.map((project) => ({
    id: `project:${project.id}`, label: project.name, team: teamName, group: `${teamName} Projects`, subgroup: project.status?.name, url: project.url,
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

async function request(apiKey, query, variables, store = KEYCHAIN) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });
  if (response.status === 401) throw linearKeyInvalid(store);
  const json = /** @type {any} */ (JSON.parse(await response.text()));
  const error = json?.errors?.[0];
  if (error?.extensions?.code === "AUTHENTICATION_ERROR") throw linearKeyInvalid(store);
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

const cachedOriginRepoName = cachedLookup();

// The name of the GitHub repository origin points to, without its owner, as Linear's pull request
// attachments name it; null when origin isn't on GitHub.
function originRepoName(root) {
  return cachedOriginRepoName(root, async () => {
    const origin = await exec("git", ["remote", "get-url", "origin"], { cwd: root }).catch(() => null);
    if (origin?.code !== 0) return null;
    return /github\.com[:/][^/\s]+\/([^/\s]+?)(?:\.git)?\s*$/.exec(origin.stdout)?.[1] ?? null;
  });
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
    labels: node.labels.nodes.map(labelName),
    labelColors: Object.fromEntries(node.labels.nodes.map((label) => [labelName(label), label.color])),
    // Linear keeps finished blockers as relations; only the unfinished ones still block.
    blockedBy: node.inverseRelations.nodes
      .filter((relation) => relation.type === "blocks" && !isFinished(relation.issue.state))
      .map((relation) => relation.issue.identifier),
    branch: workBranch(node, pullRequests, repoName),
    assigneeId: node.assignee?.id ?? null,
    assignee: node.assignee?.name ?? "Unassigned",
    assigneeAvatar: node.assignee?.avatarUrl ?? null,
    due: node.dueDate ?? null,
    sla: node.slaBreachesAt ? { breachesAt: node.slaBreachesAt, mediumRiskAt: node.slaMediumRiskAt, highRiskAt: node.slaHighRiskAt } : null,
    created: node.createdAt,
    completed: node.completedAt ?? null,
    body: node.description === undefined ? null : (node.description ?? "").trim(),
    pullRequests,
    updated: node.updatedAt,
    url: node.url,
    delegateId: node.delegate?.id ?? null,
    delegate: node.delegate?.name ?? null,
    delegateAvatar: node.delegate?.avatarUrl ?? null,
  };
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

export async function linearTracker({ root: projectRoot, on }, setting = null) {
  if (on != null) return null;
  const root = await mainCheckout(projectRoot, on);
  const repo = setting && repoConfig(root, setting);
  if (!repo) return null;
  const linear = await linearClient();
  const scopes = scopesFor(repo, await teamOf(repo.teamKey, linear));
  const repoName = await originRepoName(root);

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

  // The open issues in `open`, and once Done is expanded, each finished state's most recent issues,
  // completed and merged.
  async function openAndRecentlyFinished(query, variables, connectionOf, open, loads) {
    const recentlyFinished = (state) =>
      linear(query, { ...variables, state, first: RECENTLY_FINISHED }).then((data) => connectionOf(data).nodes);
    const lists = await Promise.all([
      allPages(query, { ...variables, state: open }, connectionOf),
      ...(loads.has("done") ? FINISHED_STATES.map(recentlyFinished) : []),
    ]);
    return lists.flat();
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

  // Every issue the view holds in the states listed: open ones, and finished ones whose group is expanded.
  async function viewIssues(viewId, open, loads) {
    const filter = await viewFilter(viewId);
    const states = [open, ...(loads.has("done") ? FINISHED_STATES : []), ...(loads.has("canceled") ? [CANCELED_STATE] : [])];
    const lists = await Promise.all(states.map((state) => allPages(FILTERED_ISSUES_IN_STATE, { filter, state }, (data) => data.issues)));
    return lists.flat();
  }

  // The groups a scope lists only once they are expanded: none for triage, which lists one state.
  function deferredGroups(scopeId) {
    if (scopeId === "triage") return [];
    return scopeId.startsWith("view:") ? ["backlog", "done", "canceled"] : ["backlog", "done"];
  }

  function issuesIn(scopeId, loads) {
    const open = openState(...(scopeId === "team" ? ["triage"] : []), ...(loads.has("backlog") ? [] : ["backlog"]));
    const [kind, projectId, milestoneId] = scopeId.split(":");
    if (kind === "project") {
      const filter = milestoneId ? { projectMilestone: { id: { eq: milestoneId } } } : { project: { id: { eq: projectId } } };
      return openAndRecentlyFinished(FILTERED_ISSUES_IN_STATE, { filter }, (data) => data.issues, open, loads);
    }
    if (scopeId === "triage") return allPages(TEAM_ISSUES, { team: repo.teamKey, state: TRIAGE_STATE }, (data) => data.issues);
    // The team's Issues list leaves out triage, which has a list of its own.
    if (scopeId === "team") return openAndRecentlyFinished(TEAM_ISSUES, { team: repo.teamKey }, (data) => data.issues, open, loads);
    if (scopeId.startsWith("view:")) return viewIssues(scopeId.slice(5), open, loads);
    return openAndRecentlyFinished(MY_ISSUES, {}, (data) => data.viewer.assignedIssues, open, loads);
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

  // The labels an issue in the team, by its key or ID, can take: { id, name }. Label groups can't be applied.
  const labelsByTeam = new Map();
  function labelsOf(team) {
    if (!labelsByTeam.has(team)) {
      const labels = allPages(TEAM_LABELS, { team }, (data) => data.team.labels)
        .then((nodes) => nodes.filter((label) => !label.isGroup).map((label) => ({ id: label.id, name: labelName(label) })));
      labels.catch(() => labelsByTeam.delete(team));
      labelsByTeam.set(team, labels);
    }
    return labelsByTeam.get(team);
  }

  // Adds and removes labels one at a time, which leaves the issue's other labels alone, once every name is known.
  async function changeLabels(issue, addLabels, removeLabels) {
    const labels = await labelsOf(issue.teamId);
    refuseUnknownLabels([...addLabels, ...removeLabels], labels.map((label) => label.name), `${issue.id}'s team`);
    const labelId = (name) => labels.find((label) => label.name === name).id;
    for (const name of addLabels) await linear(ADD_LABEL, { id: issue.linearId, labelId: labelId(name) });
    for (const name of removeLabels) await linear(REMOVE_LABEL, { id: issue.linearId, labelId: labelId(name) });
  }

  const tracker = {
    kind: "linear",
    name: "Linear",
    team: repo.teamKey,
    writable: true,
    statuses: STATUSES,
    scopes,
    // An unknown scope, such as a view since removed from the config, lists the default.
    // `loads` names the deferred groups to list too, those expanded in the panel.
    async list(scopeId, loads = new Set()) {
      const scope = findScope(scopes, scopeId)?.scope ?? scopes[0];
      return (await issuesIn(scope.id, loads)).map((node) => toIssue(node, repoName));
    },
    deferred: (scopeId) => deferredGroups((findScope(scopes, scopeId)?.scope ?? scopes[0]).id),
    sections: (scopeId) => linearSections((findScope(scopes, scopeId)?.scope ?? scopes[0]).id),
    get,
    async labels() {
      return (await labelsOf(repo.teamKey)).map((label) => label.name);
    },
    async viewerId() {
      return (await linear(VIEWER, {})).viewer.id;
    },
    // A new body only saves over the description `issue` was read with, so edits made in Linear
    // meanwhile are never overwritten.
    async update(issue, fields) {
      const { status, priority, order, body, addLabels = [], removeLabels = [] } = fields, input = {};
      if (addLabels.length || removeLabels.length) await changeLabels(issue, addLabels, removeLabels);
      if (status !== undefined) input.stateId = await stateFor(issue, status);
      if (priority !== undefined) input.priority = priority;
      if (order !== undefined) input.sortOrder = order;
      if (body !== undefined) {
        const current = await get(issue.id);
        if (!current) throw new Error(`${issue.id} no longer exists`);
        if (current.body !== issue.body) throw new Error(`${issue.id} changed in Linear while you were editing it`);
        input.description = body;
      }
      if (Object.keys(input).length) await linear(UPDATE, { id: issue.linearId, input });
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
  };
  return tracker;
}
