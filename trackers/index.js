// A tracker is where a project's issues live. Every backend returns the same shapes, so the
// panel never knows which one it is showing.
//
//   tracker.kind                "local" or "linear"
//   tracker.name                shown in the panel's header
//   tracker.writable            whether update can save
//   tracker.scopes              the issue lists the tracker can show, { id, label }, its default first;
//                                 absent when it has only one
//   tracker.list(scopeId)       → Issue[] in that scope, or the default one
//   tracker.get(id)             → Issue, or null
//   tracker.update(issue, f)    → saves any of { status, priority, order, body } (status: one of STATUSES
//                                 in issue.js; body: Markdown, refused if it changed since `issue` was read)
//   tracker.start(issue)        → marks the issue in progress where new work branches from, before its
//                                 worktree is made
//   tracker.finish(issue)       → marks the issue done
//   tracker.commitChecklists(issues) → records checkbox changes saved with update where the tracker
//                                 keeps history; nothing to do when every save is already final
//   tracker.changed             → a function that resolves when issues may have changed,
//                                 or null when the backend can't tell and the panel polls
//
// Issue: { id, title, status, priority (0 none … 4 low), order (a number, or null), labels, blockedBy,
//          branch, created, body, path (where to edit it, for local issues),
//          labelColors ({ label: "#rrggbb" }, for Linear issues) }
// The Linear backend maps its workflow states onto STATUSES, its priorities onto the same scale, and
// its manual sort order onto order.
import { localTracker } from "./local.js";
import { linearTracker } from "./linear.js";

// A repository's own issues/ folder wins over a Linear mapping.
export async function trackerFor(project) {
  return (await localTracker(project)) ?? linearTracker(project);
}
