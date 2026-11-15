// A tracker is where a project's issues live. Every backend returns the same shapes, so the
// panel never knows which one it is showing.
//
//   tracker.kind                "linear", "github" or "beads"
//   tracker.name                shown in the panel's header
//   tracker.team                the Linear team's key, for Linear
//   tracker.repo                the GitHub repository, owner/name, for GitHub
//   tracker.writable            whether update can save
//   tracker.prioritized         false when its issues have no priority to show or set
//   tracker.statuses            the STATUSES (issue.js) its issues can be set to
//   tracker.scopes              the issue lists the tracker can show, { id, label, group? }, its default
//                                 first, a project's milestones under it as { milestones }; absent when
//                                 it has only one
//   tracker.list(scopeId)       → Issue[] in that scope, or the default one
//   tracker.get(id)             → Issue, or null
//   tracker.labels()            → the names of the labels new issues can take, for GitHub; Linear's come from
//                                 its MCP server, and Beads has none to choose from
//   tracker.update(issue, f)    → saves any of { status, priority, order, body } (status: one of STATUSES
//                                 in issue.js; body: Markdown, refused if it changed since `issue` was read)
//   tracker.start(issue)        → marks the issue in progress
//
// Issue: { id, title, status, priority (0 none … 4 low), order (a number, or null), labels, blockedBy,
//          branch, created, body (null until loaded: tracker.get loads it), updated (when the tracker
//          can say), labelColors ({ label: "#rrggbb" }, for Linear issues), assignee (a name, for Linear issues),
//          assigneeAvatar (an image URL, or null, for Linear issues),
//          sla ({ breachesAt, mediumRiskAt, highRiskAt } ISO times, for Linear issues with an SLA),
//          due (a YYYY-MM-DD date, or null: Linear's due date, or the due date of a GitHub issue's milestone),
//          pullRequests ([{ url, title, repo, number, status, branch }] attached to Linear issues),
//          delegateId (the agent working it, or null, for Linear issues), delegate (its name, or null),
//          delegateAvatar (an image URL, or null, for Linear issues) }
// The Linear backend maps its workflow states onto STATUSES, its priorities onto the same scale, and
// its manual sort order onto order. A Linear issue's branch is its open pull request's in the repository,
// else the one Linear suggests. GitHub issues fill the same fields as Linear's labelColors, assignee,
// assigneeAvatar and pullRequests; github.js says how their statuses and branches are derived. beads.js says how
// Beads issues' statuses and priorities map.
import { linearTracker } from "./linear.js";
import { githubTracker } from "./github.js";
import { beadsTracker } from "./beads.js";
import { trackerSetting } from "./setting.js";

// The repository's entry in issues.json (setting.js) decides; without one, Linear.
export async function trackerFor(project) {
  const setting = await trackerSetting(project);
  if (setting?.tracker === "github") return githubTracker(project, setting);
  if (setting?.tracker === "beads") return beadsTracker(project, setting);
  return linearTracker(project, setting);
}
