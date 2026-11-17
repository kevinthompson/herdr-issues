// The theme colors a pull request's status is drawn in: its label and color in the detail view.

/** @type {Record<string, [string, string]>} */
export const PULL_REQUEST_STATUSES = {
  draft: ["Draft", "dim"],
  open: ["Open", "ansi2"],
  inReview: ["In review", "ansi2"],
  approved: ["Approved", "ansi2"],
  merged: ["Merged", "ansi5"],
  closed: ["Closed", "ansi1"],
};
