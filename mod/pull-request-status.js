// The theme colors a pull request's status is drawn in: its label and color in the detail view, and the color
// of the pull request badge in a list row, which takes the most urgent of an issue's pull requests.
/** @import { PullRequest } from "./trackers/index.js" */

/** @type {Record<string, [string, string]>} */
export const PULL_REQUEST_STATUSES = {
  draft: ["Draft", "dim"],
  open: ["Open", "ansi2"],
  inReview: ["In review", "ansi2"],
  approved: ["Approved", "ansi2"],
  merged: ["Merged", "ansi5"],
  closed: ["Closed", "ansi1"],
};

const FINISHED_STATUSES = ["merged", "closed"];
const FAILING_CHECKS_COLOR = "ansi1";
const BADGE_COLORS_BY_URGENCY = [FAILING_CHECKS_COLOR, "ansi2", "dim"];

/** @param {PullRequest} pullRequest */
function badgeColorOf(pullRequest) {
  if (FINISHED_STATUSES.includes(pullRequest.status)) return "dim";
  if (pullRequest.checksFailing) return FAILING_CHECKS_COLOR;
  return PULL_REQUEST_STATUSES[pullRequest.status]?.[1] ?? "dim";
}

/** @param {PullRequest[]} pullRequests */
export function pullRequestBadgeColor(pullRequests) {
  const colors = pullRequests.map(badgeColorOf);
  return BADGE_COLORS_BY_URGENCY.find((color) => colors.includes(color)) ?? "dim";
}
