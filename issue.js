export const STATUSES = ["backlog", "todo", "in-progress", "done", "canceled"];
export const STATUS_LABELS = { backlog: "Backlog", todo: "Todo", "in-progress": "In progress", done: "Done", canceled: "Canceled" };
export const PRIORITIES = ["None", "Urgent", "High", "Medium", "Low"];

// Work starts only on issues nobody has picked up yet, and waits while any of their blockers is unfinished.
const STARTABLE_STATUSES = ["backlog", "todo"];
const isStartable = (issue) => STARTABLE_STATUSES.includes(issue.status);
const isUnblocked = (issue, done) => issue.blockedBy.every((id) => done.has(id));

const GROUPS = [
  { id: "in-progress", label: "In progress", has: (issue) => issue.status === "in-progress" },
  { id: "todo", label: "Todo", has: (issue, done) => issue.status === "todo" && isUnblocked(issue, done) },
  { id: "blocked", label: "Blocked", has: (issue, done) => isStartable(issue) && !isUnblocked(issue, done) },
  { id: "backlog", label: "Backlog", has: (issue, done) => issue.status === "backlog" && isUnblocked(issue, done) },
  { id: "unknown", label: "Unknown status", has: (issue) => !STATUSES.includes(issue.status) },
  { id: "done", label: "Done", collapsed: true, has: (issue) => issue.status === "done" },
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

export function groupIssues(issues) {
  const done = new Set(issues.filter((issue) => issue.status === "done").map((issue) => issue.id));
  return GROUPS.map((group) => ({ ...group, issues: issues.filter((issue) => group.has(issue, done)).sort(byPosition) }))
    .filter((group) => group.issues.length);
}

export function unfinishedBlockers(issue, issues) {
  const done = new Set(issues.filter((other) => other.status === "done").map((other) => other.id));
  return issue.blockedBy.filter((id) => !done.has(id));
}

export const canFinishWork = (issue) => issue.status === "in-progress";

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

// Moves one issue of a shown group to another's place and numbers the group from 1.
// Returns only the issues whose order changes.
export function reorder(groupIssues, movingId, targetId) {
  const ordered = [...groupIssues];
  const from = ordered.findIndex((issue) => issue.id === movingId), to = ordered.findIndex((issue) => issue.id === targetId);
  if (from < 0 || to < 0 || from === to) return [];
  ordered.splice(to, 0, ...ordered.splice(from, 1));
  return ordered.map((issue, index) => ({ issue, order: index + 1 })).filter(({ issue, order }) => issue.order !== order);
}
