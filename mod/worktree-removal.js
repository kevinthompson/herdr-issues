// Removing a linked worktree and closing the space showing it: WorktreeRemoval runs removal.js's checks and removes
// the checkout, for the remove-worktree dialog (worktree-dialog.js) to show.

import { exec, run, spaces, panes, terminals, openOverlay } from "herdr";
import { branchState, checkouts } from "./worktree.js";
import { checksAnswered, removalFindings, removesWithoutAsking, runChecks, sessionComplete, PASS } from "./removal.js";

// Opens the dialog that removes the space's worktree and closes the space.
export function openRemovalDialog(spaceId, { ask = false } = {}) {
  openOverlay({ mod: "issues", kind: "dialog", width: 440, height: 320, props: { space: spaceId, action: "remove", ask } });
}

// Where a space is now: its first terminal's live folder, else where it was made.
export function place(space, paneList = panes()) {
  if (!space) return null;
  const tabs = new Set((space.tabs ?? []).map((tab) => tab.id));
  return paneList.find((pane) => tabs.has(pane.tab) && pane.cwd)?.cwd || space.folder || null;
}

export async function git(cwd, args, on) {
  const result = await exec("git", args, { cwd, on });
  return { ok: result.code === 0, out: (result.stdout ?? "").trim(), err: (result.stderr ?? result.stdout ?? "").trim() };
}

// The repo a folder belongs to: its main checkout and name, and whether
// the folder is itself a linked worktree. null outside git.
export async function repoOf(folder, on) {
  const top = await git(folder, ["rev-parse", "--show-toplevel"], on);
  const common = await git(folder, ["rev-parse", "--path-format=absolute", "--git-common-dir"], on);
  if (!top.ok || !common.ok) return null;
  const main = common.out.endsWith("/.git") ? common.out.slice(0, -5) : common.out;
  return { top: top.out, main, name: main.split("/").pop(), linked: main !== top.out };
}

// The submodule repos git keeps for a checkout (nested ones too, checked out
// or not): { name, dir, pinned }. `config` is the args that read its
// .gitmodules; `pinned` is the commit its parent records ("" if none).
async function modules(gitDir, config, on, out = [], parent = "") {
  const keys = await git(gitDir, ["--git-dir", gitDir, "config", ...config, "-z", "--get-regexp", "^submodule\\..*\\.path$"], on);
  if (!keys.ok) return out; // no .gitmodules, or no submodules in it
  // -z: "key\nvalue" records ended by NUL, so names and paths may hold spaces.
  for (const record of keys.out.split("\0").filter(Boolean)) {
    const at = record.indexOf("\n");
    const name = record.slice("submodule.".length, at - ".path".length);
    const dir = `${gitDir}/modules/${name}`;
    if (!(await git(gitDir, ["--git-dir", dir, "rev-parse", "--git-dir"], on)).ok) continue; // never checked out
    const pinned = await git(gitDir, ["--git-dir", gitDir, "rev-parse", `HEAD:${record.slice(at + 1)}`], on);
    // Names are only unique within their parent: nested ones carry its name.
    out.push({ name: parent + name, dir, pinned: pinned.ok ? pinned.out : "" });
    if ((await git(gitDir, ["--git-dir", dir, "cat-file", "-e", "HEAD:.gitmodules"], on)).ok) await modules(dir, ["--blob", "HEAD:.gitmodules"], on, out, `${parent + name}/`);
  }
  return out;
}

// Whether a checkout has uncommitted changes.
async function uncommitted(top, on) {
  const status = await git(top, ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain"], on);
  if (!status.ok) throw new Error(status.err || "git status failed.");
  return status.out !== "";
}

// The worktree's submodules, and the names of those with commits that exist
// nowhere else: not on a remote, and not the commit the parent pins (git
// fetches that by hash, so it is often on no remote branch here).
async function submodules(top, on) {
  const gitDir = await git(top, ["rev-parse", "--absolute-git-dir"], on);
  if (!gitDir.ok) throw new Error(gitDir.err || "git rev-parse failed.");
  const mods = await modules(gitDir.out, ["--file", `${top}/.gitmodules`], on);
  const unpushed = [];
  for (const m of mods) {
    const local = await git(gitDir.out, ["--git-dir", m.dir, "rev-list", "-n1", "--all", "--not", "--remotes", ...(m.pinned ? [m.pinned] : [])], on);
    if (!local.ok) throw new Error(local.err || `Couldn't check submodule ${m.name}.`);
    if (local.out) unpushed.push(m.name);
  }
  return { mods, unpushed };
}

// The other spaces the sidebar nests under this one, which closing it closes too: when the space shows or starts
// in the repository's main checkout, every other space showing one of its linked worktrees.
async function nestedWorktreeSpaces(space, repo, on) {
  const [main, ...linked] = await checkouts(repo.main, on);
  const paneList = panes();
  const inside = (folder, path) => folder === path || Boolean(folder?.startsWith(`${path}/`));
  const inLinked = (folder) => linked.some((checkout) => inside(folder, checkout.path));
  const inMain = (folder) => Boolean(main) && inside(folder, main.path) && !inLinked(folder);
  if (!inMain(place(space, paneList)) && !inMain(space.folder)) return [];
  return spaces().filter((other) => other.id !== space.id && (other.machine ?? null) === (on ?? null) && inLinked(place(other, paneList)));
}

// One space's removal: the checks removal.js reads, each filled in as it answers, and the spaces nested under it.
export class WorktreeRemoval {
  constructor(space, repo) {
    this.space = space;
    this.repo = repo;
    this.on = space.machine;
    this.checks = { complete: sessionComplete(space, panes(), terminals()) };
    this.nestedSpaces = null;
    this.listeners = new Set();
    this.finished = Promise.all([
      runChecks({
        dirty: () => uncommitted(repo.top, this.on),
        submodules: async () => (await submodules(repo.top, this.on)).unpushed,
        branch: () => branchState(repo, this.on),
      }, this.checks, (name, result) => { this.checks[name] = result; this.changed(); }),
      nestedWorktreeSpaces(space, repo, this.on).catch(() => []).then((nested) => { this.nestedSpaces = nested; this.changed(); }),
    ]).then(() => {});
  }

  // Calls `listener` whenever a check answers, until the returned function is called.
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed() {
    for (const listener of this.listeners) listener();
  }

  answered() {
    return checksAnswered(this.checks) && this.nestedSpaces !== null;
  }

  // Whether something found so far needs the person to look: a finding that didn't pass, or a nested space.
  foundProblem() {
    return this.nestedSpaces?.length > 0 || removalFindings(this.checks).some((finding) => finding.result !== PASS);
  }

  removesWithoutAsking({ ask = false, warning } = {}) {
    return this.answered() && removesWithoutAsking({ ...this.checks, warning }, this.nestedSpaces.length, { ask });
  }

  // Closes the space and removes the checkout: "" once done, else what went wrong.
  async remove() {
    const { space, repo, on, checks } = this;
    const dirty = await uncommitted(repo.top, on);
    // git refuses a worktree with submodules unless forced, because their
    // history goes with it. The checks already showed what's at risk; only
    // risk that appeared since they ran gets one more warning.
    const { mods, unpushed } = await submodules(repo.top, on);
    const shown = Array.isArray(checks.submodules) ? checks.submodules : [];
    const changed = (dirty && checks.dirty !== true) || unpushed.some((name) => !shown.includes(name));
    if (dirty) checks.dirty = true;
    if (changed) checks.submodules = [...new Set([...shown, ...unpushed])];
    if (changed) return "It changed since this opened. Enter again removes it anyway.";
    // Terminals first: a shell sitting in the folder keeps it busy on Windows.
    run("space.close", { id: space.id, confirmed: true });
    const force = dirty || mods.length > 0;
    // A set-up checkout (gems, node_modules) holds hundreds of thousands of
    // files and takes git tens of seconds to delete. Rename it to a hidden
    // sibling instead (instant, same volume), let git forget it, and delete
    // it in the background. Submodules keep git's remove, which guards their history.
    if (mods.length === 0) {
      const aside = await exec("sh", ["-c", 'to="$(dirname "$1")/.$(basename "$1").removing-$$" && mv "$1" "$to" && echo "$to"', "sh", repo.top], { on });
      if (aside.code === 0) {
        await git(repo.main, ["worktree", "prune"], on);
        exec("sh", ["-c", 'nohup rm -rf "$1" >/dev/null 2>&1 &', "sh", aside.stdout.trim()], { on });
        return "";
      }
    }
    const result = await git(repo.main, ["worktree", "remove", ...(force ? ["--force"] : []), repo.top], on);
    return result.ok ? "" : result.err || "git worktree remove failed.";
  }
}
