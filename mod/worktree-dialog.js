// Worktree dialog, a dialog of this mod with props { space, action: "new" | "open" | "remove" } or
// { folder, machine } for a repo without a space; optional { branch, name, tab, argv, task }, and { behind: true }
// to open the new worktree's space behind what's shown. Open names a new space on the main checkout with the
// repository's name setting (trackers/setting.js).
// Remove takes an optional { warning }: work outside the checkout that removing it would leave behind, and { ask }
// to wait for Enter whatever the checks find. It removes the checkout without asking when removesWithoutAsking
// (removal.js) says so, and otherwise waits for Enter.

import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar } from "gpui-base";
import { run, props, closeOverlay, theme, spaces, panes, terminals, exec, home, updates, openOverlay } from "herdr";
import { branchState, checkouts as repositoryCheckouts } from "./worktree.js";
import { openBehindArgs } from "./open-behind.js";
import { nameSettings } from "./trackers/setting.js";
import { checksAnswered, removalFindings, removalVerdict, removesWithoutAsking, runChecks, sessionComplete, PASS, LOSS } from "./removal.js";

// Opens the dialog that removes the space's worktree and closes the space.
export function openRemovalDialog(spaceId, { ask = false } = {}) {
  openOverlay({ mod: "issues", kind: "dialog", width: 440, height: 320, props: { space: spaceId, action: "remove", ask } });
}

// Where a space is now: its first terminal's live folder, else where it was made.
function place(s, all = panes()) {
  if (!s) return null;
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return all.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder || null;
}

// Checkouts go to <ROOT>/<repo>/<branch, slashes as dashes>.
const ROOT = (home) => `${home}/.herdr/worktrees`;
// Home as ~ (git says C:/Users/x where Windows says C:\Users\x).
const tilde = (path, userHome) => {
  const [p, h] = [path, userHome].map((s) => s.replace(/\\/g, "/"));
  return p.startsWith(h) ? `~${p.slice(h.length)}` : path;
};
const slug = (branch) => branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
const ago = (s) => {
  const d = Date.now() / 1000 - s;
  return d < 3600 ? `${Math.max(1, Math.round(d / 60))}m` : d < 86400 ? `${Math.round(d / 3600)}h` : d < 86400 * 60 ? `${Math.round(d / 86400)}d` : `${Math.round(d / 86400 / 30)}mo`;
};

// Every checkout of a repo (`git worktree list`), the main one first, then
// the most recently committed: { path, branch, main, at }.
async function checkouts(repo, on) {
  const list = await git(repo.main, ["worktree", "list", "--porcelain"], on);
  if (!list.ok) return [];
  const refs = await git(repo.main, ["for-each-ref", "--format=%(refname:short)%09%(committerdate:unix)", "refs/heads"], on);
  const when = new Map(refs.out.split("\n").map((l) => l.split("\t")).map(([b, at]) => [b, Number(at) || 0]));
  const out = [];
  for (const block of list.out.split(/\n\n+/)) {
    const lines = block.split("\n");
    const path = lines.find((l) => l.startsWith("worktree "))?.slice(9);
    if (!path || lines.some((l) => l === "bare" || l.startsWith("prunable"))) continue;
    const branch = lines.find((l) => l.startsWith("branch "))?.slice(7).replace(/^refs\/heads\//, "") ?? null;
    out.push({ path, branch, main: out.length === 0, at: branch ? (when.get(branch) ?? 0) : 0 });
  }
  return out.sort((a, b) => b.main - a.main || b.at - a.at);
}

// The space showing a checkout: its first terminal is in it (the deepest checkout wins).
function spaceOf(path, all, on, spaceList, paneList) {
  const inside = (p, dir) => p === dir || p.startsWith(dir + "/");
  return spaceList.find((s) => (s.machine ?? null) === (on ?? null) && (() => {
    const at = place(s, paneList)?.replace(/\\/g, "/");
    if (!at || !inside(at, path)) return false;
    return !all.some((c) => c.path !== path && c.path.length > path.length && inside(at, c.path));
  })());
}

async function git(cwd, args, on) {
  const r = await exec("git", args, { cwd, on });
  return { ok: r.code === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? r.stdout ?? "").trim() };
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

// Fetches the branch from origin, where work started elsewhere (another computer, a cloud
// agent) left it: { found }, or { error } when origin couldn't be asked.
async function remoteBranch(repo, branch, on) {
  if (!(await git(repo, ["remote", "get-url", "origin"], on)).ok) return { found: false };
  const fetched = await git(repo, ["fetch", "origin", `refs/heads/${branch}:refs/remotes/origin/${branch}`], on);
  if (fetched.ok) return { found: true };
  if (/couldn't find remote ref/i.test(fetched.err)) return { found: false };
  return { error: fetched.err || `Couldn't fetch ${branch} from origin.` };
}

// Where a new branch starts: origin's default branch, fetched just now, so new work never
// starts from a stale or unrelated checkout. "HEAD" in a repo without origin.
async function freshStart(repo, on) {
  if (!(await git(repo, ["remote", "get-url", "origin"], on)).ok) return { start: "HEAD" };
  const head = await git(repo, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], on);
  const start = head.ok ? head.out : "origin/main";
  const fetched = await git(repo, ["fetch", "origin", start.slice("origin/".length)], on);
  return fetched.ok ? { start } : { error: fetched.err || `Couldn't fetch ${start}.` };
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
  const [main, ...linked] = await repositoryCheckouts(repo.main, on);
  const paneList = panes();
  const inside = (folder, path) => folder === path || Boolean(folder?.startsWith(`${path}/`));
  const inLinked = (folder) => linked.some((checkout) => inside(folder, checkout.path));
  const inMain = (folder) => Boolean(main) && inside(folder, main.path) && !inLinked(folder);
  if (!inMain(place(space, paneList)) && !inMain(space.folder)) return [];
  return spaces().filter((other) => other.id !== space.id && (other.machine ?? null) === (on ?? null) && inLinked(place(other, paneList)));
}

// The repo a folder belongs to: its main checkout and name, and whether
// the folder is itself a linked worktree. null outside git.
async function repoOf(folder, on) {
  const top = await git(folder, ["rev-parse", "--show-toplevel"], on);
  const common = await git(folder, ["rev-parse", "--path-format=absolute", "--git-common-dir"], on);
  if (!top.ok || !common.ok) return null;
  const main = common.out.endsWith("/.git") ? common.out.slice(0, -5) : common.out;
  return { top: top.out, main, name: main.split("/").pop(), linked: main !== top.out };
}

export class WorktreeDialog {
  constructor(cx) {
    this.on = this.space()?.machine;
    this.userHome = this.on ? null : home();
    this.opening = props()?.action === "open";
    this.text = props()?.branch ?? "";
    this.list = undefined; // open: the checkouts, once read
    this.at = 0;
    this.input = InputState.new({ value: this.text, placeholder: this.opening ? "filter worktrees" : "branch name" });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); this.error = ""; this.at = 0; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.go(cx));
    this.inputFocused = true;
    this.input.on("focus", (_e, cx) => { this.inputFocused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.inputFocused = false; cx.notify(); });
    if (props()?.action !== "remove") {
      this.input.focus();
      cx.timer.after(600, () => this.input.focus());
    }
    this.busy = false;
    this.error = "";
    this.repo = undefined; // undefined: looking, null: not in git
    this.checks = {}; // remove: the checks removal.js reads, each filled in as it answers
    this.nestedSpaces = null; // remove: the spaces closing this one closes too, once looked up
    this.handle = cx.focus_handle();
    if (props()?.action === "remove") this.handle.focus();
    cx.spawn(async (cx) => {
      try {
        if (this.on) {
          let result;
          try { result = await exec("sh", ["-c", 'printf %s "$HOME"'], { on: this.on }); } catch {}
          if (!result || result.code !== 0 || !result.stdout.trim()) result = await exec("powershell.exe", ["-NoProfile", "-Command", "[Console]::Write($HOME)"], { on: this.on });
          if (result.code !== 0 || !result.stdout.trim()) throw new Error("Could not find the remote home folder.");
          this.userHome = result.stdout.trim().replace(/\\/g, "/");
        }
        this.folder = props()?.folder || place(this.space()) || this.userHome;
        const repo = await repoOf(this.folder, this.on);
        if (repo && this.opening) {
          [this.list, this.mainName] = await Promise.all([
            checkouts(repo, this.on),
            nameSettings({ root: repo.main, on: this.on }).then(({ name }) => name, () => null),
          ]);
        }
        this.repo = repo;
        cx.notify();
        if (repo?.linked && props().action === "remove") {
          await this.check(repo, cx);
          if (removesWithoutAsking({ ...this.checks, warning: props().warning }, this.nestedSpaces.length, { ask: props().ask })) await this.work(cx);
        }
        if (props().branch) await this.work(cx);
      } catch (error) { this.repo = null; this.error = String(error); cx.notify(); }
    });
  }

  // Runs removal's checks, showing each answer as it lands.
  async check(repo, cx) {
    this.checks.complete = sessionComplete(this.space(), panes(), terminals());
    await Promise.all([
      runChecks({
        dirty: () => uncommitted(repo.top, this.on),
        submodules: async () => (await submodules(repo.top, this.on)).unpushed,
        branch: () => branchState(repo, this.on),
      }, this.checks, (name, result) => { this.checks[name] = result; cx.notify(); }),
      nestedWorktreeSpaces(this.space(), repo, this.on).catch(() => []).then((nested) => { this.nestedSpaces = nested; cx.notify(); }),
    ]);
  }

  // Enter removes only once every check has answered, so nobody confirms before seeing the verdict.
  checking() {
    return props()?.action === "remove" && Boolean(this.repo?.linked) && (!checksAnswered(this.checks) || this.nestedSpaces === null);
  }

  space() {
    const p = props() ?? {};
    return spaces().find((s) => s.id === p.space) ?? (p.folder ? { folder: p.folder, machine: p.machine ?? null, name: "" } : undefined);
  }

  close() {
    closeOverlay(props().overlay);
  }

  go(cx) {
    if (this.busy || !this.repo || this.checking()) return;
    cx.spawn(async (cx) => this.work(cx));
  }

  async work(cx) {
    if (this.busy || !this.repo || this.checking()) return;
    this.busy = true;
    this.error = "";
    cx.notify();
    try { this.error = props().action === "remove" ? await this.remove() : await this.create(); }
    catch (error) { this.error = String(error); }
    this.busy = false;
    if (!this.error) this.close();
    cx.notify();
  }

  async create() {
    const branch = this.text.trim();
    if (!branch) return "Type a branch name.";
    const path = `${ROOT(this.userHome)}/${this.repo.name}/${slug(branch)}`;
    const exists = (await git(this.repo.main, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], this.on)).ok;
    const remote = exists ? { found: false } : await remoteBranch(this.repo.main, branch, this.on);
    if (remote.error) return remote.error;
    const fresh = exists || remote.found ? null : await freshStart(this.repo.main, this.on);
    if (fresh?.error) return fresh.error;
    const add = exists ? ["worktree", "add", path, branch]
      : remote.found ? ["worktree", "add", "--track", "-b", branch, path, `origin/${branch}`]
        : ["worktree", "add", "--no-track", "-b", branch, path, fresh.start];
    const r = await git(this.repo.top, add, this.on);
    if (!r.ok) return r.err || "git worktree add failed.";
    const p = props();
    // Unnamed spaces follow the checkout folder; nesting under the repo comes from the checkout either way.
    const behind = p.behind ? openBehindArgs(updates().app.version) : {};
    run("space.new", { name: p.name, folder: path, machine: this.on, tab: p.tab, argv: p.argv, task: p.task, ...behind });
    return "";
  }

  shown() {
    const f = this.text.trim().toLowerCase();
    return (this.list ?? []).filter((c) => !f || `${c.branch ?? ""} ${c.path}`.toLowerCase().includes(f));
  }

  open(c) {
    if (!c) return;
    this.close();
    const s = spaceOf(c.path, this.list, this.on, spaces(), panes());
    if (s) run("space.select", { id: s.id });
    else run("space.new", { folder: c.path, machine: this.on, ...(c.main && this.mainName && { name: this.mainName }) });
  }

  async remove() {
    const s = this.space();
    const dirty = await uncommitted(this.repo.top, this.on);
    // git refuses a worktree with submodules unless forced, because their
    // history goes with it. The popup already showed what's at risk; only
    // risk that appeared since it opened gets one more warning.
    const { mods, unpushed } = await submodules(this.repo.top, this.on);
    const shown = Array.isArray(this.checks.submodules) ? this.checks.submodules : [];
    const changed = (dirty && this.checks.dirty !== true) || unpushed.some((name) => !shown.includes(name));
    if (dirty) this.checks.dirty = true;
    if (changed) this.checks.submodules = [...new Set([...shown, ...unpushed])];
    if (changed) return "It changed since this opened. Enter again removes it anyway.";
    // Terminals first: a shell sitting in the folder keeps it busy on Windows.
    run("space.close", { id: s.id, confirmed: true });
    const force = dirty || mods.length > 0;
    // A set-up checkout (gems, node_modules) holds hundreds of thousands of
    // files and takes git tens of seconds to delete. Rename it to a hidden
    // sibling instead (instant, same volume), let git forget it, and delete
    // it in the background. Submodules keep git's remove, which guards their history.
    if (mods.length === 0) {
      const aside = await exec("sh", ["-c", 'to="$(dirname "$1")/.$(basename "$1").removing-$$" && mv "$1" "$to" && echo "$to"', "sh", this.repo.top], { on: this.on });
      if (aside.code === 0) {
        await git(this.repo.main, ["worktree", "prune"], this.on);
        exec("sh", ["-c", 'nohup rm -rf "$1" >/dev/null 2>&1 &', "sh", aside.stdout.trim()], { on: this.on });
        return "";
      }
    }
    const r = await git(this.repo.main, ["worktree", "remove", ...(force ? ["--force"] : []), this.repo.top], this.on);
    return r.ok ? "" : r.err || "git worktree remove failed.";
  }

  key(e, cx) {
    if (e.key === "escape") return this.close();
    if (this.opening) {
      const n = this.shown().length;
      if (e.key === "enter") this.open(this.shown()[this.at]);
      else if ((e.key === "down" || e.key === "up") && n) this.at = (this.at + (e.key === "down" ? 1 : n - 1)) % n;
      else return;
      cx.stop_propagation();
      return cx.notify();
    }
    if (e.key === "enter" && props()?.action === "remove") return this.go(cx);
  }

  renderOpen(t) {
    const r = this.repo;
    const rows = this.shown();
    const all = this.list ?? [];
    const spaceList = spaces();
    const paneList = panes();
    const row = (c, i) => {
      const on = i === this.at;
      const there = spaceOf(c.path, all, this.on, spaceList, paneList);
      return v_flex()
        .id(`wt-${i}`)
        .flex_none()
        .h(44)
        .px(10)
        .justify_center()
        .rounded(7)
        .cursor_pointer()
        .when(on, (el) => el.bg(t.selected))
        .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
        .on_click(() => this.open(c))
        .child(
          h_flex()
            .gap(8)
            .items_center()
            .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(c.branch ?? "detached"))
            .when(c.main, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child("main checkout")))
            .when(Boolean(there), (el) => el.child(div().flex_none().text_size(11).text_color(t.accent).child("open")))
            .when(!there && c.at > 0, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(ago(c.at)))),
        )
        .child(div().truncate().text_size(11.5).text_color(t.dim).child(tilde(c.path, this.userHome ?? "")));
    };
    const count = rows.length === all.length ? `${all.length} checkouts` : `${rows.length}/${all.length} checkouts`;
    return v_flex()
      .id("worktree")
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .size_full()
      .p(16)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .child(h_flex().child(div().flex_1().font_semibold().text_color(t.foreground).child(`Open worktree${r ? ` of ${r.name}` : ""}`)).child(div().text_size(11).text_color(t.dim).child(r ? count : "")))
      .when(r === undefined || (r && this.list === undefined), (el) => el.child(div().text_color(t.muted).child("\u2026")))
      .when(r === null, (el) => el.child(div().text_color(t.muted).child(`${this.folder ? tilde(this.folder, this.userHome ?? "") : "This folder"} is not in a git repository.`)))
      .when(Boolean(r && this.list), (el) =>
        el
          .child(Input.new(this.input).h(32).px(10).items_center().rounded(6).border(1).border_color(this.inputFocused ? t.accent : t.input).bg(t.surface).text_color(t.foreground))
          .child(
            div()
              .relative()
              .flex_1()
              .min_h(0)
              .child(
                v_flex()
                  .id("wt-list")
                  .size_full()
                  .overflow_y_scroll()
                  .children(rows.map(row))
                  .when(rows.length === 0, (el) => el.child(div().p(10).text_color(t.dim).child("No matching worktrees."))),
              )
              .child(Scrollbar.vertical("wt-list").absolute().inset_0()),
          ),
      )
      .child(h_flex().justify_end().text_size(11).text_color(t.dim).child("\u2191\u2193 choose \u00b7 \u21b5 open \u00b7 esc close"));
  }

  // Each check's finding as it lands, then, once all have answered, the verdict on removing the checkout.
  renderChecks(t) {
    const findings = removalFindings({ ...this.checks, warning: props()?.warning });
    const row = ({ result, text }) => h_flex().gap(6).items_start()
      .child(div().flex_none().text_color(result === PASS ? t.ansi2 : result === LOSS ? t.blocked : t.working).child(result === PASS ? "✓" : "✗"))
      .child(div().flex_1().min_w(0).text_color(t.foreground).child(text));
    const verdict = this.checking() ? null : removalVerdict(findings);
    const nested = this.nestedSpaces?.length ?? 0;
    return v_flex().gap(4)
      .children(findings.map(row))
      .when(nested > 0, (el) => el.child(div().text_color(t.working).child(`Closing this space also closes ${nested === 1 ? "1 space" : `${nested} spaces`} nested under it.`)))
      .when(this.checking(), (el) => el.child(div().text_color(t.dim).child("Checking the worktree's state…")))
      .when(Boolean(verdict), (el) => el.child(div().pt(4).font_semibold().text_color(t.foreground).child(`${verdict.mark} ${verdict.text}`)));
  }

  render(cx) {
    const t = theme();
    if (this.opening) return this.renderOpen(t);
    const remove = props()?.action === "remove";
    const r = this.repo;
    const title = remove ? "Remove this worktree?" : `New worktree${r ? ` of ${r.name}` : ""}`;
    const detail =
      r === undefined
        ? "…"
        : r === null
          ? `${this.folder ? tilde(this.folder, this.userHome) : "This folder"} is not in a git repository.`
          : remove
            ? !r.linked
              ? "This is the repository's main checkout, not a worktree."
              : "Closes the space and deletes this worktree. The branch stays."
            : `A new space on a checkout in ${tilde(ROOT(this.userHome), this.userHome)}/${r.name}/. A branch that exists here or on origin is checked out; a new one starts from origin's default branch, fetched first.`;
    const blocked = !r || (remove && !r.linked);
    return v_flex()
      .id("worktree")
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .size_full()
      .p(16)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .child(div().font_semibold().text_color(t.foreground).child(title))
      .child(div().text_color(t.muted).child(detail))
      .when(remove && Boolean(r?.linked), (el) => el.child(this.renderChecks(t)))
      .when(!remove && !blocked, (el) =>
        el.child(
          Input.new(this.input)
            .h(32)
            .px(10)
            .items_center()
            .rounded(6)
            .border(1)
            .border_color(this.inputFocused ? t.accent : t.input)
            .bg(t.surface)
            .text_color(t.foreground),
        ),
      )
      .when(Boolean(this.error), (el) => el.child(div().text_color(t.blocked).child(this.error)))
      .child(div().flex_1())
      .child(
        h_flex()
          .justify_end()
          .text_size(11)
          .text_color(t.dim)
          .child(this.busy ? "working…" : blocked ? "esc close" : this.checking() ? "checking… · esc cancel" : remove ? "↵ remove · esc cancel" : "↵ create · esc cancel"),
      );
  }
}
