// `issues finish`: whether an issue session's worktree is safe to remove, and the final message the session ends
// with once it is. The work is safe to remove when nothing is uncommitted and the branch is merged into main or, in a
// repository whose approved work opens pull requests, pushed with an open pull request whose checks pass when
// waitForChecks is true; or when the person canceled it. finishedWork answers that, and finishInstructions writes the
// final block and, for close ask, the question to ask. cli/main.js runs the Herdr commands between them.
import { exec } from "herdr";
import { MAIN_BRANCHES } from "../mod/worktree.js";

async function run(command, args, cwd) {
  const result = await exec(command, args, { cwd }).catch((error) => ({ code: null, stdout: "", stderr: error.message }));
  return { ok: result.code === 0, out: (result.stdout ?? "").trim(), err: (result.stderr ?? "").trim() };
}

const git = (cwd, ...args) => run("git", args, cwd);

async function localMainBranch(cwd) {
  for (const branch of MAIN_BRANCHES) if ((await git(cwd, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`)).ok) return branch;
  return null;
}

async function pullRequestOf(branch, cwd) {
  const view = await run("gh", ["pr", "view", branch, "--json", "state,url,headRefOid"], cwd);
  if (!view.ok) return null;
  try { return JSON.parse(view.out); } catch { return null; }
}

const FAILED_BUCKETS = ["fail", "cancel"];

// gh exits non-zero while checks fail or run, so its JSON is read whatever the exit status.
async function checksOf(branch, cwd) {
  const checks = await run("gh", ["pr", "checks", branch, "--json", "name,bucket"], cwd);
  try {
    const list = JSON.parse(checks.out);
    return {
      failing: list.filter((check) => FAILED_BUCKETS.includes(check.bucket)).map((check) => check.name),
      pending: list.filter((check) => check.bucket === "pending").map((check) => check.name),
    };
  } catch {
    if (/no checks reported/i.test(checks.err)) return { failing: [], pending: [] };
    return { error: checks.err || "gh pr checks printed nothing" };
  }
}

async function pullRequestState({ id, branch, head, cwd, waitForChecks, checksRecorded }) {
  const pullRequest = await pullRequestOf(branch, cwd);
  if (!pullRequest) return { outstanding: [`${branch} isn't merged into main and has no pull request.`] };
  if (pullRequest.state === "MERGED") return { result: `Merged into main through ${pullRequest.url}; nothing is uncommitted.` };
  if (pullRequest.state !== "OPEN") return { outstanding: [`${branch}'s pull request is ${pullRequest.state.toLowerCase()}: ${pullRequest.url}`] };
  const outstanding = [];
  if (pullRequest.headRefOid !== head) outstanding.push(`${branch} has commits its pull request doesn't: push them.`);
  if (waitForChecks) {
    const checks = await checksOf(branch, cwd);
    if (checks.error) outstanding.push(`Couldn't read the pull request's checks: ${checks.error}`);
    if (checks.pending?.length) outstanding.push(`The pull request's checks are still running: ${checks.pending.join(", ")}.`);
    if (checks.failing?.length && !checksRecorded) {
      outstanding.push(`The pull request's checks fail: ${checks.failing.join(", ")}. Fix them, or, when the branch didn't cause them, `
        + `say so in an issue comment and run issues finish ${id} --checks-recorded.`);
    }
  }
  return { outstanding, result: `PR open at ${pullRequest.url}; nothing is uncommitted.`, pullRequestOpen: true };
}

// { outstanding: what keeps the worktree from being safe to remove, result: the final block's sentence,
// pullRequestOpen }.
export async function finishedWork({ id, cwd, onApproval, waitForChecks, canceled = false, checksRecorded = false }) {
  if (canceled) return { outstanding: [], result: "The work was canceled." };
  const outstanding = [];
  if ((await git(cwd, "status", "--porcelain")).out) outstanding.push("The worktree has uncommitted changes: commit them.");
  const branch = (await git(cwd, "branch", "--show-current")).out;
  if (!branch) return { outstanding: [...outstanding, "No branch is checked out."] };
  const main = await localMainBranch(cwd);
  if (!main) return { outstanding: [...outstanding, "There is no local main branch to compare the branch with."] };
  if ((await git(cwd, "merge-base", "--is-ancestor", "HEAD", main)).ok) {
    return { outstanding, result: `Merged into ${main}; nothing is uncommitted.` };
  }
  if (onApproval !== "pull-request") return { outstanding: [...outstanding, `${branch} isn't merged into ${main}.`] };
  const head = (await git(cwd, "rev-parse", "HEAD")).out;
  const state = await pullRequestState({ id, branch, head, cwd, waitForChecks, checksRecorded });
  return { ...state, outstanding: [...outstanding, ...state.outstanding] };
}

export const CLOSING_LINES = {
  ask: "This session is finished. This worktree closes once you choose Close it.",
  kept: "This session is finished. Close this worktree with cmd+shift+w when you're ready.",
  auto: "This session is finished. This worktree closes once this message is shown.",
  outsideHerdr: "This session is finished. Close this worktree with cmd+shift+w.",
};

export const finishedBlock = (id, result, closingLine) => ["---", "", `## ✅ Session finished: ${id}`, "", result, "", `**${closingLine}**`].join("\n");

function closeQuestion({ canceled, pullRequestOpen }) {
  const whatHappened = canceled ? "This issue's work was canceled."
    : pullRequestOpen ? "This issue is complete and its pull request has been opened."
      : "This issue is complete and the work has been merged.";
  return `${whatHappened} Would you like to close this worktree? You can also close it later with cmd+shift+w.`;
}

// What the session ends with. `close` is the close setting, or null outside Herdr; `onlyBlock`: nobody reads the
// final message before the space closes, so nothing goes above the block.
export function finishInstructions({ id, result, close, onlyBlock, canceled, pullRequestOpen }) {
  const closingLine = close ? CLOSING_LINES[close] : CLOSING_LINES.outsideHerdr;
  const block = finishedBlock(id, result, closingLine);
  const lead = onlyBlock ? "Your final message is only this block, with no summary above it:" : "End your final message with this block, set apart from everything above it:";
  if (close !== "ask") return [lead, "", block, "", "Write nothing after it."].join("\n");
  return [
    lead, "", block, "",
    "Then ask with AskUserQuestion, writing nothing else after the block:",
    `  Question: ${closeQuestion({ canceled, pullRequestOpen })}`,
    "  Choices: Close it, Keep it open",
    "On Close it: end with one short line, such as \"Closing this worktree.\", and no tool call.",
    `On Keep it open: run issues close --cancel ${id}, then end with the block again, its closing line changed to:`,
    `  **${CLOSING_LINES.kept}**`,
  ].join("\n");
}
