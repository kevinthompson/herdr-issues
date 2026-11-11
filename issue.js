export const STATUSES = ["backlog", "todo", "in-progress", "in-review", "done", "canceled"];
export const STATUS_LABELS = { backlog: "Backlog", todo: "Todo", "in-progress": "In progress", "in-review": "In review", done: "Done", canceled: "Canceled" };
export const PRIORITIES = ["None", "Urgent", "High", "Medium", "Low"];

// Work starts only on issues nobody has picked up yet, and waits while any of their blockers is unfinished.
const STARTABLE_STATUSES = ["backlog", "todo"];
const isStartable = (issue) => STARTABLE_STATUSES.includes(issue.status);
const isUnblocked = (issue, done) => issue.blockedBy.every((id) => done.has(id));

const GROUPS = [
  { id: "in-review", label: "In review", has: (issue) => issue.status === "in-review" },
  { id: "in-progress", label: "In progress", has: (issue) => issue.status === "in-progress" },
  { id: "todo", label: "Todo", has: (issue, done) => issue.status === "todo" && isUnblocked(issue, done) },
  { id: "blocked", label: "Blocked", has: (issue, done) => isStartable(issue) && !isUnblocked(issue, done) },
  { id: "backlog", label: "Backlog", has: (issue, done) => issue.status === "backlog" && isUnblocked(issue, done) },
  { id: "unknown", label: "Unknown status", has: (issue) => !STATUSES.includes(issue.status) },
  { id: "done", label: "Done", collapsed: true, ordered: false, sort: byRecentlyCompleted, has: (issue) => issue.status === "done" },
  { id: "canceled", label: "Canceled", collapsed: true, has: (issue) => issue.status === "canceled" },
];

// Issues with an order come first, by that number. The rest follow by priority (urgent first,
// "None" last), then by ID in number order.
const priorityRank = (issue) => issue.priority || PRIORITIES.length;
const byId = (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true });

function byPosition(a, b) {
  if (a.order !== null || b.order !== null) {
    if (a.order === null) return 1;
    if (b.order === null) return -1;
    if (a.order !== b.order) return a.order - b.order;
  }
  return priorityRank(a) - priorityRank(b) || byId(a, b);
}

// Most recently completed first. Issues done before completion was recorded follow, newest ID first.
function byRecentlyCompleted(a, b) {
  if (a.completed && b.completed) return b.completed.localeCompare(a.completed);
  if (a.completed || b.completed) return a.completed ? -1 : 1;
  return byId(b, a);
}

export function groupIssues(issues) {
  const done = new Set(issues.filter((issue) => issue.status === "done").map((issue) => issue.id));
  return GROUPS.map((group) => ({ ...group, issues: issues.filter((issue) => group.has(issue, done)).sort(group.sort ?? byPosition) }))
    .filter((group) => group.issues.length);
}

export function unfinishedBlockers(issue, issues) {
  const done = new Set(issues.filter((other) => other.status === "done").map((other) => other.id));
  return issue.blockedBy.filter((id) => !done.has(id));
}

// Work underway, being written or waiting on review, continues and finishes the same way.
const UNDERWAY_STATUSES = ["in-progress", "in-review"];
export const canFinishWork = (issue) => UNDERWAY_STATUSES.includes(issue.status);

export function canStartWork(issue, issues) {
  return isStartable(issue) && unfinishedBlockers(issue, issues).length === 0;
}

// The unfinished blockers that keep an issue in the Blocked group: none once work could have started.
export function holdingBlockers(issue, issues) {
  return isStartable(issue) ? unfinishedBlockers(issue, issues) : [];
}

// The IDs of the issues that name this one in their blocked_by, in number order.
export function blockedIssues(issue, issues) {
  return issues.filter((other) => other.blockedBy.includes(issue.id)).sort(byId).map((other) => other.id);
}

// The unfinished issues this one still holds up: none once it is done or canceled.
const FINISHED = ["done", "canceled"];
export function waitingIssues(issue, issues) {
  if (FINISHED.includes(issue.status)) return [];
  const open = new Set(issues.filter((other) => !FINISHED.includes(other.status)).map((other) => other.id));
  return blockedIssues(issue, issues).filter((id) => open.has(id));
}

// The attached pull requests that haven't merged, closed ones included.
export const unmergedPullRequests = (issue) =>
  (issue.pullRequests ?? []).filter((pullRequest) => pullRequest.status !== "merged");

// How long an unfinished issue has left on its SLA, as Linear shows it: { text, risk }, where risk is
// "low", "medium", "high" or "breached". null without an SLA or once the issue is finished.
const HOUR_MS = 3600000, DAY_MS = 24 * HOUR_MS;
const duration = (ms) => (ms >= DAY_MS ? `${Math.floor(ms / DAY_MS)}d` : ms >= HOUR_MS ? `${Math.floor(ms / HOUR_MS)}h` : `${Math.max(1, Math.floor(ms / 60000))}m`);

export function slaStatus(issue, now = Date.now()) {
  if (!issue.sla || FINISHED.includes(issue.status)) return null;
  const { breachesAt, mediumRiskAt, highRiskAt } = issue.sla, left = Date.parse(breachesAt) - now;
  if (left <= 0) return { text: `SLA −${duration(-left)}`, risk: "breached" };
  const risk = highRiskAt && now >= Date.parse(highRiskAt) ? "high" : mediumRiskAt && now >= Date.parse(mediumRiskAt) ? "medium" : "low";
  return { text: `SLA ${duration(left)}`, risk };
}

// Moves one issue of a shown group to another's place and numbers the group from 1.
// Returns only the issues whose order changes.
export function reorder(groupIssues, movingId, targetId) {
  const ordered = [...groupIssues];
  const from = ordered.findIndex((issue) => issue.id === movingId), to = ordered.findIndex((issue) => issue.id === targetId);
  if (from < 0 || to < 0 || from === to) return [];
  ordered.splice(to, 0, ...ordered.splice(from, 1));
  return ordered.map((issue, index) => ({ issue, order: index + 1 })).filter(({ issue, order }) => issue.order !== order);
}
