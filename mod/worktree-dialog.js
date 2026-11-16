// Worktree dialog, a dialog of this mod with props { space, action: "new" | "open" | "remove" } or
// { folder, machine } for a repo without a space; optional { branch, name, tab, argv, task }, and { behind: true }
// to open the new worktree's space behind what's shown. Open names a new space on the main checkout with the
// repository's name setting (trackers/setting.js).
// Remove takes an optional { warning }: work outside the checkout that removing it would leave behind, and { ask }
// to wait for Enter whatever the checks find. It removes the checkout without asking when removesWithoutAsking
// (removal.js) says so, and otherwise waits for Enter. It carries on with the checks of a removal closeWorktreeSpace
// (worktree-removal.js) already started for the space, and starts them itself otherwise.

/**
 * @import { AsyncContext, Context, KeyEvent } from "gpui-kit"
 * @import { PaneInfo, SpaceInfo } from "herdr"
 * @import { Repo } from "./worktree-removal.js"
 * @typedef {Record<string, `#${string}`>} Theme
 * @typedef {{ path: string, branch: string | null, main: boolean, at: number }} ListedCheckout
 */
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar } from "gpui-base";
import { run, props, closeOverlay, theme, spaces, panes, exec, home, updates } from "herdr";
import { openBehindArgs } from "./open-behind.js";
import { nameSettings } from "./trackers/setting.js";
import { removalFindings, removalVerdict, PASS, LOSS } from "./removal.js";
import { git, place, repoOf, removalInFlight, startRemoval, forgetRemoval } from "./worktree-removal.js";
/** @import { WorktreeRemoval } from "./worktree-removal.js" */

// Checkouts go to <ROOT>/<repo>/<branch, slashes as dashes>.
/** @param {string} home */
const ROOT = (home) => `${home}/.herdr/worktrees`;
// Home as ~ (git says C:/Users/x where Windows says C:\Users\x).
/**
 * @param {string} path
 * @param {string} userHome
 */
const tilde = (path, userHome) => {
  const [p, h] = [path, userHome].map((s) => s.replace(/\\/g, "/"));
  return p.startsWith(h) ? `~${p.slice(h.length)}` : path;
};
/** @param {string} branch */
const slug = (branch) => branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
/** @param {number} s */
const ago = (s) => {
  const d = Date.now() / 1000 - s;
  return d < 3600
    ? `${Math.max(1, Math.round(d / 60))}m`
    : d < 86400
      ? `${Math.round(d / 3600)}h`
      : d < 86400 * 60
        ? `${Math.round(d / 86400)}d`
        : `${Math.round(d / 86400 / 30)}mo`;
};

// Every checkout of a repo (`git worktree list`), the main one first, then
// the most recently committed: { path, branch, main, at }.
/**
 * @param {Repo} repo
 * @param {string | null | undefined} on
 * @returns {Promise<ListedCheckout[]>}
 */
async function checkouts(repo, on) {
  const list = await git(repo.main, ["worktree", "list", "--porcelain"], on);
  if (!list.ok) return [];
  const refs = await git(
    repo.main,
    ["for-each-ref", "--format=%(refname:short)%09%(committerdate:unix)", "refs/heads"],
    on,
  );
  const when = new Map(
    refs.out
      .split("\n")
      .map((l) => l.split("\t"))
      .map(([b, at]) => [b, Number(at) || 0]),
  );
  /** @type {ListedCheckout[]} */
  const out = [];
  for (const block of list.out.split(/\n\n+/)) {
    const lines = block.split("\n");
    const path = lines.find((l) => l.startsWith("worktree "))?.slice(9);
    if (!path || lines.some((l) => l === "bare" || l.startsWith("prunable"))) continue;
    const branch =
      lines
        .find((l) => l.startsWith("branch "))
        ?.slice(7)
        .replace(/^refs\/heads\//, "") ?? null;
    out.push({ path, branch, main: out.length === 0, at: branch ? (when.get(branch) ?? 0) : 0 });
  }
  return out.sort((a, b) => Number(b.main) - Number(a.main) || b.at - a.at);
}

// The space showing a checkout: its first terminal is in it (the deepest checkout wins).
/**
 * @param {string} path
 * @param {ListedCheckout[]} all
 * @param {string | null | undefined} on
 * @param {SpaceInfo[]} spaceList
 * @param {PaneInfo[]} paneList
 */
function spaceOf(path, all, on, spaceList, paneList) {
  /**
   * @param {string} p
   * @param {string} dir
   */
  const inside = (p, dir) => p === dir || p.startsWith(dir + "/");
  return spaceList.find(
    (s) =>
      (s.machine ?? null) === (on ?? null) &&
      (() => {
        const at = place(s, paneList)?.replace(/\\/g, "/");
        if (!at || !inside(at, path)) return false;
        return !all.some((c) => c.path !== path && c.path.length > path.length && inside(at, c.path));
      })(),
  );
}

// Fetches the branch from origin, where work started elsewhere (another computer, a cloud
// agent) left it: { found }, or { error } when origin couldn't be asked.
/**
 * @param {string} repo
 * @param {string} branch
 * @param {string | null | undefined} on
 * @returns {Promise<{ found?: boolean, error?: string }>}
 */
async function remoteBranch(repo, branch, on) {
  if (!(await git(repo, ["remote", "get-url", "origin"], on)).ok) return { found: false };
  const fetched = await git(repo, ["fetch", "origin", `refs/heads/${branch}:refs/remotes/origin/${branch}`], on);
  if (fetched.ok) return { found: true };
  if (/couldn't find remote ref/i.test(fetched.err)) return { found: false };
  return { error: fetched.err || `Couldn't fetch ${branch} from origin.` };
}

// Where a new branch starts: origin's default branch, fetched just now, so new work never
// starts from a stale or unrelated checkout. "HEAD" in a repo without origin.
/**
 * @param {string} repo
 * @param {string | null | undefined} on
 * @returns {Promise<{ start?: string, error?: string }>}
 */
async function freshStart(repo, on) {
  if (!(await git(repo, ["remote", "get-url", "origin"], on)).ok) return { start: "HEAD" };
  const head = await git(repo, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], on);
  const start = head.ok ? head.out : "origin/main";
  const fetched = await git(repo, ["fetch", "origin", start.slice("origin/".length)], on);
  return fetched.ok ? { start } : { error: fetched.err || `Couldn't fetch ${start}.` };
}

export class WorktreeDialog {
  /** @param {Context} cx */
  constructor(cx) {
    this.on = this.space()?.machine;
    this.userHome = this.on ? null : home();
    this.opening = props()?.action === "open";
    this.text = props()?.branch ?? "";
    /** @type {ListedCheckout[] | undefined} */
    this.list = undefined; // open: the checkouts, once read
    /** @type {string | null} */
    this.mainName = null; // open: the repository's configured name, once read
    this.at = 0;
    this.input = InputState.new({ value: this.text, placeholder: this.opening ? "filter worktrees" : "branch name" });
    this.input.on("change", (_e, cx) => {
      this.text = this.input.value();
      this.error = "";
      this.at = 0;
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.go(cx));
    this.inputFocused = true;
    this.input.on("focus", (_e, cx) => {
      this.inputFocused = true;
      cx.notify();
    });
    this.input.on("blur", (_e, cx) => {
      this.inputFocused = false;
      cx.notify();
    });
    if (props()?.action !== "remove") {
      this.input.focus();
      cx.timer.after(600, () => this.input.focus());
    }
    this.busy = false;
    this.error = "";
    /** @type {Repo | null | undefined} */
    this.repo = undefined; // undefined: looking, null: not in git
    /** @type {WorktreeRemoval | null} */
    this.removal = null; // remove: the space's WorktreeRemoval, once its repo is known
    this.handle = cx.focus_handle();
    if (props()?.action === "remove") this.handle.focus();
    cx.spawn(async (cx) => {
      try {
        if (this.on) {
          let result;
          try {
            result = await exec("sh", ["-c", 'printf %s "$HOME"'], { on: this.on });
          } catch {
            result = undefined;
          }
          if (!result || result.code !== 0 || !result.stdout.trim())
            result = await exec("powershell.exe", ["-NoProfile", "-Command", "[Console]::Write($HOME)"], {
              on: this.on,
            });
          if (result.code !== 0 || !result.stdout.trim()) throw new Error("Could not find the remote home folder.");
          this.userHome = result.stdout.trim().replace(/\\/g, "/");
        }
        this.folder = props()?.folder || place(this.space()) || this.userHome;
        const inFlight = props().action === "remove" ? removalInFlight(props().space) : undefined;
        const repo = inFlight?.repo ?? (await repoOf(this.folder, this.on));
        if (repo && this.opening) {
          [this.list, this.mainName] = await Promise.all([
            checkouts(repo, this.on),
            nameSettings({ root: repo.main, on: this.on }).then(
              ({ name }) => name,
              /** @returns {string | null} */ () => null,
            ),
          ]);
        }
        this.repo = repo;
        cx.notify();
        if (repo?.linked && props().action === "remove") {
          this.removal = inFlight ?? startRemoval(/** @type {SpaceInfo} */ (this.space()), repo);
          await this.followChecks(cx);
          if (this.removal.removesWithoutAsking({ ask: props().ask, warning: props().warning })) await this.work(cx);
        }
        if (props().branch) await this.work(cx);
      } catch (error) {
        this.repo = null;
        this.error = String(error);
        cx.notify();
      }
    });
  }

  // Shows each of the removal's checks as it answers.
  /** @param {Context} cx */
  async followChecks(cx) {
    const stopFollowing = this.removal.onChange(() => cx.notify());
    cx.notify();
    await this.removal.finished;
    stopFollowing();
    cx.notify();
  }

  // Enter removes only once every check has answered, so nobody confirms before seeing the verdict.
  checking() {
    return props()?.action === "remove" && Boolean(this.repo?.linked) && !this.removal?.answered();
  }

  space() {
    const p = props() ?? {};
    return (
      spaces().find((s) => s.id === p.space) ??
      (p.folder ? { folder: p.folder, machine: p.machine ?? null, name: "" } : undefined)
    );
  }

  close() {
    if (this.removal) forgetRemoval(props().space, this.removal);
    closeOverlay(props().overlay);
  }

  /** @param {Context} cx */
  go(cx) {
    if (this.busy || !this.repo || this.checking()) return;
    cx.spawn(async (cx) => this.work(cx));
  }

  /** @param {Context} cx */
  async work(cx) {
    if (this.busy || !this.repo || this.checking()) return;
    this.busy = true;
    this.error = "";
    cx.notify();
    try {
      this.error = props().action === "remove" ? await this.remove() : await this.create();
    } catch (error) {
      this.error = String(error);
    }
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
    const add = exists
      ? ["worktree", "add", path, branch]
      : remote.found
        ? ["worktree", "add", "--track", "-b", branch, path, `origin/${branch}`]
        : ["worktree", "add", "--no-track", "-b", branch, path, fresh.start];
    const r = await git(this.repo.top, add, this.on);
    if (!r.ok) return r.err || "git worktree add failed.";
    const p = props();
    // Unnamed spaces follow the checkout folder; nesting under the repo comes from the checkout either way.
    const behind = p.behind ? openBehindArgs(updates().app.version) : {};
    run("space.new", {
      name: p.name,
      folder: path,
      machine: this.on,
      tab: p.tab,
      argv: p.argv,
      task: p.task,
      ...behind,
    });
    return "";
  }

  shown() {
    const f = this.text.trim().toLowerCase();
    return (this.list ?? []).filter((c) => !f || `${c.branch ?? ""} ${c.path}`.toLowerCase().includes(f));
  }

  /** @param {ListedCheckout | undefined} c */
  open(c) {
    if (!c) return;
    this.close();
    const s = spaceOf(c.path, this.list, this.on, spaces(), panes());
    if (s) run("space.select", { id: s.id });
    else
      run("space.new", { folder: c.path, machine: this.on, ...(c.main && this.mainName && { name: this.mainName }) });
  }

  async remove() {
    return this.removal.remove();
  }

  /**
   * @param {KeyEvent} e
   * @param {Context} cx
   */
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

  /** @param {Theme} t */
  renderOpen(t) {
    const r = this.repo;
    const rows = this.shown();
    const all = this.list ?? [];
    const spaceList = spaces();
    const paneList = panes();
    /**
     * @param {ListedCheckout} c
     * @param {number} i
     */
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
            .child(
              div()
                .flex_1()
                .min_w(0)
                .truncate()
                .text_color(t.foreground)
                .child(c.branch ?? "detached"),
            )
            .when(c.main, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child("main checkout")))
            .when(Boolean(there), (el) => el.child(div().flex_none().text_size(11).text_color(t.accent).child("open")))
            .when(!there && c.at > 0, (el) =>
              el.child(div().flex_none().text_size(11).text_color(t.dim).child(ago(c.at))),
            ),
        )
        .child(
          div()
            .truncate()
            .text_size(11.5)
            .text_color(t.dim)
            .child(tilde(c.path, this.userHome ?? "")),
        );
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
      .child(
        h_flex()
          .child(
            div()
              .flex_1()
              .font_semibold()
              .text_color(t.foreground)
              .child(`Open worktree${r ? ` of ${r.name}` : ""}`),
          )
          .child(
            div()
              .text_size(11)
              .text_color(t.dim)
              .child(r ? count : ""),
          ),
      )
      .when(r === undefined || (r && this.list === undefined), (el) =>
        el.child(div().text_color(t.muted).child("\u2026")),
      )
      .when(r === null, (el) =>
        el.child(
          div()
            .text_color(t.muted)
            .child(
              `${this.folder ? tilde(this.folder, this.userHome ?? "") : "This folder"} is not in a git repository.`,
            ),
        ),
      )
      .when(Boolean(r && this.list), (el) =>
        el
          .child(
            Input.new(this.input)
              .h(32)
              .px(10)
              .items_center()
              .rounded(6)
              .border(1)
              .border_color(this.inputFocused ? t.accent : t.input)
              .bg(t.surface)
              .text_color(t.foreground),
          )
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
                  .when(rows.length === 0, (el) =>
                    el.child(div().p(10).text_color(t.dim).child("No matching worktrees.")),
                  ),
              )
              .child(Scrollbar.vertical("wt-list").absolute().inset_0()),
          ),
      )
      .child(
        h_flex()
          .justify_end()
          .text_size(11)
          .text_color(t.dim)
          .child("\u2191\u2193 choose \u00b7 \u21b5 open \u00b7 esc close"),
      );
  }

  // Each check's finding as it arrives, then, once all have answered, the verdict on removing the checkout.
  /** @param {Theme} t */
  renderChecks(t) {
    const findings = removalFindings({ ...this.removal?.checks, warning: props()?.warning });
    /** @param {{ result: string, text: string }} finding */
    const row = ({ result, text }) =>
      h_flex()
        .gap(6)
        .items_start()
        .child(
          div()
            .flex_none()
            .text_color(result === PASS ? t.ansi2 : result === LOSS ? t.blocked : t.working)
            .child(result === PASS ? "✓" : "✗"),
        )
        .child(div().flex_1().min_w(0).text_color(t.foreground).child(text));
    const verdict = this.checking() ? null : removalVerdict(findings);
    const nested = this.removal?.nestedSpaces?.length ?? 0;
    return v_flex()
      .gap(4)
      .children(findings.map(row))
      .when(nested > 0, (el) =>
        el.child(
          div()
            .text_color(t.working)
            .child(`Closing this space also closes ${nested === 1 ? "1 space" : `${nested} spaces`} nested under it.`),
        ),
      )
      .when(this.checking(), (el) => el.child(div().text_color(t.dim).child("Checking the worktree's state…")))
      .when(Boolean(verdict), (el) =>
        el.child(div().pt(4).font_semibold().text_color(t.foreground).child(`${verdict.mark} ${verdict.text}`)),
      );
  }

  render() {
    const t = /** @type {Record<string, `#${string}`>} */ (theme());
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
          .child(
            this.busy
              ? "working…"
              : blocked
                ? "esc close"
                : this.checking()
                  ? "checking… · esc cancel"
                  : remove
                    ? "↵ remove · esc cancel"
                    : "↵ create · esc cancel",
          ),
      );
  }
}
