import { exec, spaces, panes, run } from "herdr";

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

export const FINISHED_MARK = "✅ ";
const PULL_REQUEST_REUSE_MS = 60 * 1000;
const PASSING_CONCLUSIONS = ["SUCCESS", "NEUTRAL", "SKIPPED"];

const checkPasses = (check) => check.__typename === "StatusContext"
  ? check.state === "SUCCESS"
  : check.status === "COMPLETED" && PASSING_CONCLUSIONS.includes(check.conclusion);

// Asked at most once a minute per branch and commit, since checks can finish without the branch moving.
const pullRequestAnswers = new Map();

// Whether the branch has an open pull request, draft or not, whose checks have all passed.
async function openPullRequestPasses(worktree, head) {
  const key = `${worktree.path}\n${worktree.branch}\n${head}`, last = pullRequestAnswers.get(key);
  if (last && Date.now() - last.at < PULL_REQUEST_REUSE_MS) return last.passes;
  const result = await exec("gh", ["pr", "view", worktree.branch, "--json", "state,statusCheckRollup"], { cwd: worktree.path }).catch(() => null);
  const pullRequest = result?.code === 0 ? JSON.parse(result.stdout) : null;
  const passes = pullRequest?.state === "OPEN" && (pullRequest.statusCheckRollup ?? []).every(checkPasses);
  pullRequestAnswers.set(key, { at: Date.now(), passes });
  return passes;
}

// A branch that never moved since it was made holds no work, even though main contains it.
async function branchMoved(worktree) {
  const reflog = await git(worktree.path, ["reflog", "show", "--format=%H", `refs/heads/${worktree.branch}`], worktree.on);
  return lines(reflog.out).length > 1;
}

// The worktree's work is ready to close: nothing uncommitted, and its branch merged into main, or pushed
// with an open pull request whose checks pass. Pull requests are only asked about on this computer.
export async function workFinished(worktree, main) {
  if (!worktree.branch) return false;
  const { path, on, branch } = worktree;
  const [status, head] = await Promise.all([git(path, ["status", "--porcelain"], on), git(path, ["rev-parse", "HEAD"], on)]);
  if (!status.ok || status.out || !head.ok) return false;
  if ((await git(path, ["merge-base", "--is-ancestor", "HEAD", main.branch], on)).ok) return branchMoved(worktree);
  if (on != null) return false;
  const unpushed = await git(path, ["rev-list", "--count", `refs/remotes/origin/${branch}..HEAD`], on);
  return unpushed.ok && unpushed.out === "0" && openPullRequestPasses(worktree, head.out);
}

export const withoutFinishedMark = (name) => name.startsWith(FINISHED_MARK) ? name.slice(FINISHED_MARK.length) : name;

// The spaces made on the worktree, by `wt` or Continue: their own folder is in it, so the main checkout's space
// never counts, even while one of its panes is in a worktree.
const spacesOn = (worktree) => spaces().filter((space) =>
  (space.machine ?? null) === (worktree.on ?? null) && isInside(space.folder, worktree.path));

// Starts the name of each space on one of the repository's linked worktrees with the finished mark exactly
// while `finished(worktree, space)` says its work is ready to close, keeping the rest of the name.
export async function markFinishedSpaces(repository, finished) {
  for (const worktree of repository.worktrees) {
    const shown = spacesOn(worktree);
    if (!shown.length) continue;
    const isFinished = await finished(worktree, shown[0]).catch(() => false);
    for (const space of shown) {
      const unmarked = withoutFinishedMark(space.name);
      const name = isFinished ? `${FINISHED_MARK}${unmarked}` : unmarked;
      if (name !== space.name) run("space.rename", { id: space.id, name });
    }
  }
}
