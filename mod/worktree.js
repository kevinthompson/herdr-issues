// A repository's checkouts: the worktree a branch is checked out in and the space showing it, whether a folder
// is a linked worktree, and whether a branch has merged into main.

/**
 * @import { ExecResult, SpaceInfo } from "herdr"
 * @import { Issue, Project } from "./trackers/index.js"
 * @typedef {{ path: string, branch: string | null }} Checkout
 * @typedef {{ top: string, main: string }} WorktreeRepo
 * @typedef {Awaited<ReturnType<typeof repositoryState>>} RepositoryState
 */
import { exec, spaces, panes } from "herdr";
import { approvalSettings } from "./trackers/setting.js";

/**
 * @param {string} cwd
 * @param {string[]} args
 * @param {string | null} [on]
 */
async function git(cwd, args, on) {
  const result = await exec("git", args, { cwd, on }).catch(/** @returns {ExecResult | null} */ () => null);
  return { ok: result?.code === 0, out: (result?.stdout ?? "").trim(), err: (result?.stderr ?? "").trim() };
}

// Every checkout of the repository, the main one first: { path, branch }.
/**
 * @param {string} root
 * @param {string | null} [on]
 * @returns {Promise<Checkout[]>}
 */
export async function checkouts(root, on) {
  const listing = await git(root, ["worktree", "list", "--porcelain"], on);
  if (!listing.ok) return [];
  return listing.out
    .split(/\n\n+/)
    .map((block) => ({
      path: /^worktree (.*)$/m.exec(block)?.[1],
      branch: /^branch refs\/heads\/(.*)$/m.exec(block)?.[1] ?? null,
    }))
    .filter((checkout) => checkout.path);
}

/**
 * @param {string | null} folder
 * @param {string} path
 */
const isInside = (folder, path) => folder === path || folder?.startsWith(`${path}/`);

/**
 * @param {string} path
 * @param {string | null} [on]
 * @returns {SpaceInfo | null}
 */
export function spaceShowing(path, on) {
  const paneList = panes();
  return (
    spaces().find((space) => {
      if ((space.machine ?? null) !== (on ?? null)) return false;
      const tabs = new Set(space.tabs.map((tab) => tab.id));
      const folder = paneList.find((pane) => tabs.has(pane.tab) && pane.cwd)?.cwd ?? space.folder;
      return isInside(folder, path);
    }) ?? null
  );
}

// The linked worktree checked out on `branch`: { path, branch, on, main: the main checkout, space }.
/**
 * @param {string | null} branch
 * @param {Project} project
 */
export async function worktreeFor(branch, { root, on }) {
  if (!branch) return null;
  const [main, ...linked] = await checkouts(root, on);
  const worktree = linked.find((checkout) => checkout.branch === branch);
  if (!main || !worktree) return null;
  return { ...worktree, on, main, space: spaceShowing(worktree.path, on) };
}

// Whether `folder` is in a linked worktree rather than a repository's main checkout.
/**
 * @param {string | null} folder
 * @param {string | null} [on]
 */
export async function isLinkedWorktree(folder, on) {
  if (!folder) return false;
  /** @param {string} option */
  const revParse = (option) => git(folder, ["rev-parse", "--path-format=absolute", option], on);
  const [top, common] = await Promise.all([revParse("--show-toplevel"), revParse("--git-common-dir")]);
  return top.ok && common.ok && common.out !== `${top.out}/.git`;
}

/** @param {string} text */
const lines = (text) => text.split("\n").filter(Boolean);
export const MAIN_BRANCHES = ["main", "master"];

// What the repository holds for the listed issues:
// - worktrees: its linked worktrees;
// - mergedFinished: done issues' local branches already in main that no checkout has out.
// null outside a repository, or when the main checkout isn't on main, since "merged" means merged into main.
/**
 * @param {Issue[]} issues
 * @param {Project} project
 */
export async function repositoryState(issues, { root, on }) {
  const [main, ...linked] = await checkouts(root, on);
  if (!main || !MAIN_BRANCHES.includes(main.branch)) return null;
  const worktrees = linked.map((checkout) => ({ ...checkout, on }));
  const mergedBranches = await git(main.path, ["branch", "--merged", "HEAD", "--format=%(refname:short)"], on);
  const merged = new Set(lines(mergedBranches.out));
  const checkedOut = new Set([main.branch, ...linked.map((checkout) => checkout.branch)]);
  const mergedFinished = issues
    .filter((issue) => issue.status === "done" && merged.has(issue.branch) && !checkedOut.has(issue.branch))
    .map((issue) => issue.branch);
  return { main, on, worktrees, mergedFinished };
}

// Deletes local branches already merged into the main checkout's HEAD; git refuses any that aren't.
// Returns the ones deleted.
/**
 * @param {string[]} branches
 * @param {{ main: Checkout, on?: string | null }} repository
 */
export async function deleteMergedBranches(branches, { main, on }) {
  /** @type {string[]} */
  const deleted = [];
  for (const branch of branches) if ((await git(main.path, ["branch", "-d", branch], on)).ok) deleted.push(branch);
  return deleted;
}

// The space showing the branch's worktree right now, or null.
/**
 * @param {RepositoryState | null | undefined} repository
 * @param {string | null} branch
 */
export function worktreeSpace(repository, branch) {
  const worktree = branch && repository?.worktrees.find((each) => each.branch === branch);
  return worktree ? spaceShowing(worktree.path, worktree.on) : null;
}

// Whether merging HEAD into `base` would change nothing, which also catches squash merges and an
// untouched branch.
/**
 * @param {WorktreeRepo} repo
 * @param {string} base
 * @param {string | null} [on]
 */
export async function isMergedInto(repo, base, on) {
  const [mergedTree, baseTree] = await Promise.all([
    git(repo.top, ["merge-tree", "--write-tree", base, "HEAD"], on),
    git(repo.top, ["rev-parse", `${base}^{tree}`], on),
  ]);
  return mergedTree.ok && baseTree.ok && mergedTree.out.split("\n")[0] === baseTree.out;
}

// The URL of the branch's open or draft pull request when the repository's approved work opens pull requests
// (onApproval "pull-request"), so a pushed branch with one is safe to remove, else null: also when the settings
// can't be read or gh can't answer, so the dialog asks for main.
/**
 * @param {WorktreeRepo} repo
 * @param {string} branch
 * @param {string | null} [on]
 * @returns {Promise<string | null>}
 */
async function completingPullRequest(repo, branch, on) {
  const { onApproval } = await approvalSettings({ root: repo.main, on }).catch(() => ({ onApproval: "merge" }));
  if (onApproval !== "pull-request") return null;
  const view = await exec("gh", ["pr", "view", branch, "--json", "state,url"], { cwd: repo.top, on }).catch(
    /** @returns {ExecResult | null} */ () => null,
  );
  if (view?.code !== 0) return null;
  try {
    const pullRequest = JSON.parse(view.stdout);
    return pullRequest.state === "OPEN" ? pullRequest.url : null;
  } catch {
    return null;
  }
}

// What removing a checkout would leave unsaved on its branch: { branch, bases, mergedInto, unpushed, pullRequest },
// or null on a detached HEAD. The work is kept once it's merged into either the local default branch
// (repos merged locally) or origin's (repos merged through pull requests): `bases` lists those that exist, and
// `mergedInto` is the first one holding the branch, else null. Only a branch the local default branch doesn't
// hold waits on the network: origin's default branch is fetched, and pullRequest is completingPullRequest's;
// otherwise pullRequest is null. Unpushed counts commits on no origin branch, null without origin.
/**
 * @param {WorktreeRepo} repo
 * @param {string | null} [on]
 */
export async function branchState(repo, on) {
  const branch = (await git(repo.top, ["branch", "--show-current"], on)).out;
  if (!branch) return null;
  const hasOrigin = (await git(repo.top, ["remote", "get-url", "origin"], on)).ok;
  /** @type {string | null} */
  let remoteBase = null;
  if (hasOrigin) {
    const head = await git(repo.top, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], on);
    remoteBase = head.ok ? head.out : "origin/main";
  }
  /** @param {string[]} refs */
  const existing = async (refs) => {
    const found = await Promise.all(refs.map((ref) => git(repo.top, ["rev-parse", "--verify", "--quiet", ref], on)));
    return refs.filter((_ref, index) => found[index].ok);
  };
  /** @param {string[]} bases */
  const firstHolding = async (bases) => {
    const merged = await Promise.all(bases.map((base) => isMergedInto(repo, base, on)));
    return bases.find((_base, index) => merged[index]) ?? null;
  };
  const countUnpushed = async () =>
    hasOrigin
      ? Number((await git(repo.top, ["rev-list", "--count", "HEAD", "--not", "--remotes=origin"], on)).out) || 0
      : null;

  const localBases = await existing(remoteBase ? [remoteBase.slice("origin/".length)] : MAIN_BRANCHES);
  const mergedLocally = await firstHolding(localBases);
  if (mergedLocally) {
    const bases = [...localBases, ...(await existing(remoteBase ? [remoteBase] : []))];
    return { branch, bases, mergedInto: mergedLocally, unpushed: await countUnpushed(), pullRequest: null };
  }

  const pullRequestLookup = completingPullRequest(repo, branch, on);
  if (remoteBase) await git(repo.top, ["fetch", "-q", "origin", remoteBase.slice("origin/".length)], on);
  const remoteBases = await existing(remoteBase ? [remoteBase] : []);
  const bases = [...localBases, ...remoteBases];
  return {
    branch,
    bases,
    mergedInto: await firstHolding(remoteBases),
    unpushed: await countUnpushed(),
    pullRequest: await pullRequestLookup,
  };
}
