import { exec, hc, spaces, panes, agents } from "herdr";

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

function spaceShowing(path, on) {
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

export async function hasUncommittedChanges({ path, on }) {
  const status = await git(path, ["--no-optional-locks", "status", "--porcelain"], on);
  return !status.ok || status.out !== "";
}

// Whether the branch is already part of what the main checkout has out.
export async function isMerged({ branch, main, on }) {
  return (await git(main.path, ["merge-base", "--is-ancestor", `refs/heads/${branch}`, "HEAD"], on)).ok;
}

// Shared work goes through pull requests: the repository has a remote and someone else has committed to it.
export async function isCollaborative({ main, on }) {
  const remotes = await git(main.path, ["remote"], on);
  if (!remotes.out) return false;
  const [me, authors] = await Promise.all([
    git(main.path, ["config", "user.email"], on),
    git(main.path, ["log", "--format=%ae", "--max-count=1000", "HEAD"], on),
  ]);
  const myEmail = me.out.toLowerCase();
  return authors.out.split("\n").some((email) => email && email.toLowerCase() !== myEmail);
}

const MAIN_BRANCHES = ["main", "master"];

// Leaves the main checkout as it was when the merge can't finish on its own.
export async function mergeIntoMain({ branch, main, on }) {
  if (!MAIN_BRANCHES.includes(main.branch)) throw new Error(`The main checkout is on ${main.branch ?? "a detached HEAD"}, not main`);
  const merge = await git(main.path, ["merge", "--no-edit", branch], on);
  if (merge.ok) return;
  await git(main.path, ["merge", "--abort"], on);
  throw new Error(`Could not merge ${branch} into ${main.branch}: ${merge.err || merge.out}`);
}

// Where the branch was last pushed: its upstream, else origin's branch of the same name.
async function pushedCommit({ root, branch, on }) {
  const upstream = await git(root, ["rev-parse", `${branch}@{upstream}`], on);
  return upstream.ok ? upstream : git(root, ["rev-parse", `refs/remotes/origin/${branch}`], on);
}

export async function isPushed({ root, branch, on }) {
  const [local, pushed] = await Promise.all([git(root, ["rev-parse", `refs/heads/${branch}`], on), pushedCommit({ root, branch, on })]);
  return local.ok && pushed.ok && local.out === pushed.out;
}

// The branch's pull request once its latest commit is pushed: { state, url }, else null.
export async function pullRequestFor({ root, branch, on }) {
  if (!await isPushed({ root, branch, on })) return null;
  const view = await exec("gh", ["pr", "view", branch, "--json", "state,url"], { cwd: root, on }).catch(() => null);
  const pullRequest = view?.code === 0 ? JSON.parse(view.stdout) : null;
  return ["OPEN", "MERGED"].includes(pullRequest?.state) ? pullRequest : null;
}

const isClaude = (agent) => agent.program?.key === "claude";

// Sends the message to a Claude session already open in the worktree's space. Returns whether it went.
export async function askClaude(worktree, message) {
  const session = worktree.space && agents().find((agent) => agent.space === worktree.space.id && isClaude(agent));
  return Boolean(session) && (await hc(["send", session.address, message]).catch(() => null))?.code === 0;
}

const lines = (text) => text.split("\n").filter(Boolean);

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
