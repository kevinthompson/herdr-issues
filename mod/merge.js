// Merges an issue's branch into main in the repository's main checkout and marks the issue done, for repositories
// whose work lands locally (onApproval "merge"). `issues merge` and the issue view's Merge button both run
// mergeIssue, which changes nothing and throws a MergeRefusal saying why when the merge can't go cleanly.
import { exec } from "herdr";
import { checkouts, MAIN_BRANCHES } from "./worktree.js";
import { landingSettings } from "./trackers/setting.js";
import { announceIssueChange } from "./changes.js";

export class MergeRefusal extends Error {}

async function git(cwd, args, on) {
  const result = await exec("git", args, { cwd, on }).catch(() => null);
  return { ok: result?.code === 0, out: (result?.stdout ?? "").trim(), err: (result?.stderr ?? "").trim() };
}

const changedFiles = async (path, on, { untracked }) =>
  (await git(path, ["status", "--porcelain", `--untracked-files=${untracked ? "normal" : "no"}`], on)).out;

const commitsMainLacks = async (main, branch, on) =>
  Number((await git(main.path, ["rev-list", "--count", `${main.branch}..${branch}`], on)).out) || 0;

// Whether the issue view offers to merge `branch`: the repository merges locally, and the branch's worktree has
// commits main lacks and nothing uncommitted. Anything mergeIssue checks besides is reported when it's clicked.
export async function canOfferMerge(branch, project) {
  if (!branch || project.on != null) return false;
  const { onApproval } = await landingSettings(project).catch(() => ({ onApproval: null }));
  if (onApproval !== "merge") return false;
  const [main, ...linked] = await checkouts(project.root, project.on);
  const worktree = linked.find((checkout) => checkout.branch === branch);
  if (!main || !worktree || !MAIN_BRANCHES.includes(main.branch)) return false;
  if (await changedFiles(worktree.path, project.on, { untracked: true })) return false;
  return await commitsMainLacks(main, branch, project.on) > 0;
}

// Checks every reason not to merge before changing anything; returns the main checkout, { path, branch }.
async function mergeableMain(branch, project) {
  const { on } = project;
  const { onApproval } = await landingSettings(project);
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
  if (worktree && await changedFiles(worktree.path, on, { untracked: true })) {
    throw new MergeRefusal(`${branch}'s worktree (${worktree.path}) has uncommitted changes.`);
  }
  if (await commitsMainLacks(main, branch, on) === 0) throw new MergeRefusal(`${branch} has no commits that ${main.branch} lacks.`);
  return main;
}

// Merges the issue's branch into main with a merge commit, then marks the issue done and tells every panel.
// A conflicting merge is aborted, leaving the main checkout as it was. Returns the main branch's name.
export async function mergeIssue(issue, tracker, project) {
  const { branch } = issue, { on } = project;
  if (!branch) throw new MergeRefusal(`${issue.id} has no branch.`);
  const main = await mergeableMain(branch, project);
  const merged = await git(main.path, ["merge", "--no-ff", "--no-edit", "-m", `Merge branch '${branch}'`, branch], on);
  if (!merged.ok) {
    const conflicts = (await git(main.path, ["diff", "--name-only", "--diff-filter=U"], on)).out.split("\n").filter(Boolean);
    await git(main.path, ["merge", "--abort"], on);
    const detail = conflicts.length ? `: ${conflicts.join(", ")}` : merged.err ? `: ${merged.err.split("\n").pop()}` : "";
    throw new MergeRefusal(`${branch} doesn't merge cleanly into ${main.branch}, so nothing was merged${detail}`);
  }
  const marking = await tracker.update(issue, { status: "done" }).then(() => null, (error) => error);
  await announceIssueChange();
  if (marking) throw new Error(`Merged ${branch} into ${main.branch}, but could not mark ${issue.id} done: ${marking.message ?? marking}`);
  return main.branch;
}
