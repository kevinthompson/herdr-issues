import { exec, spaces, panes } from "herdr";

async function git(cwd, args, on) {
  const result = await exec("git", args, { cwd, on }).catch(() => null);
  return { ok: result?.code === 0, out: (result?.stdout ?? "").trim() };
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

// The space showing the worktree checked out on `branch`, when removing it loses nothing: the
// worktree has no uncommitted changes and the branch is merged into what the main checkout has out.
export async function removableWorktreeSpace(branch, { root, on }) {
  if (!branch) return null;
  const [main, ...linked] = await checkouts(root, on);
  const worktree = linked.find((checkout) => checkout.branch === branch);
  if (!main || !worktree) return null;
  const status = await git(worktree.path, ["--no-optional-locks", "status", "--porcelain"], on);
  if (!status.ok || status.out) return null;
  const merged = await git(main.path, ["merge-base", "--is-ancestor", `refs/heads/${branch}`, "HEAD"], on);
  return merged.ok ? spaceShowing(worktree.path, on) : null;
}
