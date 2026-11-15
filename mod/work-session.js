// What Start and Continue run in an issue's new worktree space: a Claude session working the issue with
// /issues:work when `claude` runs on this computer, or else the space's plain shell tab.
import { exec } from "herdr";
import { cachedLookup } from "./lookups.js";

const claudeChecks = cachedLookup();
const claudeRuns = () => claudeChecks("claude", async () => {
  const result = await exec("claude", ["--version"]).catch(() => null);
  return result?.code === 0;
});

const workIssueTask = (issue) => `/issues:work ${issue.id}`;

// The { tab, argv, task } a new space opens with, or nothing when `claude` doesn't run.
export async function workIssueSession(issue) {
  return await claudeRuns() ? { tab: "Claude", argv: ["claude"], task: workIssueTask(issue) } : {};
}

// The arguments that open the issue's branch with `issues worktree`, starting Claude only when it runs.
export async function issuesWorktreeArgs(issue, { spaceName, isNew }) {
  const claude = await claudeRuns() ? ["--claude", workIssueTask(issue)] : [];
  return ["worktree", "--branch", issue.branch, ...(isNew ? ["--new"] : []), "--name", spaceName, ...claude];
}
