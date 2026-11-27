// What Start and Continue run in an issue's new worktree space: the repository's worktreeCommand setting, an
// interactive command run in the space's tab through the person's login shell, or else the tab's plain shell. The
// command's <issueId> becomes $ISSUE_ID, which the tab's environment holds, so an ID such as #41 reaches the command
// as text rather than shell syntax. Once the command exits, the tab carries on as a login shell.
import { worktreeCommandTemplate } from "./trackers/setting.js";
/** @import { Issue, Project } from "./trackers/index.js" */

const ISSUE_ID_PLACEHOLDER = "<issueId>";
const RUN_COMMAND = `ISSUE_ID=$2 "\${SHELL:-/bin/sh}" -lic "$1"; exec "\${SHELL:-/bin/sh}" -l`;

/**
 * @param {string} template
 * @param {string} issueId
 */
export const worktreeCommandArgv = (template, issueId) => [
  "sh",
  "-c",
  RUN_COMMAND,
  "sh",
  template.replaceAll(ISSUE_ID_PLACEHOLDER, "$ISSUE_ID"),
  issueId,
];

// The { argv } a new space on one of the project's issues opens with, or nothing without a worktreeCommand.
/**
 * @param {Project | null | undefined} project
 * @param {string} issueId
 * @returns {Promise<{ argv?: string[] }>}
 */
export async function worktreeCommandTab(project, issueId) {
  const template = project ? await worktreeCommandTemplate(project) : null;
  return template ? { argv: worktreeCommandArgv(template, issueId) } : {};
}

// The arguments that open the issue's branch with `issues worktree`, which runs the issue's worktreeCommand.
/** @param {Issue} issue @param {{ spaceName: string, isNew?: boolean }} options */
export const issuesWorktreeArgs = (issue, { spaceName, isNew }) => [
  "worktree",
  "--branch",
  /** @type {string} */ (issue.branch),
  ...(isNew ? ["--new"] : []),
  "--name",
  spaceName,
  "--issue",
  issue.id,
];
