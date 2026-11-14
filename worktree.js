import { exec, spaces, panes } from "herdr";
import { mergeSettings } from "./trackers/setting.js";

async function git(cwd, args, on) {
  const result = await exec("git", args, { cwd, on }).catch(() => null);
  return { ok: result?.code === 0, out: (result?.stdout ?? "").trim(), err: (result?.stderr ?? "").trim() };
}

// Every checkout of the repository, the main one first: { path, branch }.
async function checkouts(root, on) {
  const listing = await git(root, ["worktree", "list", "--porcelain"], on);
  if (!listing.ok) return [];
  return listing.out.split(/\n\n+/).map((block) => ({
    path: /^worktree (.*)$/m.exec(block)?.[1],
    branch: /^branch refs\/heads\/(.*)$/m.exec(block)?.[1] ?? null,
  })).filter((checkout) => checkout.path);
}

const isInside = (folder, path) => folder === path || folder?.startsWith(`${path}/`);

export function spaceShowing(path, on) {
  const paneList = panes();
  return spaces().find((space) => {
    if ((space.machine ?? null) !== (on ?? null)) return false;
    const tabs = new Set(space.tabs.map((tab) => tab.id));
    const folder = paneList.find((pane) => tabs.has(pane.tab) && pane.cwd)?.cwd ?? space.folder;
    return isInside(folder, path);
  }) ?? null;
}

// The linked worktree checked out on `branch`: { path, branch, on, main: the main checkout, space }.
export async function worktreeFor(branch, { root, on }) {
  if (!branch) return null;
  const [main, ...linked] = await checkouts(root, on);
  const worktree = linked.find((checkout) => checkout.branch === branch);
  if (!main || !worktree) return null;
  return { ...worktree, on, main, space: spaceShowing(worktree.path, on) };
}

const lines = (text) => text.split("\n").filter(Boolean);
const MAIN_BRANCHES = ["main", "master"];

// What the repository holds for the listed issues:
// - worktrees: its linked worktrees;
// - mergedFinished: done issues' local branches already in main that no checkout has out.
// null outside a repository, or when the main checkout isn't on main, since "merged" means merged into main.
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
export async function deleteMergedBranches(branches, { main, on }) {
  const deleted = [];
  for (const branch of branches) if ((await git(main.path, ["branch", "-d", branch], on)).ok) deleted.push(branch);
  return deleted;
}

// The space showing the branch's worktree right now, or null.
export function worktreeSpace(repository, branch) {
  const worktree = branch && repository?.worktrees.find((each) => each.branch === branch);
  return worktree ? spaceShowing(worktree.path, worktree.on) : null;
}

// Whether merging HEAD into `base` would change nothing, which also catches squash merges and an
// untouched branch.
export async function isMergedInto(repo, base, on) {
  const [mergedTree, baseTree] = await Promise.all([
    git(repo.top, ["merge-tree", "--write-tree", base, "HEAD"], on),
    git(repo.top, ["rev-parse", `${base}^{tree}`], on),
  ]);
  return mergedTree.ok && baseTree.ok && mergedTree.out.split("\n")[0] === baseTree.out;
}

// The URL of the branch's open or draft pull request when the repository counts a pushed branch with one as
// complete, else null: also when the settings can't be read or gh can't answer, so the dialog asks for main.
async function completingPullRequest(repo, branch, on) {
  const { complete } = await mergeSettings({ root: repo.main, on }).catch(() => ({ complete: "merged" }));
  if (complete !== "pull-request-open") return null;
  const view = await exec("gh", ["pr", "view", branch, "--json", "state,url"], { cwd: repo.top, on }).catch(() => null);
  if (view?.code !== 0) return null;
  try {
    const pullRequest = JSON.parse(view.stdout);
    return pullRequest.state === "OPEN" ? pullRequest.url : null;
  } catch { return null; }
}

// What removing a checkout would leave unsaved on its branch: { branch, bases, mergedInto, unpushed, pullRequest },
// or null on a detached HEAD. The work is kept once it's merged into either the local default branch
// (repos merged locally) or origin's, fetched just now (repos merged through pull requests):
// `bases` lists those that exist, and `mergedInto` is the first one holding the branch, else null.
// Unpushed counts commits on no origin branch, null without origin. pullRequest is completingPullRequest's.
export async function branchState(repo, on) {
  const branch = (await git(repo.top, ["branch", "--show-current"], on)).out;
  if (!branch) return null;
  const pullRequestLookup = completingPullRequest(repo, branch, on);
  const hasOrigin = (await git(repo.top, ["remote", "get-url", "origin"], on)).ok;
  let remoteBase = null;
  if (hasOrigin) {
    const head = await git(repo.top, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], on);
    remoteBase = head.ok ? head.out : "origin/main";
    await git(repo.top, ["fetch", "-q", "origin", remoteBase.slice("origin/".length)], on);
  }
  const localCandidates = remoteBase ? [remoteBase.slice("origin/".length)] : ["main", "master"];
  const exists = async (ref) => (await git(repo.top, ["rev-parse", "--verify", "--quiet", ref], on)).ok;
  const bases = [];
  for (const base of [...localCandidates, remoteBase].filter(Boolean)) if (await exists(base)) bases.push(base);
  const merged = await Promise.all(bases.map((base) => isMergedInto(repo, base, on)));
  const mergedInto = bases.find((_base, index) => merged[index]) ?? null;
  const unpushed = hasOrigin ? Number((await git(repo.top, ["rev-list", "--count", "HEAD", "--not", "--remotes=origin"], on)).out) || 0 : null;
  return { branch, bases, mergedInto, unpushed, pullRequest: await pullRequestLookup };
}
