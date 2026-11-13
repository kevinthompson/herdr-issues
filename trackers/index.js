// A tracker is where a project's issues live. Every backend returns the same shapes, so the
// panel never knows which one it is showing.
//
//   tracker.kind                "local" or "linear"
//   tracker.name                shown in the panel's header
//   tracker.team                the Linear team's key, for Linear
//   tracker.writable            whether update can save
//   tracker.statuses            the STATUSES (issue.js) its issues can be set to
//   tracker.scopes              the issue lists the tracker can show, { id, label, group? }, its default
//                                 first, a project's milestones under it as { milestones }; absent when
//                                 it has only one
//   tracker.list(scopeId)       → Issue[] in that scope, or the default one
//   tracker.get(id)             → Issue, or null
//   tracker.update(issue, f)    → saves any of { status, priority, order, body } (status: one of STATUSES
//                                 in issue.js; body: Markdown, refused if it changed since `issue` was read)
//   tracker.start(issue)        → marks the issue in progress
//   tracker.startPrecedesWorktree whether start must finish before the issue's worktree is made, because
//                                 new work branches from where it records the status
//   tracker.delegate(issue)     → hands the issue to Planning Center's Cloud Agent to work; null where
//                                 the project can't
//   tracker.isDelegated(issue)  → whether the Cloud Agent has the issue already; null with delegate
//   tracker.commitChecklists(issues) → records checkbox changes saved with update where the tracker
//                                 keeps history; nothing to do when every save is already final
//   tracker.commitStatuses(issues) → records status changes saved with update the same way; issues are
//                                 { id, file, status }
//   tracker.changed             → a function that resolves when issues may have changed,
//                                 or null when the backend can't tell and the panel polls
//
// Issue: { id, title, status, priority (0 none … 4 low), order (a number, or null), labels, blockedBy,
//          branch, created, body (null until loaded: tracker.get loads it), updated (when the tracker
//          can say), path (where to edit it, for local issues),
//          labelColors ({ label: "#rrggbb" }, for Linear issues), assignee (a name, for Linear issues),
//          assigneeAvatar (an image URL, or null, for Linear issues),
//          sla ({ breachesAt, mediumRiskAt, highRiskAt } ISO times, for Linear issues with an SLA),
//          pullRequests ([{ url, title, repo, number, status, branch }] attached to Linear issues),
//          delegateId (the agent working it, or null, for Linear issues), delegate (its name, or null),
//          delegateAvatar (an image URL, or null, for Linear issues) }
// The Linear backend maps its workflow states onto STATUSES, its priorities onto the same scale, and
// its manual sort order onto order. A Linear issue's branch is its open pull request's in the repository,
// else the one Linear suggests.
import { localTracker } from "./local.js";
import { linearTracker } from "./linear.js";
import { trackerSetting } from "./setting.js";

// The repository's .issues.json (setting.js) decides; without one, its own issues/ folder wins over Linear.
export async function trackerFor(project) {
  const setting = await trackerSetting(project);
  if (setting?.tracker === "local") return localTracker(project);
  if (setting?.tracker === "linear") return linearTracker(project, setting);
  return (await localTracker(project)) ?? linearTracker(project);
}
