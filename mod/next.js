// Ranks a tracker's actionable issues: those ready to start, with no unfinished issue blocking them. Each
// tracker has its own rule, read from the issues its list returns:
//   GitHub: open, unassigned issues with no open linked pull request (status todo), oldest first.
//   Linear: unstarted issues (status todo) assigned to the person or to no one, in the scope listed, by
//           priority in the panel's order.
//   Beads:  open issues (status todo), by priority, then oldest first, as `bd ready` ranks them.
// Whether an issue waits on a decision only the person can make is left to whoever reads its body.
import { byPosition, priorityRank } from "./issue.js";

const byOldest = (a, b) => a.created.localeCompare(b.created);
const byPriorityThenOldest = (a, b) => priorityRank(a) - priorityRank(b) || byOldest(a, b);

const isReady = (issue) => issue.status === "todo" && !issue.blockedBy.length;

async function linearRanking(tracker) {
  const viewerId = await tracker.viewerId();
  return {
    qualifies: (issue) => issue.assigneeId === null || issue.assigneeId === viewerId,
    order: byPosition,
  };
}

const RANKINGS = {
  github: async () => ({ qualifies: () => true, order: byOldest }),
  linear: linearRanking,
  beads: async () => ({ qualifies: () => true, order: byPriorityThenOldest }),
};

// The `count` highest-ranked actionable issues in the tracker's scope `scopeId`, or its default one; fewer
// when fewer qualify.
export async function nextIssues(tracker, count, scopeId) {
  const [issues, { qualifies, order }] = await Promise.all([tracker.list(scopeId), RANKINGS[tracker.kind](tracker)]);
  return issues
    .filter((issue) => isReady(issue) && qualifies(issue))
    .sort(order)
    .slice(0, count);
}
