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
//   tracker.deferred(scopeId)   → the groups (issue.js) whose issues list only once they are expanded
//   tracker.recentlyClosed      how many closed issues list at most, for GitHub and Beads, whose Done
//                                 and Canceled can't count every closed issue
//   tracker.get(id)             → Issue, or null
//   tracker.labels()            → the names of the labels issues can take, as issue.labels names them, for
//                                 Linear (its team's) and GitHub; Beads has none to choose from
//   tracker.update(issue, f)    → saves any of { status, priority, order, body, addLabels, removeLabels }
//                                 (status: one of STATUSES in issue.js; body: Markdown, refused if it changed
//                                 since `issue` was read; addLabels and removeLabels: arrays of label names,
//                                 changing only those labels, and refused, changing nothing, when the tracker
//                                 has no label by one of the names)
//   tracker.start(issue)        → marks the issue in progress
//   tracker.viewerId()          → the person's Linear user ID, for Linear
//
// Issue: { id, title, status, priority (0 none … 4 low), order (a number, or null),
//          labels (names; a Linear label in a group is "group > name"), blockedBy,
//          branch, created, body (null until loaded: tracker.get loads it), updated (when the tracker
//          can say), labelColors ({ label: "#rrggbb" }, for Linear issues),
//          labelParts ({ label: { group, value } } for each Linear label in a group), assignee (a name, for Linear issues),
//          assigneeId (the assignee's user ID, or null, for Linear issues),
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

/**
 * @typedef {object} PullRequest
 * @property {string} url
 * @property {string} title
 * @property {string | null} repo
 * @property {number | null} number
 * @property {string} status
 * @property {string | null} branch
 * @property {string} [fullRepo]
 */

/**
 * @typedef {object} LabelParts
 * @property {string} group
 * @property {string} value
 */

/**
 * @typedef {object} Issue
 * @property {string} id
 * @property {string} title
 * @property {string} status One of STATUSES in issue.js.
 * @property {number} priority 0 none … 4 low.
 * @property {number | null} order
 * @property {string[]} labels
 * @property {string[]} blockedBy
 * @property {number} [number]
 * @property {string} [url]
 * @property {string} [linearId]
 * @property {string} [teamId]
 * @property {string[]} [assigneeLogins]
 * @property {string | null} [branch]
 * @property {string} [created]
 * @property {string | null} [completed]
 * @property {string | null} [body] Null until tracker.get loads it.
 * @property {string} [updated]
 * @property {Record<string, string>} [labelColors]
 * @property {Record<string, LabelParts>} [labelParts]
 * @property {string} [assignee]
 * @property {string | null} [assigneeId]
 * @property {string | null} [assigneeAvatar]
 * @property {{ breachesAt: string, mediumRiskAt: string | null, highRiskAt: string | null } | null} [sla]
 * @property {string | null} [due]
 * @property {PullRequest[]} [pullRequests]
 * @property {string | null} [delegateId]
 * @property {string | null} [delegate]
 * @property {string | null} [delegateAvatar]
 * @property {boolean} [bodyStale] The panel's: the list changed since the body loaded.
 */

/**
 * @typedef {object} TrackerScope
 * @property {string} [id]
 * @property {string} [label]
 * @property {string} [group]
 * @property {string} [team]
 * @property {string} [url]
 * @property {string} [subgroup]
 * @property {TrackerScope[]} [milestones]
 */

/**
 * @typedef {object} IssueChanges
 * @property {string} [status]
 * @property {number} [priority]
 * @property {number | null} [order]
 * @property {string} [body]
 * @property {string[]} [addLabels]
 * @property {string[]} [removeLabels]
 */

/**
 * @typedef {object} Tracker
 * @property {"linear" | "github" | "beads"} kind
 * @property {string} name
 * @property {string} [team]
 * @property {string} [repo]
 * @property {boolean} writable
 * @property {boolean} [prioritized]
 * @property {string[]} statuses
 * @property {TrackerScope[]} [scopes]
 * @property {number} [recentlyClosed]
 * @property {(scopeId?: string, loads?: Set<string>) => Promise<Issue[]>} list
 * @property {(scopeId?: string) => string[]} [deferred]
 * @property {(id: string) => Promise<Issue | null>} get
 * @property {() => Promise<string[]>} [labels]
 * @property {(issue: Issue, changes: IssueChanges) => Promise<void>} update
 * @property {(issue: Issue) => Promise<void>} start
 * @property {() => Promise<string>} [viewerId]
 */

/**
 * The project a panel shows: its root and, outside a git repository, `on` (location.js).
 * @typedef {{ root: string, on?: string }} Project
 */

import { linearTracker } from "./linear.js";
import { githubTracker } from "./github.js";
import { beadsTracker } from "./beads.js";
import { trackerSetting } from "./setting.js";

// The repository's entry in issues.json (setting.js) decides; without one, Linear.
/**
 * @param {Project} project
 * @returns {Promise<Tracker | null>}
 */
export async function trackerFor(project) {
  const setting = await trackerSetting(project);
  if (setting?.tracker === "github") return githubTracker(project, setting);
  if (setting?.tracker === "beads") return beadsTracker(project);
  return linearTracker(project, setting);
}
