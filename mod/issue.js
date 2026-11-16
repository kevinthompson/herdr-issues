// The statuses and priorities every tracker maps its issues onto, and the rules for grouping issues in the
// list and for whether work on one can start or finish.

export const STATUSES = ["triage", "backlog", "todo", "in-progress", "in-review", "done", "canceled"];
export const STATUS_LABELS = {
  triage: "Triage",
  backlog: "Backlog",
  todo: "Todo",
  "in-progress": "In progress",
  "in-review": "In review",
  done: "Done",
  canceled: "Canceled",
};
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
  {
    id: "todo",
    label: "Todo",
    alwaysShown: true,
    has: (issue, done) => issue.status === "todo" && isUnblocked(issue, done),
  },
  {
    id: "blocked",
    label: "Blocked",
    collapsed: true,
    loads: "backlog",
    has: (issue, done) => isStartable(issue) && !isUnblocked(issue, done),
  },
  {
    id: "backlog",
    label: "Backlog",
    collapsed: true,
    loads: "backlog",
    has: (issue, done) => issue.status === "backlog" && isUnblocked(issue, done),
  },
  { id: "unknown", label: "Unknown status", has: (issue) => !STATUSES.includes(issue.status) },
  {
    id: "done",
    label: "Done",
    collapsed: true,
    loads: "done",
    sort: byRecentlyCompleted,
    has: (issue) => issue.status === "done",
  },
  {
    id: "canceled",
    label: "Canceled",
    collapsed: true,
    loads: "canceled",
    has: (issue) => issue.status === "canceled",
  },
];

// By priority (urgent first, "None" last), then by SLA (the soonest breach first, issues without one
// after), then issues with an order by that number, then by ID in number order.
export const priorityRank = (issue) => issue.priority || PRIORITIES.length;
const slaBreachTime = (issue) => (issue.sla ? Date.parse(issue.sla.breachesAt) : Infinity);
const byId = (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true });

export function byPosition(a, b) {
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

// The groups to show, each with its sorted issues: Todo even when empty, so the list always says where new
// issues go, and any other group holding issues. A group whose issues weren't listed (its `loads` is in `unloaded`) shows as unloaded, with
// no issues, whether or not it holds any. With a `label`, groups hold only the issues carrying it, while
// blockers are still read from every issue. When the tracker lists at most `recentlyClosed` finished issues
// and listed that many, Done and Canceled carry that number as their `cap`, since they may hold more.
export function groupIssues(issues, unloaded = new Set(), label = null, { recentlyClosed = null } = {}) {
  const done = new Set(issues.filter((issue) => issue.status === "done").map((issue) => issue.id));
  const shown = label ? issues.filter((issue) => issue.labels.includes(label)) : issues;
  const closedCapReached =
    recentlyClosed !== null && issues.filter((issue) => FINISHED.includes(issue.status)).length >= recentlyClosed;
  const capOf = (group) => (closedCapReached && FINISHED.includes(group.loads) ? recentlyClosed : null);
  return GROUPS.map((group) =>
    unloaded.has(group.loads)
      ? { ...group, unloaded: true, issues: [] }
      : {
          ...group,
          cap: capOf(group),
          issues: shown.filter((issue) => group.has(issue, done)).sort(group.sort ?? byPosition),
        },
  ).filter((/** @type {any} */ group) => group.unloaded || group.issues.length || group.alwaysShown);
}

// Whether no group the list shows holds an issue, so it points the person at creating one.
export const holdsNoIssues = (groups) => groups.every((group) => !group.issues.length);

// The count beside a group's title: "20+" for a group capped at 20, or null when its issues weren't listed.
export function groupCountText(group) {
  if (group.unloaded) return null;
  return group.cap ? `${group.cap}+` : String(group.issues.length);
}

// The Linear icon drawn beside a group or status, or null for one without, such as Unknown status.
const ICON_IDS = ["triage", "in-review", "in-progress", "todo", "blocked", "backlog", "done", "canceled"];
export const statusIcon = (id) => (ICON_IDS.includes(id) ? `mods/issues/icons/${id}.png` : null);

const MAX_STRIP_COUNT = 99;

// One badge for each group `groupIssues` returns, in the list's order, with its header's count, shortened to
// 99+ above 99. An unloaded group's badge has no text, so the strip draws the refresh icon in its place.
export function stripBadges(groups) {
  return groups.map((group) => {
    const {
      id,
      label,
      unloaded = false,
      issues: { length: count },
    } = group;
    const tooLong = !unloaded && !group.cap && count > MAX_STRIP_COUNT;
    const text = tooLong ? `${MAX_STRIP_COUNT}+` : groupCountText(group);
    return { id, label, count, text, unloaded };
  });
}

// Which issues are done or still open, and which issues each one blocks, read once per list: every row
// asks, and scanning the whole list for each row is too slow to render a team's hundreds of issues.
const relationsByList = new WeakMap();
function relations(issues) {
  if (!relationsByList.has(issues)) {
    const done = new Set(),
      open = new Set(),
      blocking = new Map();
    for (const issue of issues) {
      if (issue.status === "done") done.add(issue.id);
      if (!FINISHED.includes(issue.status)) open.add(issue.id);
      for (const blockerId of issue.blockedBy) blocking.set(blockerId, [...(blocking.get(blockerId) ?? []), issue]);
    }
    for (const [blockerId, blocked] of blocking)
      blocking.set(
        blockerId,
        blocked.sort(byId).map((issue) => issue.id),
      );
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

export const hasPullRequestOnBranch = (issue) =>
  (issue.pullRequests ?? []).some((pullRequest) => pullRequest.branch === issue.branch);

const UNSTARTED_STATUSES = ["triage", "backlog", "todo"];
export const isUnstarted = (issue) => UNSTARTED_STATUSES.includes(issue.status);

// An issue nobody has started, whose branch doesn't exist yet unless a pull request already uses it.
export const needsNewBranch = (issue) => isUnstarted(issue) && !hasPullRequestOnBranch(issue);

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
const HOUR_MS = 3600000,
  DAY_MS = 24 * HOUR_MS;
const duration = (ms) =>
  ms >= DAY_MS
    ? `${Math.floor(ms / DAY_MS)}d`
    : ms >= HOUR_MS
      ? `${Math.floor(ms / HOUR_MS)}h`
      : `${Math.max(1, Math.floor(ms / 60000))}m`;

export function slaStatus(issue, now = Date.now()) {
  if (!issue.sla || FINISHED.includes(issue.status)) return null;
  const { breachesAt, mediumRiskAt, highRiskAt } = issue.sla,
    left = Date.parse(breachesAt) - now;
  if (left <= 0) return { text: `SLA −${duration(-left)}`, risk: "breached" };
  const risk =
    highRiskAt && now >= Date.parse(highRiskAt)
      ? "high"
      : mediumRiskAt && now >= Date.parse(mediumRiskAt)
        ? "medium"
        : "low";
  return { text: `SLA ${duration(left)}`, risk };
}

// When an unfinished issue is due: { text, urgency }, where urgency is "overdue" before today, "soon"
// from today through DUE_SOON_DAYS later, and "later" after that. Days are local. null without a due
// date or once the issue is finished.
const DUE_SOON_DAYS = 3;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dueStatus(issue, now = new Date()) {
  if (!issue.due || FINISHED.includes(issue.status)) return null;
  const [year, month, day] = issue.due.split("-").map(Number);
  const daysLeft = Math.round(
    (new Date(year, month - 1, day).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      DAY_MS,
  );
  const urgency = daysLeft < 0 ? "overdue" : daysLeft <= DUE_SOON_DAYS ? "soon" : "later";
  const date = `${MONTHS[month - 1]} ${day}${year === now.getFullYear() ? "" : `, ${year}`}`;
  return { text: `Due ${date}`, urgency };
}
