// The issues of the project in the focused pane: its git repository's root, or its folder outside one.
// Clicking an issue shows it in the panel in place of the list (detail.js). The list draws a limited
// number of rows, and Show more draws more. Status and priority dropdowns are popups of this same mod
// with props { menu } (menu.js), and the worktree dialog is a dialog of it with props { action }
// (worktree-dialog.js). Edit swaps an open issue's body for a Markdown editor; Save,
// Cmd-Enter or the issues.save key command writes it back to the tracker. Start and Continue open a
// Claude session working the issue in its worktree. Clicking a task-list
// checkbox in the body saves that one change at once. A repository with no tracker, or one whose tracker
// can't load, shows the setup view (setup.js) in place of the list.
import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, EditorState } from "gpui-base";
import { theme, props, settings, nextCommand, openOverlay, shared, spaces, notify, exec, run, watchFolder, appHome } from "herdr";
import { location, repositoryRoot, mainCheckout } from "./location.js";
import { trackerFor } from "./trackers/index.js";
import { settingsPath, pollSettings, DEFAULT_POLL_SECONDS } from "./trackers/setting.js";
import { findScope, linearKeyPath } from "./trackers/linear.js";
import { forgetLookups } from "./lookups.js";
import { publishScope, publishOpenIssue } from "./scope-context.js";
import { groupIssues, loadsFor, holdingBlockers, canStartWork, canFinishWork, needsNewBranch, blockedIssues, waitingIssues, slaStatus, dueStatus, PRIORITIES } from "./issue.js";
import { issueDetail, issueLinks, workButton, labelChips } from "./detail.js";
import { FieldMenu, ScopeMenu, openMenu, openScopeMenu, openLabelMenu, selectedScope, selectedLabel } from "./menu.js";
import { worktreeFor, repositoryState, deleteMergedBranches, worktreeSpace } from "./worktree.js";
import { toggleTask } from "./tasks.js";
import { linkTarget, codeSpanPaths, linkCodeSpanFiles } from "./links.js";
import { isTextFile, openInEditor } from "./editor.js";
import { avatarImage } from "./avatars.js";
import { lastList, fetchList, rememberedList } from "./lists.js";
import { issuesChangedAt, announceIssueChange } from "./changes.js";
import { mixColors, STATUS_COLORS, DUE_COLORS, tinted } from "./colors.js";
import { fieldEdits, markEditFailed, forgetEdits, claimEdit } from "./edits.js";
import { WorktreeDialog } from "./worktree-dialog.js";
import { issueSpaceName } from "./space-name.js";
import { panelVisible } from "./visibility.js";
import { TrackerSetup, untrackableView } from "./setup.js";
import { AgentOrder } from "./agent-order.js";

const REFRESH_CHECK_MS = 10 * 1000;
// A remote list at least this old refreshes when the person comes back to the panel or Herdr's window.
const STALE_ON_RETURN_MS = 10 * 1000;
// A Claude hook (claude-plugin/hooks/herdr-issues-created.sh) touches this file after Claude creates a remote issue.
const createdStampPath = () => `${appHome()}/data/issues/created`;
// Rows the list draws at first, and how many more each Show more adds: drawing every issue of a large
// team at once is too slow.
const ROW_LIMIT = 100;
const PRIORITY_COLORS = { 1: "ansi1", 2: "working" };
// Lucide icons for Urgent, High, Medium and Low, as Linear shows priority.
const PRIORITY_ICONS = { 1: "circle-alert", 2: "signal-high", 3: "signal-medium", 4: "signal-low" };
const PRIORITY_ICON_PX = 18;
const AVATAR_PX = 14;
const SLA_COLORS = { breached: "ansi1", high: "ansi1", medium: "working", low: "dim" };
const SLA_ICONS = { breached: "🚨", high: "🔥", medium: "⚠️" };
// Wide enough for a five-digit ID such as CAL-12345 at the list's 11px.
const ID_COLUMN_PX = 68;
// Generous for any character of an ID at the list's 11px, so a short ID column never cuts an ID off.
const ID_CHARACTER_PX = 7;
// The row's work button, kept on rows without one so every title wraps at the same edge.
const ACTION_COLUMN_PX = 32;
const contextKey = () => JSON.stringify(location());
// The new list, keeping each body already loaded for an issue that hasn't changed since.
function withLoadedBodies(issues, previous) {
  const loaded = new Map(previous.filter((issue) => issue.body !== null).map((issue) => [issue.id, issue]));
  return issues.map((issue) => {
    const before = issue.body === null && loaded.get(issue.id);
    if (!before) return issue;
    return { ...issue, body: before.body, bodyStale: before.bodyStale || before.updated !== issue.updated };
  });
}

function scopeDropdown(id, label, onClick, t) {
  return h_flex().id(id).min_w(0).h(24).px(8).gap(6).items_center().rounded(6).border_1().border_color(t.border)
    .text_size(11).text_color(t.foreground).bg(t.raised).cursor_pointer().hover((s) => s.bg(t.hover))
    .on_click(() => onClick())
    .child(div().min_w(0).truncate().child(label))
    .child(div().flex_none().text_color(t.dim).child("▾"));
}

const SCOPE_DROPDOWN_MAX_PX = 260;
const REFRESH_ICON_PX = 15;
const SYNC_ICON_PX = 15;
const SYNC_SPIN_MS = 1000;
// A saved edit's sync icon fades out over this long, a step at a time.
const SYNC_FADE_MS = 600, SYNC_FADE_STEP_MS = 30;
const folderName = (path) => path.split("/").filter(Boolean).pop() ?? path;
const NOT_A_REPOSITORY = "The issues panel tracks issues for git repositories, and this folder isn't in one.";
const ON_ANOTHER_MACHINE = "The issues panel can't track issues for a folder on another machine.";

const workIssueSession = (issue) => ({ tab: "Claude", argv: ["claude"], task: `/issues:work ${issue.id}` });
// issues worktree sets up new checkouts, which can take minutes in a box app.
const ISSUES_WORKTREE_TIMEOUT_MS = 10 * 60 * 1000;
// issues worktree works on this computer's checkouts and needs the issue's branch.
const opensWithIssuesWorktree = (issue, project) => Boolean(issue.branch && project && !project.on);
// A list row's hover, half as strong as the theme's: half as opaque when it's translucent,
// otherwise halfway back to the panel's background.
function rowHover(t) {
  const translucent = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(t.hover);
  if (translucent) return `#${translucent[1]}${Math.round(parseInt(translucent[2], 16) / 2).toString(16).padStart(2, "0")}`;
  return mixColors(t.background, t.hover, 0.5) ?? t.hover;
}
const plural = (count, noun, nouns = `${noun}s`) => `${count} ${count === 1 ? noun : nouns}`;

export default class Issues extends View {
  init(_props, cx) {
    if (props()?.menu) { this.menu = props().menu === "scope" ? new ScopeMenu() : new FieldMenu(); return; }
    if (props()?.action) { this.worktreeDialog = new WorktreeDialog(cx); return; }
    this.issues = []; this.unloaded = new Set(); this.generation = 0; this.expanded = {};
    this.rowLimit = ROW_LIMIT; this.shownByContext = new Map(); this.agentOrder = new AgentOrder();
    this.editing = null; this.saving = false; this.detailError = null;
    this.links = { hasIssue: (id) => this.hasIssue(id), onOpen: (id, cx) => this.open(id, cx) };
    this.refresh(cx, { reuse: true });
    cx.timer.every(REFRESH_CHECK_MS, (cx) => this.poll(cx));
    cx.spawn(async (cx) => {
      for (; ;) {
        if (await nextCommand() === "save") this.save(cx);
        cx.notify();
      }
    });
  }

  // With `reuse`, a remote list fetched moments ago, by this copy or another, is shown without asking again,
  // so switching between spaces of one repository or coming back to the panel doesn't repeat the request.
  refresh(cx, { reuse = false } = {}) {
    const context = contextKey();
    if (context !== this.context) {
      this.context = context; this.error = null;
      this.closeIssue(); this.focusHandled = null;
      this.restoreShown(context);
    }
    const generation = ++this.generation;
    this.refreshedAt = Date.now();
    this.seenChangeAt = issuesChangedAt();
    this.refreshing = true;
    cx.spawn(async (cx) => {
      let scopeKey = null;
      try {
        const where = location();
        if (!where.cwd) throw new Error("No folder in focus");
        const root = where.on == null ? await repositoryRoot(where) : null;
        if (generation !== this.generation) return;
        if (!root) { this.showUntrackable(where, context); return; }
        scopeKey = await mainCheckout(root, where.on);
        const scope = selectedScope(scopeKey);
        if (generation !== this.generation) return;
        // Every checkout of a repository lists the same issues, so its list stays up across its spaces.
        if (scopeKey !== this.scopeKey) { this.forgetList(); cx.notify(); }
        this.project = { root, on: where.on }; this.resolvedContext = context; this.scopeKey = scopeKey; this.untrackable = null;
        this.watchAppFiles(cx);
        const tracker = await trackerFor({ root, on: where.on });
        const { pollSeconds } = await pollSettings({ root, on: where.on });
        if (generation !== this.generation) return;
        this.pollMs = pollSeconds * 1000;
        this.listedScope = scope;
        if (!tracker) { this.showSetup(scopeKey, null, cx); return; }
        // Collapsed groups that can wait aren't listed, so Linear isn't asked for issues nobody is looking at.
        const loads = loadsFor((group) => this.isExpanded(group));
        const unloaded = new Set((tracker?.deferred?.(scope) ?? []).filter((each) => !loads.has(each)));
        const project = { root, on: where.on }, listKey = `${scopeKey}\n${scope ?? ""}\n${[...loads].sort()}`;
        // A tracker is slow to list, so a scope not shown yet starts from its last list.
        if (tracker && this.listKey !== listKey) {
          const last = await lastList(listKey);
          if (last && generation === this.generation) {
            Object.assign(this, { project, tracker, scopeKey, listKey, issues: last, unloaded, loaded: true });
            cx.notify();
          }
        }
        const issues = tracker ? await fetchList(listKey, () => tracker.list(scope, loads), reuse) : [];
        if (generation !== this.generation) return;
        const leaving = this.openId && !issues.some((each) => each.id === this.openId) ? this.findIssue(this.openId) : null;
        Object.assign(this, { project, tracker, scopeKey, listKey, issues: withLoadedBodies(issues, this.issues), unloaded, error: null, setup: null });
        this.shownByContext.set(context, { project, tracker, scopeKey, listKey, unloaded, listedScope: scope, repository: null });
        if (leaving) this.holdOpenIssue(leaving, tracker, cx);
        publishScope(scopeKey, tracker, scope).catch(() => {});
        this.scanRepository(project, generation, cx);
      } catch (e) {
        if (generation !== this.generation) return;
        if (e.fix && scopeKey) this.showSetup(scopeKey, e, cx);
        else this.error = String(e.message ?? e);
      }
      finally { if (generation === this.generation) { this.loaded = true; this.refreshing = false; cx.notify(); } }
    });
  }

  // The setup view in place of the list: choosing a tracker, or `failure`, the problem that stops the
  // configured one loading. It survives polls, so a choice in progress isn't lost.
  showSetup(main, failure, cx) {
    if (this.setup?.main !== main) this.setup = new TrackerSetup(main, (cx) => this.refresh(cx));
    this.setup.showFailure(failure);
    Object.assign(this, { tracker: null, issues: [], unloaded: new Set(), listKey: null, repository: null, error: null });
    this.closeIssue();
    cx.notify();
  }

  showUntrackable(where, context) {
    this.forgetList(); this.closeIssue();
    Object.assign(this, { setup: null, error: null, resolvedContext: context, untrackable: where.on == null ? NOT_A_REPOSITORY : ON_ANOTHER_MACHINE });
  }

  // A space shown before shows its last list at once, while the lookups that confirm it run again.
  restoreShown(context) {
    const shown = this.shownByContext.get(context), issues = shown && rememberedList(shown.listKey);
    if (!issues || selectedScope(shown.scopeKey) !== shown.listedScope) return;
    Object.assign(this, { ...shown, issues, resolvedContext: context, untrackable: null, setup: null, loaded: true });
  }

  forgetList() {
    this.project = null; this.tracker = null; this.issues = []; this.unloaded = new Set(); this.loaded = false; this.repository = null;
    this.scopeKey = null; this.listedScope = undefined; this.listKey = null; this.rowLimit = ROW_LIMIT; this.focusHandled = null;
    this.setup = null;
  }

  // The open issue stays up after leaving the list, such as when it's done and the Done group isn't
  // listed, so its work can still be reviewed; it's read again for the change that moved it.
  holdOpenIssue(issue, tracker, cx) {
    this.heldIssue = issue;
    cx.spawn(async (cx) => {
      const current = await tracker.get(issue.id).catch(() => null);
      if (!current || this.heldIssue !== issue) return;
      this.heldIssue = current;
      cx.notify();
    });
  }

  // A listed issue, or the open one held after it left the list.
  findIssue(id) {
    return this.issues.find((each) => each.id === id) ?? (this.heldIssue?.id === id ? this.heldIssue : undefined);
  }

  // Reads the repository's worktrees and branches for the issues just listed, after the list shows, and
  // deletes the branches of done issues that have landed in main, so finished work leaves nothing behind.
  scanRepository(project, generation, cx) {
    cx.spawn(async (cx) => {
      const repository = await repositoryState(this.issues, project).catch(() => null);
      if (generation !== this.generation) return;
      this.repository = repository;
      const shown = this.shownByContext.get(this.resolvedContext);
      if (shown?.listKey === this.listKey) shown.repository = repository;
      cx.notify();
      if (!repository?.mergedFinished.length) return;
      const deleted = await deleteMergedBranches(repository.mergedFinished, repository).catch(() => []);
      if (deleted.length) notify({ title: `Deleted ${plural(deleted.length, "merged branch", "merged branches")}`, body: deleted.join(", ") });
    });
  }

  // A panel out of sight skips its polls, and refreshes once when it comes back instead.
  poll(cx) {
    if (!this.refreshOnReturn(cx) && this.visible && this.pollDue()) this.refresh(cx);
  }

  pollDue() {
    return Date.now() - this.refreshedAt >= (this.pollMs ?? DEFAULT_POLL_SECONDS * 1000);
  }

  refreshOnReturn(cx) {
    const visible = panelVisible(), returned = visible && this.visible === false;
    this.visible = visible;
    const stale = returned && this.tracker && Date.now() - this.refreshedAt >= STALE_ON_RETURN_MS;
    if (stale) this.refresh(cx, { reuse: true });
    return stale;
  }

  // issues.json picks each repository's tracker, linear.json holds Linear's API key, and the created stamp says
  // Claude just made an issue, so a change to any of them refreshes the panel at once rather than at the next
  // poll, without the lookups kept from those files. The app's folder holds more than these files, so other
  // changes there are ignored.
  watchAppFiles(cx) {
    if (this.watchingAppFiles) return;
    this.watchingAppFiles = true;
    const folder = appHome(), files = [settingsPath(), linearKeyPath(), createdStampPath()];
    cx.spawn(async (cx) => {
      try {
        // Changes arrive under the folder's real path when the app's folder is reached through a symlink.
        const realFolder = (await exec("pwd", ["-P"], { cwd: folder })).stdout.trim();
        const watched = new Set([folder, realFolder, ...files, ...files.map((file) => `${realFolder}${file.slice(folder.length)}`)]);
        for (;;) {
          const paths = await watchFolder(folder);
          if (paths.some((path) => watched.has(path))) { forgetLookups(); this.refresh(cx); }
        }
      } catch { this.watchingAppFiles = false; }
    });
  }

  // Keeps the issue as it was read, so saving can tell whether it changed underneath the edit.
  edit(issue, cx) {
    const t = theme();
    this.detailError = null;
    this.editing = {
      issue,
      state: EditorState.new({
        language: "markdown", value: issue.body, soft_wrap: true, line_numbers: false, folding: false,
        font_family: settings().font_family, font_size: 12,
        syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 },
      }),
    };
    this.editing.state.on("submit", (event, cx) => { if (event.secondary) this.save(cx); });
    cx.notify();
  }

  stopEditing() {
    this.editing?.state.release();
    this.editing = null; this.saving = false; this.detailError = null;
  }

  hasUnsavedEdits() {
    return Boolean(this.editing) && this.editing.state.value().trim() !== this.editing.issue.body;
  }

  closeIssue() {
    this.stopEditing();
    this.openId = null; this.heldIssue = null;
  }

  // Shows another issue, such as a blocker, unless that would throw away unsaved edits.
  open(id, cx) {
    if (this.hasUnsavedEdits()) this.detailError = "Save or cancel your edits first";
    else { this.stopEditing(); this.openId = id; }
    cx.notify();
  }

  // Opens the issue the tabs bar asked for when its space was shown, once this space's repository is known
  // and its issues have loaded. An issue the list leaves out, such as a done one, is read on its own.
  openRequestedIssue(cx) {
    const request = shared("issues.focus"), space = spaces().find((each) => each.active);
    if (!request || !this.loaded || this.resolvedContext !== this.context || request.at === this.focusHandled || request.space !== space?.id) return;
    this.focusHandled = request.at;
    if (this.hasUnsavedEdits()) return;
    if (this.hasIssue(request.id)) { this.stopEditing(); this.openId = request.id; return; }
    const tracker = this.tracker;
    if (!tracker) return;
    cx.spawn(async (cx) => {
      const issue = await tracker.get(request.id).catch(() => null);
      if (!issue || this.focusHandled !== request.at || this.tracker !== tracker || this.hasUnsavedEdits()) return;
      this.stopEditing(); this.openId = issue.id; this.heldIssue = issue;
      cx.notify();
    });
  }

  // Fetches the open issue's body when its list left it out.
  loadBody(issue, cx) {
    const tracker = this.tracker;
    if ((issue.body !== null && !issue.bodyStale) || this.loadingBody === issue.id || !tracker) return;
    this.loadingBody = issue.id;
    cx.spawn(async (cx) => {
      try {
        const full = await tracker.get(issue.id);
        if (!full) throw new Error(`${issue.id} was not found`);
        Object.assign(issue, { body: full.body, updated: full.updated, bodyStale: false });
      } catch (e) { this.detailError = `Could not load ${issue.id}: ${e.message ?? e}`; }
      this.loadingBody = null;
      cx.notify();
    });
  }

  hasIssue(id) {
    return this.issues.some((issue) => issue.id === id);
  }

  back(cx) {
    if (this.hasUnsavedEdits()) this.detailError = "Save or cancel your edits first";
    else this.closeIssue();
    cx.notify();
  }

  save(cx) {
    const editing = this.editing, tracker = this.tracker;
    if (!editing || this.saving || !tracker?.writable) return;
    if (!this.hasUnsavedEdits()) { this.stopEditing(); cx.notify(); return; }
    this.saving = true; this.detailError = null;
    cx.spawn(async (cx) => {
      try {
        await tracker.update(editing.issue, { body: editing.state.value() });
        if (this.editing === editing) this.stopEditing();
        this.refresh(cx);
      } catch (e) {
        if (this.editing === editing) { this.saving = false; this.detailError = `Could not save: ${e.message ?? e}`; }
      }
      cx.notify();
    });
    cx.notify();
  }

  // The code spans in the issue's body that name files in the project, found once per body.
  filesInBody(issue, cx) {
    const { root, on } = this.project, key = `${root}\n${issue.body}`;
    if (issue.body === null) return new Set();
    if (this.bodyFiles?.key === key) return this.bodyFiles.files;
    const bodyFiles = this.bodyFiles = { key, files: new Set() }, paths = codeSpanPaths(issue.body);
    if (!paths.length) return bodyFiles.files;
    cx.spawn(async (cx) => {
      const listFiles = 'for path; do [ -f "$path" ] && printf "%s\\n" "$path"; done; true';
      const found = await exec("sh", ["-c", listFiles, "sh", ...paths], { cwd: root, on }).catch(() => null);
      if (found?.code !== 0 || this.bodyFiles !== bodyFiles) return;
      bodyFiles.files = new Set(found.stdout.split("\n").filter(Boolean));
      cx.notify();
    });
    return bodyFiles.files;
  }

  // Opens a text file in the user's editor, and hands a URL or any other file to macOS `open`.
  openLink(issue, url, cx) {
    const { file, url: address } = linkTarget(url, this.project.root);
    if (file && this.project?.on) { this.detailError = `${file} is on ${this.project.on}, so it can't be opened here`; cx.notify(); return; }
    this.detailError = null;
    cx.spawn(async (cx) => {
      if (file && await isTextFile(file)) await openInEditor(file, this.project.root).catch((e) => { this.detailError = `Could not open ${file}: ${e.message ?? e}`; });
      else {
        const target = file ?? address;
        const opened = await exec("open", [target]).catch((e) => ({ code: 1, stderr: String(e.message ?? e) }));
        if (opened.code !== 0) this.detailError = `Could not open ${target}: ${opened.stderr.trim()}`;
      }
      cx.notify();
    });
    cx.notify();
  }

  // Shows the checkbox's new state at once. Saves run one after another, each over the body the
  // previous one wrote, so quick clicks never look like an edit made elsewhere meanwhile.
  toggleTask(issue, line, cx) {
    const tracker = this.tracker;
    if (!tracker?.writable || this.editing) return;
    const before = { ...issue };
    try { issue.body = toggleTask(issue.body, line); }
    catch (e) { this.detailError = String(e.message ?? e); cx.notify(); return; }
    const body = issue.body;
    this.detailError = null;
    const saved = (this.taskSaves ?? Promise.resolve()).catch(() => {}).then(() => tracker.update(before, { body }));
    this.taskSaves = saved;
    cx.spawn(async (cx) => {
      try { await saved; }
      catch (e) { this.detailError = `Could not save the checkbox: ${e.message ?? e}`; this.refresh(cx); }
      cx.notify();
    });
    cx.notify();
  }

  // A fresh Claude session in a new worktree space on the issue's branch, working the issue with /issues:work.
  // Without a branch, the worktree dialog asks for one. The tracker saves the start while the worktree opens.
  startWork(issue, cx) {
    const tracker = this.tracker;
    if (!tracker?.writable) { this.detailError = "Can't mark this issue in progress here"; cx.notify(); return; }
    this.detailError = null;
    this.showOpening(issue, `Opening ${issue.id}'s worktree…`, cx);
    cx.spawn(async (cx) => {
      try {
        const opening = opensWithIssuesWorktree(issue, this.project)
          ? this.openWithIssuesWorktree(issue)
          : this.spaceName(issue).then((spaceName) => { this.openWorktreeDialog(issue, spaceName); return null; });
        const starting = tracker.start(issue).then(() => null, (e) => `Could not start: ${e.message ?? e}`);
        const [openError, startError] = await Promise.all([opening, starting]);
        this.detailError = startError ?? openError;
        this.refresh(cx);
      } finally { this.opening = null; cx.notify(); }
    });
  }

  // This project's field edits that haven't saved yet, or whose save failed: [[id, edit]].
  projectEdits() {
    const project = this.project;
    if (!project) return [];
    return Object.entries(fieldEdits()).filter(([, edit]) => edit.root === project.root && edit.on === (project.on ?? null));
  }

  // Shows each edit on its issue, puts a failed one's field back, and saves the edits no copy has claimed.
  applyFieldEdits(cx) {
    for (const [id, edit] of this.projectEdits()) {
      const issue = this.findIssue(edit.issueId);
      if (edit.failed) { if (issue?.[edit.field] === edit.value) issue[edit.field] = edit.previous; continue; }
      if (issue) issue[edit.field] = edit.value;
      if (this.tracker && claimEdit(id)) this.saveFieldEdit(id, edit, cx);
    }
  }

  saveFieldEdit(id, edit, cx) {
    const tracker = this.tracker;
    cx.spawn(async (cx) => {
      try {
        const issue = this.issues.find((each) => each.id === edit.issueId) ?? await tracker.get(edit.issueId);
        if (!issue) throw new Error(`${edit.issueId} was not found`);
        await tracker.update(issue, { [edit.field]: edit.value });
        forgetEdits([id]);
        this.fadeSyncIcon(cx);
        announceIssueChange();
      } catch (e) {
        markEditFailed(id, `Could not change the ${edit.field} of ${edit.issueId}: ${e.message ?? e}`);
      }
      cx.notify();
    });
  }

  fadeSyncIcon(cx) {
    this.syncFade?.task.cancel();
    const started = Date.now();
    const task = cx.timer.every(SYNC_FADE_STEP_MS, (cx) => {
      const opacity = 1 - (Date.now() - started) / SYNC_FADE_MS;
      if (opacity > 0) this.syncFade = { task, opacity };
      else { task.cancel(); this.syncFade = null; }
      cx.notify();
    });
    this.syncFade = { task, opacity: 1 };
  }

  // Syncing while edits save, then fading out; an alert while any failed, which a click dismisses.
  syncIndicator(t) {
    const edits = this.projectEdits(), failed = edits.filter(([, edit]) => edit.failed);
    const icon = (name, color) => svg(`mods/issues/icons/${name}.svg`).size(SYNC_ICON_PX).text_color(color);
    const slot = div().id("issues-sync").flex_none().size(24).flex().items_center().justify_center();
    if (failed.length) {
      return slot.cursor_pointer().tooltip(`${failed.map(([, edit]) => edit.failed).join("\n")}\nClick to dismiss.`)
        .on_click((_e, cx) => { forgetEdits(failed.map(([id]) => id)); cx.notify(); })
        .child(icon("circle-alert", t.ansi1));
    }
    const spinner = () => icon("loader-circle", t.dim).spin(SYNC_SPIN_MS);
    if (edits.length) return slot.tooltip("Saving to the tracker…").child(spinner());
    if (this.syncFade) return slot.opacity(this.syncFade.opacity).child(spinner());
    return null;
  }

  // Starting and continuing work wait on the tracker and issues worktree, so the footer says what they're doing meanwhile.
  showOpening(issue, status, cx) {
    this.opening = { id: issue.id, status };
    cx.notify();
  }

  openingFooter(t) {
    return h_flex().flex_none().h(30).px(14).items_center().border_t(1).border_color(t.border)
      .text_size(11).text_color(t.dim).child(div().min_w(0).truncate().child(this.opening.status));
  }

  delegateToCloudAgent(issue, cx) {
    const tracker = this.tracker;
    this.delegating = issue.id; this.detailError = null;
    cx.spawn(async (cx) => {
      try { await tracker.delegate(issue); }
      catch (e) { this.detailError = `Could not delegate: ${e.message ?? e}`; }
      this.delegating = null;
      this.refresh(cx);
      cx.notify();
    });
    cx.notify();
  }

  // Picks up an issue already in progress: its space when one is open, else a new space on its worktree,
  // else a new worktree on its branch, fetched from origin when the work began elsewhere.
  continueWork(issue, cx) {
    const project = this.project;
    this.detailError = null;
    this.showOpening(issue, `Opening ${issue.id}'s worktree…`, cx);
    cx.spawn(async (cx) => {
      try {
        if (opensWithIssuesWorktree(issue, project)) this.detailError = await this.openWithIssuesWorktree(issue);
        else {
          const spaceName = await this.spaceName(issue);
          const worktree = project && await worktreeFor(issue.branch, project);
          if (worktree?.space) run("space.select", { id: worktree.space.id });
          else if (worktree) run("space.new", { name: spaceName, folder: worktree.path, machine: worktree.on, ...workIssueSession(issue) });
          else this.openWorktreeDialog(issue, spaceName);
        }
      } catch (e) { this.detailError = `Could not continue: ${e.message ?? e}`; }
      this.opening = null;
      cx.notify();
    });
  }

  // Opens the issue's branch with issues worktree, which switches to the space already showing it, or opens one
  // nested under the repository's space with Claude working the issue. Returns an error message, or null.
  // Without issues installed, the worktree dialog opens instead.
  async openWithIssuesWorktree(issue) {
    const isNew = needsNewBranch(issue);
    const spaceName = await this.spaceName(issue);
    const args = ["worktree", "--branch", issue.branch, ...(isNew ? ["--new"] : []), "--name", spaceName, "--claude", workIssueSession(issue).task];
    const result = await exec("issues", args, { cwd: this.project.root, timeout: ISSUES_WORKTREE_TIMEOUT_MS }).catch(() => null);
    if (!result) { this.openWorktreeDialog(issue, spaceName); return null; }
    if (result.code === 0) return null;
    const lastLine = (result.stderr || result.stdout).trim().split("\n").pop();
    return `Could not open the worktree: ${lastLine || `issues worktree exited with ${result.code}`}`;
  }

  // The name the repository gives the issue's space; the issue's ID when the name can't be worked out.
  spaceName(issue) {
    return this.project ? issueSpaceName(this.project, issue.id).catch(() => issue.id) : Promise.resolve(issue.id);
  }

  openWorktreeDialog(issue, spaceName) {
    const project = this.project;
    openOverlay({
      mod: "issues", kind: "dialog", width: 440, height: 260,
      props: {
        folder: project?.root, machine: project?.on ?? null, action: "new",
        branch: issue.branch ?? undefined, name: spaceName, ...workIssueSession(issue),
      },
    });
  }
  // Expanding a group whose issues weren't listed lists them.
  toggle(group, cx) {
    this.expanded[group.id] = !this.isExpanded(group);
    if (group.unloaded && this.isExpanded(group)) this.refresh(cx);
    cx.notify();
  }

  isExpanded(group) {
    return this.expanded[group.id] ?? !group.collapsed;
  }

  // Room for SLA and priority under the ID when the tracker shows them, otherwise for the longest listed
  // ID, and in either case for the longest due date.
  idColumnWidth(groups) {
    const listed = groups.flatMap((group) => group.issues);
    const widest = (texts) => Math.max(0, ...texts.map((text) => text.length)) * ID_CHARACTER_PX;
    const dueWidth = widest(listed.map((issue) => dueStatus(issue)?.text ?? ""));
    return Math.max(this.prioritized() ? ID_COLUMN_PX : widest(listed.map((issue) => issue.id)), dueWidth);
  }

  prioritized() {
    return this.tracker?.prioritized !== false;
  }

  row(issue, idColumnWidth, t) {
    const blockers = holdingBlockers(issue, this.issues);
    const waiting = waitingIssues(issue, this.issues), sla = slaStatus(issue), due = dueStatus(issue), pullRequestCount = issue.pullRequests?.length ?? 0;
    const finishable = canFinishWork(issue), startable = canStartWork(issue, this.issues);
    const { inSpace, inActiveSpace } = this.spaceShowingWorktree(issue);
    return v_flex().id(`issue-${issue.id}`).flex_none().px(10).py(6).gap(3).rounded(7).cursor_pointer()
      .hover((s) => s.bg(rowHover(t)))
      .on_mouse_up("left", (_e, cx) => { cx.stop_propagation(); this.openId = issue.id; cx.notify(); })
      .child(h_flex().gap(8).items_start()
        .child(v_flex().flex_none().min_w(idColumnWidth).when(this.prioritized(), (e) => e.w(idColumnWidth)).pt(1).gap(3).text_size(11)
          .child(div().whitespace_nowrap().text_color(t.accent).child(issue.id))
          .when(Boolean(sla), (e) => e.child(div().text_color(t[SLA_COLORS[sla.risk]]).child([SLA_ICONS[sla.risk], sla.text].filter(Boolean).join(" "))))
          .when(Boolean(due), (e) => e.child(div().whitespace_nowrap().text_color(t[DUE_COLORS[due.urgency]]).child(due.text)))
          .when(issue.priority > 0, (e) => e.child(div().id(`priority-${issue.id}`).flex_none().tooltip(PRIORITIES[issue.priority])
            .child(svg(`mods/issues/icons/${PRIORITY_ICONS[issue.priority]}.svg`).size(PRIORITY_ICON_PX).text_color(t[PRIORITY_COLORS[issue.priority]] ?? t.dim)))))
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().whitespace_normal().child(issue.title))
          .when(issue.labels.length > 0 || blockers.length > 0 || waiting.length > 0 || pullRequestCount > 0, (e) => e.child(h_flex().flex_wrap().gap_x(8).gap_y(2).items_center().text_size(11).text_color(t.dim).overflow_hidden()
            .children(labelChips(issue, t).slice(0, 3))
            .when(pullRequestCount > 0, (e) => e.child(h_flex().flex_none().gap(3).items_center()
              .child(svg("mods/issues/icons/pull-request.svg").flex_none().size(11))
              .child(div().child(String(pullRequestCount)))))
            .when(blockers.length > 0, (e) => e.child(h_flex().flex_none().gap(4).items_center().text_color(t.blocked)
              .child(div().flex_none().child("Blocked by"))
              .child(issueLinks(`row-blocker-${issue.id}`, blockers, this.links, t, t.blocked))))
            .when(waiting.length > 0, (e) => e.child(h_flex().flex_none().gap(4).items_center()
              .child(div().flex_none().child("Blocking"))
              .child(issueLinks(`row-blocking-${issue.id}`, waiting, this.links, t, t.accent))))))
          .when(Boolean(issue.assignee), (e) => e.child(this.assignee(issue, t))))
        .when(Boolean(this.tracker?.writable), (e) => e.child(h_flex().flex_none().w(ACTION_COLUMN_PX).justify_end()
          .when(finishable || startable || inSpace, (e) => e.child(workButton(`row-${issue.id}`, {
            finishable, startable, inSpace, inActiveSpace, opening: this.opening?.id === issue.id, onStart: (cx) => this.startWork(issue, cx), onContinue: (cx) => this.continueWork(issue, cx),
          }, t, { primary: false, compact: true }))))));
  }

  // Whether a space shows the issue's worktree, and whether it is the active space.
  spaceShowingWorktree(issue) {
    const space = worktreeSpace(this.repository, issue.branch);
    return { inSpace: Boolean(space), inActiveSpace: Boolean(space?.active) };
  }

  // The assignee's name after their avatar once it is cached, then the agent it's delegated to, if any.
  assignee(issue, t, textColor = t.dim) {
    const avatar = avatarImage(issue.assigneeAvatar, (loading) => this.avatarLoads.push(loading));
    const delegateAvatar = avatarImage(issue.delegateAvatar, (loading) => this.avatarLoads.push(loading));
    return h_flex().min_w(0).gap(5).items_center().text_size(11).text_color(textColor)
      .when(Boolean(avatar), (e) => e.child(image(avatar ?? "").flex_none().size(AVATAR_PX).rounded(AVATAR_PX / 2)))
      .child(div().min_w(0).truncate().child(issue.assignee ?? ""))
      .when(Boolean(issue.delegate), (e) => e
        .child(div().flex_none().child(">"))
        .child(delegateAvatar
          ? image(delegateAvatar).flex_none().size(AVATAR_PX).rounded(AVATAR_PX / 2)
          : svg("mods/issues/icons/cloud.svg").flex_none().size(AVATAR_PX).text_color(t.ansi4))
        .child(div().min_w(0).truncate().child(issue.delegate ?? "")));
  }

  // The group's header, and its first `shown` issues when it is expanded, then Show more for the rest.
  group(group, shown, idColumnWidth, t) {
    const expanded = this.isExpanded(group), hidden = group.issues.length - shown;
    const color = STATUS_COLORS[group.id];
    const fill = color ? tinted(color) : t.raised;
    return v_flex().flex_none().gap(1)
      .child(h_flex().id(`group-${group.id}`).mt(6).px(10).py(4).gap(6).items_center().rounded(6).cursor_pointer().text_size(11)
        .bg(fill).text_color(t.foreground)
        .on_click((_e, cx) => this.toggle(group, cx))
        .child(div().opacity(0.7).child(expanded ? "▾" : "▸"))
        .child(div().font_semibold().child(group.label))
        .when(!group.unloaded || expanded, (e) => e.child(div().opacity(0.7).child(group.unloaded ? "…" : String(group.issues.length)))))
      .when(expanded, (e) => e.children(group.issues.slice(0, shown).map((issue) => this.row(issue, idColumnWidth, t))))
      .when(expanded && hidden > 0, (e) => e.child(div().id(`show-more-${group.id}`).flex_none().px(10).py(6).rounded(7)
        .cursor_pointer().text_size(12).text_color(t.accent).hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { this.rowLimit += ROW_LIMIT; cx.notify(); })
        .child(`Show ${hidden} more`)));
  }

  // Each expanded group's share of the rows the list draws, in order, until the limit runs out.
  shownCounts(groups) {
    let remaining = this.rowLimit;
    return groups.map((group) => {
      if (!this.isExpanded(group)) return 0;
      const shown = Math.min(group.issues.length, remaining);
      remaining -= shown;
      return shown;
    });
  }

  emptyText() {
    return this.loaded ? "No issues yet" : "Loading…";
  }

  // The scope listed now: { scope, project, milestone }, a milestone's under its project.
  currentScope() {
    const { scopes } = this.tracker;
    return findScope(scopes, this.listedScope) ?? { scope: scopes[0], project: null, milestone: null };
  }

  // The tracker's name, or a dropdown of the scopes it can list, showing the one listed now: a milestone
  // shows its project, and the filter bar below narrows it.
  trackerLabel(t) {
    const { scopes, name } = this.tracker;
    if (!scopes) return div().flex_none().text_size(11).text_color(t.dim).child(name);
    const { scope, project } = this.currentScope(), shown = project ?? scope;
    return scopeDropdown("issues-scope", shown.label, () => openScopeMenu(scopes, shown.id, this.scopeKey), t).flex_shrink(1).max_w(SCOPE_DROPDOWN_MAX_PX);
  }

  // Every label on the listed issues, by name.
  listedLabels() {
    return [...new Set(this.issues.flatMap((issue) => issue.labels))].sort((a, b) => a.localeCompare(b));
  }

  // The label the list is narrowed to: the one picked, unless no listed issue carries it any more.
  shownLabel(labels) {
    const label = this.scopeKey ? selectedLabel(this.scopeKey) : null;
    return labels.includes(label) ? label : null;
  }

  // Under a project with milestones, a dropdown that narrows the list to one of them; when the listed
  // issues carry labels, a dropdown that narrows it to one label.
  filterBar(labels, label, t) {
    const { project, milestone } = this.tracker?.scopes ? this.currentScope() : {};
    const hasMilestones = Boolean(project?.milestones.length);
    if (!hasMilestones && !labels.length) return null;
    const filterName = (name) => div().flex_none().text_size(11).text_color(t.dim).child(name);
    return h_flex().h(38).flex_none().px(14).gap(8).items_center().justify_end().border_b(1).border_color(t.border)
      .when(hasMilestones, (e) => e.child(filterName("Milestone"))
        .child(scopeDropdown("issues-milestone", milestone?.label ?? "All milestones",
          () => openScopeMenu([{ id: project.id, label: "All milestones" }, ...project.milestones], milestone?.id ?? project.id, this.scopeKey), t).flex_shrink(1)))
      .when(labels.length > 0, (e) => e.child(filterName("Label"))
        .child(scopeDropdown("issues-label", label ?? "All labels", () => openLabelMenu(labels, label, this.scopeKey), t).flex_shrink(1)));
  }

  refreshButton(t) {
    return div().id("issues-refresh").flex_none().size(24).flex().items_center().justify_center().rounded(6)
      .border_1().border_color(t.border).bg(t.raised)
      .when(!this.refreshing, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { this.refresh(cx); cx.notify(); }))
      .child(svg("mods/issues/icons/rotate-cw.svg").size(REFRESH_ICON_PX).text_color(this.refreshing ? t.dim : t.foreground));
  }

  header(t) {
    const syncIndicator = this.syncIndicator(t);
    return h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().font_semibold().child("Issues"))
      .when(Boolean(this.project), (e) => e.child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(folderName(this.project.root))))
      .child(div().flex_1())
      .when(Boolean(syncIndicator), (e) => e.child(syncIndicator))
      .when(Boolean(this.tracker), (e) => e.child(this.refreshButton(t)).child(this.trackerLabel(t)));
  }

  // The panel's header over `content`, which stands in for the list.
  listFrame(content, t) {
    return v_flex().size_full().min_h(0).child(this.header(t)).child(content);
  }

  // Start and Continue in a row report their failures in detailError, so the list shows them too.
  list(t) {
    if (this.untrackable) return this.listFrame(untrackableView(this.untrackable, t), t);
    if (this.setup) return this.setup.render(t, { onRetry: (cx) => { forgetLookups(); this.refresh(cx); cx.notify(); }, header: this.header(t) });
    const labels = this.listedLabels(), label = this.shownLabel(labels);
    const groups = groupIssues(this.issues, this.unloaded, label), error = this.error ?? this.detailError, filterBar = this.filterBar(labels, label, t);
    const shown = this.shownCounts(groups), idColumnWidth = this.idColumnWidth(groups);
    const drawnIssues = groups.flatMap((group, index) => group.issues.slice(0, shown[index]));
    this.agentOrder.follow(drawnIssues.map((issue) => worktreeSpace(this.repository, issue.branch)));
    return v_flex().size_full().min_h(0)
      .child(this.header(t))
      .when(Boolean(filterBar), (e) => e.child(filterBar))
      .when(Boolean(error), (e) => e.child(div().flex_none().px(14).py(6).text_size(11).text_color(t.ansi1).whitespace_normal().child(error ?? "")))
      .child(v_flex().id("issues-list").flex_1().min_h(0).overflow_y_scrollbar().p(6).gap(1)
        .children(groups.map((group, index) => this.group(group, shown[index], idColumnWidth, t)))
        .when(!groups.length && !error, (e) => e.child(div().p(8).text_color(t.dim).child(this.emptyText()))));
  }

  render(cx) {
    if (this.menu) return this.menu.render();
    if (this.worktreeDialog) return this.worktreeDialog.render(cx);
    if (contextKey() !== this.context) this.refresh(cx, { reuse: true });
    else if (issuesChangedAt() !== this.seenChangeAt) this.refresh(cx);
    else if (this.scopeKey && selectedScope(this.scopeKey) !== this.listedScope) { this.listedScope = selectedScope(this.scopeKey); this.rowLimit = ROW_LIMIT; this.refresh(cx); }
    else this.refreshOnReturn(cx);
    this.openRequestedIssue(cx);
    this.applyFieldEdits(cx);
    this.setup?.takePickedTeam(cx);
    const t = theme(), issue = this.findIssue(this.openId);
    publishOpenIssue(this.project && !this.project.on ? this.project.root : null, issue).catch(() => {});
    this.avatarLoads = [];
    const content = issue
      ? (this.loadBody(issue, cx), issueDetail({
        issue, writable: this.tracker?.writable, prioritized: this.prioritized(),
        editor: this.editing?.state ?? null, saving: this.saving, error: this.detailError, ...this.links,
        syncIndicator: this.syncIndicator(t),
        assignee: issue.assignee ? this.assignee(issue, t, t.muted) : null,
        blocking: blockedIssues(issue, this.issues),
        onBack: (cx) => this.back(cx),
        onMenu: (field) => openMenu(field, issue, this.project, this.tracker?.statuses),
        onEdit: (cx) => this.edit(issue, cx),
        onToggleTask: (line, cx) => this.toggleTask(issue, line, cx),
        onLink: (url, cx) => this.openLink(issue, url, cx),
        linkFiles: (markdown) => linkCodeSpanFiles(markdown, this.project.root, this.filesInBody(issue, cx)),
        startable: canStartWork(issue, this.issues),
        opening: this.opening?.id === issue.id,
        onStart: (cx) => this.startWork(issue, cx),
        finishable: canFinishWork(issue),
        ...this.spaceShowingWorktree(issue),
        onContinue: (cx) => this.continueWork(issue, cx),
        onDelegate: this.tracker?.delegate && ((cx) => this.delegateToCloudAgent(issue, cx)),
        delegated: Boolean(this.tracker?.isDelegated?.(issue)),
        delegating: this.delegating === issue.id,
        onSave: (cx) => this.save(cx),
        onCancel: (cx) => { this.stopEditing(); cx.notify(); },
      }, t))
      : this.list(t);
    const avatarLoads = this.avatarLoads;
    if (avatarLoads.length) cx.spawn(async (cx) => { await Promise.all(avatarLoads); cx.notify(); });
    return v_flex().id("issues").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border)
      .text_color(t.foreground).text_size(13)
      .child(v_flex().flex_1().min_h(0).child(content))
      .when(Boolean(this.opening), (e) => e.child(this.openingFooter(t)));
  }
}
