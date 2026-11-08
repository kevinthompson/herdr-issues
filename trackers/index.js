// A tracker is where a project's issues live. Every backend returns the same shapes, so the
// panel never knows which one it is showing.
//
//   tracker.kind                "local" (a Linear backend adds "linear")
//   tracker.name                shown in the panel's header
//   tracker.writable            whether update can save
//   tracker.list()              → Issue[]
//   tracker.get(id)             → Issue, or null
//   tracker.update(issue, f)    → saves any of { status, priority, order, body } (status: one of STATUSES
//                                 in issue.js; body: Markdown, refused if it changed since `issue` was read)
//   tracker.start(issue)        → marks the issue in progress where new work branches from, before its
//                                 worktree is made
//   tracker.changed             → a function that resolves when issues may have changed,
//                                 or null when the backend can't tell and the panel polls
//
// Issue: { id, title, status, priority (0 none … 4 low), order (a number, or null), labels, blockedBy,
//          branch, created, body }
// A Linear backend maps its workflow states onto STATUSES, its priorities onto the same scale, and
// its manual sort order onto order.
import { localTracker } from "./local.js";

export async function trackerFor(project) {
  return localTracker(project);
}
