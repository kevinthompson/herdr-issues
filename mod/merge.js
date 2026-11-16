// Merges an issue's branch into main in the repository's main checkout and marks the issue done, for repositories
// whose approved work merges locally (onApproval "merge"). `issues merge` and the issue view's Merge button both run
// mergeIssue, which changes nothing and throws a MergeRefusal saying why when the merge can't go cleanly. With
// pushAfterMerge, it then pushes main to the remote main tracks. Once the merge is made it stays, and a failure to
// mark the issue done or to push main throws a MergedWithProblems saying the branch was merged.
// `issues merge --check` runs checkMerge, mergeIssue's checks alone, so a session can confirm before asking for
// approval that approving will merge: it tests the merge with git merge-tree and changes no checkout or ref.
/**
 * @import { ExecResult } from "herdr"
 * @import { Issue, Project, Tracker } from "./trackers/index.js"
 * @import { Checkout } from "./worktree.js"
 */
import { exec } from "herdr";
import { checkouts, MAIN_BRANCHES } from "./worktree.js";
import { approvalSettings } from "./trackers/setting.js";
import { announceIssueChange } from "./changes.js";

export class MergeRefusal extends Error {}
export class MergedWithProblems extends Error {}

/**
 * @param {string} cwd
 * @param {string[]} args
 * @param {string | null} [on]
 */
async function git(cwd, args, on) {
  const result = await exec("git", args, { cwd, on }).catch(/** @returns {ExecResult | null} */ () => null);
  return { ok: result?.code === 0, out: (result?.stdout ?? "").trim(), err: (result?.stderr ?? "").trim() };
}

/**
 * @param {string} path
 * @param {string | null | undefined} on
 * @param {{ untracked: boolean }} options
 */
const changedFiles = async (path, on, { untracked }) =>
  (await git(path, ["status", "--porcelain", `--untracked-files=${untracked ? "normal" : "no"}`], on)).out;

/**
 * @param {Checkout} main
 * @param {string} branch
 * @param {string | null | undefined} on
 */
const commitsMainLacks = async (main, branch, on) =>
  Number((await git(main.path, ["rev-list", "--count", `${main.branch}..${branch}`], on)).out) || 0;

// Whether the issue view offers to merge `branch`: the repository merges locally, and the branch's worktree has
// commits main lacks and nothing uncommitted. Anything mergeIssue checks besides is reported when it's clicked.
/**
 * @param {string | null | undefined} branch
 * @param {Project} project
 */
export async function canOfferMerge(branch, project) {
  if (!branch || project.on != null) return false;
  const { onApproval } = await approvalSettings(project).catch(() => ({
    onApproval: /** @type {string | null} */ (null),
  }));
  if (onApproval !== "merge") return false;
  const [main, ...linked] = await checkouts(project.root, project.on);
  const worktree = linked.find((checkout) => checkout.branch === branch);
  if (!main || !worktree || !MAIN_BRANCHES.includes(main.branch)) return false;
  if (await changedFiles(worktree.path, project.on, { untracked: true })) return false;
  return (await commitsMainLacks(main, branch, project.on)) > 0;
}

// Checks every reason not to merge before changing anything; returns the main checkout, { path, branch }.
/**
 * @param {string} branch
 * @param {Project} project
 * @returns {Promise<Checkout>}
 */
async function mergeableMain(branch, project) {
  const { on } = project;
  const { onApproval } = await approvalSettings(project);
  if (onApproval === "pull-request") {
    throw new MergeRefusal(`This repository merges through pull requests: merge ${branch}'s pull request instead.`);
  }
  const [main, ...linked] = await checkouts(project.root, on);
  if (!main) throw new MergeRefusal("Could not list the repository's checkouts.");
  if (!MAIN_BRANCHES.includes(main.branch)) {
    throw new MergeRefusal(`The main checkout (${main.path}) is on ${main.branch ?? "a detached HEAD"}, not main.`);
  }
  if (await changedFiles(main.path, on, { untracked: false })) {
    throw new MergeRefusal(`The main checkout (${main.path}) has uncommitted changes.`);
  }
  if (!(await git(main.path, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], on)).ok) {
    throw new MergeRefusal(`There is no local branch ${branch}.`);
  }
  const worktree = linked.find((checkout) => checkout.branch === branch);
  if (worktree && (await changedFiles(worktree.path, on, { untracked: true }))) {
    throw new MergeRefusal(`${branch}'s worktree (${worktree.path}) has uncommitted changes.`);
  }
  if ((await commitsMainLacks(main, branch, on)) === 0)
    throw new MergeRefusal(`${branch} has no commits that ${main.branch} lacks.`);
  return main;
}

/**
 * @param {string} branch
 * @param {Checkout} main
 * @param {string[]} conflicts
 * @param {string} error
 */
const uncleanMerge = (branch, main, conflicts, error) => {
  const detail = conflicts.length ? `: ${conflicts.join(", ")}` : error ? `: ${error.split("\n").pop()}` : "";
  return new MergeRefusal(`${branch} doesn't merge cleanly into ${main.branch}, so nothing was merged${detail}`);
};

// Throws the MergeRefusal mergeIssue would, without changing anything; returns the main checkout, { path, branch }.
/**
 * @param {Issue} issue
 * @param {Project} project
 */
export async function checkMerge(issue, project) {
  const { branch } = issue;
  if (!branch) throw new MergeRefusal(`${issue.id} has no branch.`);
  const main = await mergeableMain(branch, project);
  const trialMerge = await git(
    main.path,
    ["merge-tree", "--write-tree", "--name-only", "--no-messages", main.branch, branch],
    project.on,
  );
  if (!trialMerge.ok)
    throw uncleanMerge(branch, main, trialMerge.out.split("\n").slice(1).filter(Boolean), trialMerge.err);
  return main;
}

// Merges the issue's branch into main with a merge commit, then marks the issue done, tells every panel, and with
// pushAfterMerge pushes main. A conflicting merge is aborted, leaving the main checkout as it was. Returns
// { mainBranch, pushed }, the main branch's name and whether it was pushed.
/**
 * @param {Issue} issue
 * @param {Tracker} tracker
 * @param {Project} project
 */
export async function mergeIssue(issue, tracker, project) {
  const { branch } = issue,
    { on } = project;
  const main = await checkMerge(issue, project);
  const merged = await git(main.path, ["merge", "--no-ff", "--no-edit", "-m", `Merge branch '${branch}'`, branch], on);
  if (!merged.ok) {
    const conflicts = (await git(main.path, ["diff", "--name-only", "--diff-filter=U"], on)).out
      .split("\n")
      .filter(Boolean);
    await git(main.path, ["merge", "--abort"], on);
    throw uncleanMerge(branch, main, conflicts, merged.err);
  }
  const marking = await tracker.update(issue, { status: "done" }).then(
    /** @returns {Error | null} */ () => null,
    (error) => error,
  );
  await announceIssueChange();
  const { pushAfterMerge } = await approvalSettings(project);
  const pushProblem = pushAfterMerge ? await pushMain(main, on) : null;
  const problems = [
    ...(marking ? [`could not mark ${issue.id} done: ${marking.message ?? marking}`] : []),
    ...(pushProblem ? [`could not push ${main.branch}: ${pushProblem}`] : []),
  ];
  if (problems.length)
    throw new MergedWithProblems(`Merged ${branch} into ${main.branch}, but ${problems.join("; and ")}`);
  return { mainBranch: main.branch, pushed: pushAfterMerge };
}

// Pushes the main checkout's branch to the remote it tracks; returns why it couldn't, or null once it's pushed.
/**
 * @param {Checkout} main
 * @param {string | null | undefined} on
 */
async function pushMain(main, on) {
  const remote = (await git(main.path, ["config", "--get", `branch.${main.branch}.remote`], on)).out;
  if (!remote) return `${main.branch} has no upstream remote`;
  const pushed = await git(main.path, ["push", remote, main.branch], on);
  if (pushed.ok) return null;
  const reason = pushed.err.split("\n").filter((/** @type {string} */ line) => line && !line.startsWith("hint:"));
  return reason.join(" ") || "git push failed";
}
