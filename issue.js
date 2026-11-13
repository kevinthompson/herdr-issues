export const STATUSES = ["triage", "backlog", "todo", "in-progress", "in-review", "done", "canceled"];
export const STATUS_LABELS = { triage: "Triage", backlog: "Backlog", todo: "Todo", "in-progress": "In progress", "in-review": "In review", done: "Done", canceled: "Canceled" };
export const PRIORITIES = ["None", "Urgent", "High", "Medium", "Low"];

// Work starts only on issues nobody has picked up yet, and waits while any of their blockers is unfinished.
const STARTABLE_STATUSES = ["backlog", "todo"];
const FINISHED = ["done", "canceled"];
const isStartable = (issue) => STARTABLE_STATUSES.includes(issue.status);
const isUnblocked = (issue, done) => issue.blockedBy.every((id) => done.has(id));

// A group with `loads` starts collapsed, and a tracker may skip listing its issues until it is expanded:
// backlog issues (which Blocked is built from too), done issues, or canceled ones.
const GROUPS = [
  { id: "triage", label: "Triage", has: (issue) => issue.status === "triage" },
  { id: "in-review", label: "In review", has: (issue) => issue.status === "in-review" },
  { id: "in-progress", label: "In progress", has: (issue) => issue.status === "in-progress" },
  { id: "todo", label: "Todo", has: (issue, done) => issue.status === "todo" && isUnblocked(issue, done) },
  { id: "blocked", label: "Blocked", collapsed: true, loads: "backlog", has: (issue, done) => isStartable(issue) && !isUnblocked(issue, done) },
  { id: "backlog", label: "Backlog", collapsed: true, loads: "backlog", has: (issue, done) => issue.status === "backlog" && isUnblocked(issue, done) },
  { id: "unknown", label: "Unknown status", has: (issue) => !STATUSES.includes(issue.status) },
  { id: "done", label: "Done", collapsed: true, loads: "done", sort: byRecentlyCompleted, has: (issue) => issue.status === "done" },
  { id: "canceled", label: "Canceled", collapsed: true, loads: "canceled", has: (issue) => issue.status === "canceled" },
];

// By priority (urgent first, "None" last), then by SLA (the soonest breach first, issues without one
// after), then issues with an order by that number, then by ID in number order.
export const priorityRank = (issue) => issue.priority || PRIORITIES.length;
const slaBreachTime = (issue) => (issue.sla ? Date.parse(issue.sla.breachesAt) : Infinity);
const byId = (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true });

function byPosition(a, b) {
  const byPriority = priorityRank(a) - priorityRank(b);
  if (byPriority) return byPriority;
  const [aBreach, bBreach] = [slaBreachTime(a), slaBreachTime(b)];
  if (aBreach !== bBreach) return aBreach < bBreach ? -1 : 1;
  if (a.order !== null || b.order !== null) {
    if (a.order === null) return 1;
    if (b.order === null) return -1;
    if (a.order !== b.order) return a.order - b.order;
  }
  return byId(a, b);
}

// Most recently completed first. Issues done before completion was recorded follow, newest ID first.
function byRecentlyCompleted(a, b) {
  if (a.completed && b.completed) return b.completed.localeCompare(a.completed);
  if (a.completed || b.completed) return a.completed ? -1 : 1;
  return byId(b, a);
}

// The issues a tracker must list for the groups `isExpanded` says are open.
export function loadsFor(isExpanded) {
  return new Set(GROUPS.filter((group) => group.loads && isExpanded(group)).map((group) => group.loads));
}

// The groups holding issues, each with its sorted issues. A group whose issues weren't listed (its `loads`
// is in `unloaded`) shows as unloaded, with no issues, whether or not it holds any.
export function groupIssues(issues, unloaded = new Set()) {
  const done = new Set(issues.filter((issue) => issue.status === "done").map((issue) => issue.id));
  return GROUPS.map((group) => unloaded.has(group.loads) ? { ...group, unloaded: true, issues: [] }
    : { ...group, issues: issues.filter((issue) => group.has(issue, done)).sort(group.sort ?? byPosition) })
    .filter((group) => group.unloaded || group.issues.length);
}

// Which issues are done or still open, and which issues each one blocks, read once per list: every row
// asks, and scanning the whole list for each row is too slow to render a team's hundreds of issues.
const relationsByList = new WeakMap();
function relations(issues) {
  if (!relationsByList.has(issues)) {
    const done = new Set(), open = new Set(), blocking = new Map();
    for (const issue of issues) {
      if (issue.status === "done") done.add(issue.id);
      if (!FINISHED.includes(issue.status)) open.add(issue.id);
      for (const blockerId of issue.blockedBy) blocking.set(blockerId, [...(blocking.get(blockerId) ?? []), issue]);
    }
    for (const [blockerId, blocked] of blocking) blocking.set(blockerId, blocked.sort(byId).map((issue) => issue.id));
    relationsByList.set(issues, { done, open, blocking });
  }
  return relationsByList.get(issues);
}

export function unfinishedBlockers(issue, issues) {
  const { done } = relations(issues);
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
  return relations(issues).blocking.get(issue.id) ?? [];
}

// The unfinished issues this one still holds up: none once it is done or canceled.
export function waitingIssues(issue, issues) {
  if (FINISHED.includes(issue.status)) return [];
  const { open } = relations(issues);
  return blockedIssues(issue, issues).filter((id) => open.has(id));
}

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
