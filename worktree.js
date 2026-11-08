import { exec, spaces, panes } from "herdr";

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
