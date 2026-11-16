// What Start and Continue run in an issue's new worktree space: a Claude session working the issue with
// /issues:work when `claude` runs on this computer, or else the space's plain shell tab. The session runs on the
// repository's workModel and workEffort settings, with its workPrompt appended to the system prompt, as
// `issues worktree --claude` does.
import { exec } from "herdr";
import { cachedLookup } from "./lookups.js";
import { DEFAULT_WORK_EFFORT, DEFAULT_WORK_MODEL, workSettings } from "./trackers/setting.js";
/** @import { ExecResult } from "herdr" */
/** @import { Issue, Project } from "./trackers/index.js" */

const claudeChecks = cachedLookup();
const claudeRuns = () =>
  claudeChecks("claude", async () => {
    const result = await exec("claude", ["--version"]).catch(/** @returns {ExecResult | null} */ () => null);
    return result?.code === 0;
  });

/** @param {Issue} issue */
const workIssueTask = (issue) => `/issues:work ${issue.id}`;

// The command that starts a Claude session working one of the project's issues; plain `claude` without a project.
/** @param {Project | null | undefined} project */
export async function workSessionArgv(project) {
  const { workModel, workEffort, workPrompt } = project ? await workSettings(project) : {};
  return [
    "claude",
    ...(workModel && workModel !== DEFAULT_WORK_MODEL ? ["--model", workModel] : []),
    ...(workEffort && workEffort !== DEFAULT_WORK_EFFORT ? ["--effort", workEffort] : []),
    ...(workPrompt?.trim() ? ["--append-system-prompt", workPrompt] : []),
  ];
}

// The { tab, argv, task } a new space on one of the project's issues opens with, or nothing when `claude` doesn't run.
/** @param {Issue} issue @param {Project | null | undefined} project */
export async function workIssueSession(issue, project) {
  return (await claudeRuns())
    ? { tab: "Claude", argv: await workSessionArgv(project), task: workIssueTask(issue) }
    : {};
}

// The arguments that open the issue's branch with `issues worktree`, starting Claude only when it runs.
/** @param {Issue} issue @param {{ spaceName: string, isNew?: boolean }} options */
export async function issuesWorktreeArgs(issue, { spaceName, isNew }) {
  const claude = (await claudeRuns()) ? ["--claude", workIssueTask(issue)] : [];
  return ["worktree", "--branch", issue.branch, ...(isNew ? ["--new"] : []), "--name", spaceName, ...claude];
}
