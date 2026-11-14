// The issues of the project in the focused pane: its git repository's root, or its folder outside one.
// Clicking an issue shows it in the panel in place of the list (detail.js). The list draws a limited
// number of rows, and Show more draws more. Status and priority dropdowns are popups of this same mod
// with props { menu } (menu.js), and the worktree dialog is a dialog of it with props { action }
// (worktree-dialog.js). Edit swaps an open issue's body for a Markdown editor; Save,
// Cmd-Enter or the issues.save key command writes it back to the tracker. Start and Continue open a
// Claude session working the issue in its worktree. Clicking a task-list
// checkbox in the body saves that one change at once, and the tracker records every checkbox
// changed in a burst of clicks together, once they pause. Statuses picked in the status menu are
// committed the same way.
import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, EditorState } from "gpui-base";
import { theme, props, settings, nextCommand, openOverlay, shared, spaces, notify, exec, run, watchFolder, appHome } from "herdr";
import { location, projectRoot, mainCheckout } from "./location.js";
import { trackerFor } from "./trackers/index.js";
import { settingsPath } from "./trackers/setting.js";
import { findScope } from "./trackers/linear.js";
import { publishScope, publishOpenIssue } from "./scope-context.js";
import { groupIssues, loadsFor, holdingBlockers, canStartWork, canFinishWork, blockedIssues, waitingIssues, slaStatus, PRIORITIES } from "./issue.js";
import { issueDetail, issueLinks, workButton, labelChips } from "./detail.js";
import { FieldMenu, ScopeMenu, openMenu, openScopeMenu, openLabelMenu, selectedScope, selectedLabel } from "./menu.js";
import { worktreeFor, repositoryState, deleteMergedBranches, worktreeSpace } from "./worktree.js";
import { toggleTask } from "./tasks.js";
import { linkTarget, codeSpanPaths, linkCodeSpanFiles } from "./links.js";
import { isTextFile, openInEditor } from "./editor.js";
import { avatarImage } from "./avatars.js";
import { lastList, fetchList } from "./lists.js";
import { issuesChangedAt, announceIssueChange } from "./changes.js";
import { pendingStatusCommits, takePendingStatusCommits, commitStatuses, queueStatusCommit } from "./status-commits.js";
import { mixColors, STATUS_COLORS, tinted } from "./colors.js";
import { fieldEdits, markEditFailed, forgetEdits, claimEdit } from "./edits.js";
import { WorktreeDialog } from "./worktree-dialog.js";
import { panelVisible } from "./visibility.js";

const POLL_MS = 60 * 1000;
// A local issues/ folder on a remote host can't be watched, but reading it is cheap.
const LOCAL_POLL_MS = 10 * 1000;
// A remote list at least this old refreshes when the person comes back to the panel or Herdr's window.
const STALE_ON_RETURN_MS = 10 * 1000;
// A Claude hook (claude-plugin/hooks/herdr-issues-created.sh) touches this file after Claude creates a remote issue.
const createdStampPath = () => `${appHome()}/data/issues/created`;
// Rows the list draws at first, and how many more each Show more adds: drawing every issue of a large
// team at once is too slow.
const ROW_LIMIT = 100;
const CHECKLIST_COMMIT_DELAY_MS = 5000;
const STATUS_COMMIT_DELAY_MS = 5000;
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

const workIssueSession = (issue) => ({ tab: "Claude", argv: ["claude"], task: `/issues:work ${issue.id}` });
// wt sets up new checkouts, which can take minutes in a box app.
const WT_TIMEOUT_MS = 10 * 60 * 1000;
// wt works on this computer's checkouts and needs the issue's branch.
const opensWithWt = (issue, project) => Boolean(issue.branch && project && !project.on);
const hasPullRequestOnBranch = (issue) => (issue.pullRequests ?? []).some((pullRequest) => pullRequest.branch === issue.branch);
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
    this.rowLimit = ROW_LIMIT;
    this.editing = null; this.saving = false; this.detailError = null;
    this.links = { hasIssue: (id) => this.hasIssue(id), onOpen: (id, cx) => this.open(id, cx) };
    this.refresh(cx, { reuse: true });
    cx.timer.every(LOCAL_POLL_MS, (cx) => { if (this.pollDue()) this.refresh(cx); else this.refreshOnReturn(cx); });
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
      this.context = context; this.project = null; this.tracker = null; this.issues = []; this.unloaded = new Set(); this.error = null; this.loaded = false; this.repository = null;
      this.scopeKey = null; this.listedScope = undefined; this.listKey = null;
      this.closeIssue(); this.focusHandled = null; this.rowLimit = ROW_LIMIT;
    }
    const generation = ++this.generation;
    this.refreshedAt = Date.now();
    this.seenChangeAt = issuesChangedAt();
    this.refreshing = true;
    cx.spawn(async (cx) => {
      try {
        const where = location();
        if (!where.cwd) throw new Error("No folder in focus");
        const root = await projectRoot(where);
        const scopeKey = await mainCheckout(root, where.on), scope = selectedScope(scopeKey);
        this.watchAppFiles(cx);
        const tracker = await trackerFor({ root, on: where.on });
        // Collapsed groups that can wait aren't listed, so Linear isn't asked for issues nobody is looking at.
        const loads = loadsFor((group) => this.isExpanded(group));
        const unloaded = new Set((tracker?.deferred?.(scope) ?? []).filter((each) => !loads.has(each)));
        const project = { root, on: where.on }, listKey = `${scopeKey}\n${scope ?? ""}\n${[...loads].sort()}`;
        // A polled tracker is slow to list, so a scope not shown yet starts from its last list.
        const polled = Boolean(tracker) && !tracker.changed;
        this.listedScope = scope;
        if (polled && this.listKey !== listKey) {
          const last = await lastList(listKey);
          if (last && generation === this.generation) {
            Object.assign(this, { project, tracker, scopeKey, listKey, issues: last, unloaded, loaded: true });
            cx.notify();
          }
        }
        const listIssues = () => tracker.list(scope, loads);
        const issues = !tracker ? [] : polled ? await fetchList(listKey, listIssues, reuse && tracker.kind !== "local") : await listIssues();
        if (generation !== this.generation) return;
        Object.assign(this, { project, tracker, scopeKey, listKey, issues: withLoadedBodies(issues, this.issues), unloaded, error: null });
        publishScope(scopeKey, tracker, scope).catch(() => {});
        this.watch(tracker, cx);
        this.scanRepository(project, generation, cx);
      } catch (e) { if (generation === this.generation) this.error = String(e.message ?? e); }
      finally { if (generation === this.generation) { this.loaded = true; this.refreshing = false; cx.notify(); } }
    });
  }

  // Reads the repository's worktrees and branches for the issues just listed, after the list shows, and
  // deletes the branches of done issues that have landed in main, so finished work leaves nothing behind.
  scanRepository(project, generation, cx) {
    cx.spawn(async (cx) => {
      const repository = await repositoryState(this.issues, project).catch(() => null);
      if (generation !== this.generation) return;
      this.repository = repository;
      cx.notify();
      if (!repository?.mergedFinished.length) return;
      const deleted = await deleteMergedBranches(repository.mergedFinished, repository).catch(() => []);
      if (deleted.length) notify({ title: `Deleted ${plural(deleted.length, "merged branch", "merged branches")}`, body: deleted.join(", ") });
    });
  }

  // A watched tracker refreshes when it changes, so only unwatched ones poll.
  pollDue() {
    if (this.tracker?.changed && this.watching) return false;
    const interval = this.tracker?.kind === "local" ? LOCAL_POLL_MS : POLL_MS;
    return Date.now() - this.refreshedAt >= interval;
  }

  // Polls can leave a remote list a minute old, so coming back to a panel that was out of sight refreshes it.
  refreshOnReturn(cx) {
    const visible = panelVisible(), returned = visible && this.visible === false;
    this.visible = visible;
    if (returned && this.tracker && this.tracker.kind !== "local" && Date.now() - this.refreshedAt >= STALE_ON_RETURN_MS) this.refresh(cx, { reuse: true });
  }

  // Keyed by the tracker's kind too, so a repository that switches trackers stops watching the old one.
  watch(tracker, cx) {
    const key = tracker?.changed ? `${this.context}\n${tracker.kind}` : null;
    if (this.watching === key) return;
    this.watching = key;
    if (!key) return;
    cx.spawn(async (cx) => {
      try {
        while (this.watching === key) {
          await tracker.changed();
          if (this.watching === key) this.refresh(cx);
        }
      } catch { if (this.watching === key) this.watching = null; }
    });
  }

  // issues.json picks each repository's tracker, and the created stamp says Claude just made an issue, so a change
  // to either refreshes the panel at once rather than at the next poll. The app's folder holds more than these
  // files, so other changes there are ignored.
  watchAppFiles(cx) {
    if (this.watchingAppFiles) return;
    this.watchingAppFiles = true;
    const folder = appHome(), files = [settingsPath(), createdStampPath()];
    cx.spawn(async (cx) => {
      try {
        // Changes arrive under the folder's real path when the app's folder is reached through a symlink.
        const realFolder = (await exec("pwd", ["-P"], { cwd: folder })).stdout.trim();
        const watched = new Set([folder, realFolder, ...files, ...files.map((file) => `${realFolder}${file.slice(folder.length)}`)]);
        for (;;) {
          const paths = await watchFolder(folder);
          if (paths.some((path) => watched.has(path))) this.refresh(cx);
        }
      } catch { this.watchingAppFiles = false; }
    });
  }

  // Keeps the issue as it was read, so saving can tell whether its file changed underneath the edit.
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
    this.openId = null;
  }

  // Shows another issue, such as a blocker, unless that would throw away unsaved edits.
  open(id, cx) {
    if (this.hasUnsavedEdits()) this.detailError = "Save or cancel your edits first";
    else { this.stopEditing(); this.openId = id; }
    cx.notify();
  }

  // Opens the issue the tabs bar asked for when its space was shown, once this space's issues have loaded.
  openRequestedIssue() {
    const request = shared("issues.focus"), space = spaces().find((each) => each.active);
    if (!request || !this.loaded || request.at === this.focusHandled || request.space !== space?.id) return;
    this.focusHandled = request.at;
    if (this.hasIssue(request.id) && !this.hasUnsavedEdits()) { this.stopEditing(); this.openId = request.id; }
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
    const { file, url: address } = linkTarget(url, issue.path ?? `${this.project.root}/`);
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
  // previous one wrote, so quick clicks never look like an edit made on disk meanwhile.
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
    this.scheduleChecklistCommit(tracker, issue, cx);
    cx.notify();
  }

  // Each click restarts the wait, so a run of clicks becomes one commit. Clicks in another
  // project's issues commit the earlier project's first.
  scheduleChecklistCommit(tracker, issue, cx) {
    if (this.pendingChecklists && this.pendingChecklists.tracker !== tracker) this.commitChecklistsLater(this.takePendingChecklists(), cx);
    const pending = this.pendingChecklists ??= { tracker, issues: new Map() };
    pending.issues.set(issue.id, { id: issue.id, file: issue.file });
    pending.timer?.cancel();
    pending.timer = cx.timer.after(CHECKLIST_COMMIT_DELAY_MS, (cx) => this.commitChecklistsLater(this.takePendingChecklists(), cx));
  }

  takePendingChecklists() {
    const pending = this.pendingChecklists;
    this.pendingChecklists = null;
    pending?.timer?.cancel();
    return pending;
  }

  commitChecklistsLater(pending, cx) {
    cx.spawn(async (cx) => {
      try { await this.commitChecklists(pending); }
      catch (e) { this.detailError = `Could not commit the checkboxes: ${e.message ?? e}`; cx.notify(); }
    });
  }

  async commitChecklists(pending) {
    if (!pending) return;
    await this.taskSaves?.catch(() => {});
    await pending.tracker.commitChecklists?.([...pending.issues.values()]);
  }

  // Each status change restarts the wait, so a run of changes becomes one commit.
  scheduleStatusCommits(cx) {
    const changedAt = pendingStatusCommits()?.changedAt;
    if (!changedAt || changedAt === this.statusChangeScheduled) return;
    this.statusChangeScheduled = changedAt;
    this.statusCommitTimer?.cancel();
    this.statusCommitTimer = cx.timer.after(STATUS_COMMIT_DELAY_MS, (cx) => cx.spawn(async () => {
      try { await commitStatuses(takePendingStatusCommits()); }
      catch (e) { notify({ title: "Could not commit the status change", body: String(e.message ?? e), level: "error" }); }
    }));
  }

  // Herdr's teardown hook: checkboxes and statuses still waiting for their commit get it now.
  async close() {
    await this.commitChecklists(this.takePendingChecklists()).catch(() => {});
    if (!this.menu && !this.worktreeDialog) await commitStatuses(takePendingStatusCommits()).catch(() => {});
  }

  // A fresh Claude session in a new worktree space on the issue's branch, working the issue with /issues:work.
  // Without a branch, the worktree dialog asks for one. The worktree opens while the tracker saves the start,
  // unless the tracker needs the start saved before the branch is made.
  startWork(issue, cx) {
    const tracker = this.tracker;
    if (!tracker?.writable) { this.detailError = "Can't mark this issue in progress here"; cx.notify(); return; }
    this.detailError = null;
    const opening = `Opening ${issue.id}'s worktree…`;
    this.showOpening(issue, tracker.startPrecedesWorktree ? `Marking ${issue.id} in progress…` : opening, cx);
    cx.spawn(async (cx) => {
      try {
        const starting = tracker.start(issue).then(() => null, (e) => `Could not start: ${e.message ?? e}`);
        if (tracker.startPrecedesWorktree) {
          this.detailError = await starting;
          if (this.detailError) return;
          this.showOpening(issue, opening, cx);
        }
        let openError = null;
        if (opensWithWt(issue, this.project)) openError = await this.openWithWt(issue, { unstarted: !hasPullRequestOnBranch(issue) });
        else this.openWorktreeDialog(issue);
        this.detailError = (await starting) ?? openError;
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
      const issue = this.issues.find((each) => each.id === edit.issueId);
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
        if (edit.field === "status" && tracker.commitStatuses) queueStatusCommit(edit.root, issue, edit.value);
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
    const icon = (name, color) => svg(`mods/issues/${name}.svg`).size(SYNC_ICON_PX).text_color(color);
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

  // Starting and continuing work wait on the tracker and wt, so the footer says what they're doing meanwhile.
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
        if (opensWithWt(issue, project)) this.detailError = await this.openWithWt(issue);
        else {
          const worktree = project && await worktreeFor(issue.branch, project);
          if (worktree?.space) run("space.select", { id: worktree.space.id });
          else if (worktree) run("space.new", { name: issue.id, folder: worktree.path, machine: worktree.on, ...workIssueSession(issue) });
          else this.openWorktreeDialog(issue);
        }
      } catch (e) { this.detailError = `Could not continue: ${e.message ?? e}`; }
      this.opening = null;
      cx.notify();
    });
  }

  // Opens the issue's worktree as `/issues:work` does: wt switches to the space already showing it, or opens
  // one nested under the repository's space with Claude working the issue. Returns an error message, or null.
  // Without wt installed, the worktree dialog opens instead. An unstarted issue's branch can't be on origin yet,
  // so wt skips fetching and branches from the local main.
  async openWithWt(issue, { unstarted = false } = {}) {
    const args = [issue.branch, ...(unstarted ? ["--new"] : []), "--name", issue.id, "--claude", workIssueSession(issue).task];
    const result = await exec("wt", args, { cwd: this.project.root, timeout: WT_TIMEOUT_MS }).catch(() => null);
    if (!result) { this.openWorktreeDialog(issue); return null; }
    if (result.code === 0) return null;
    const lastLine = (result.stderr || result.stdout).trim().split("\n").pop();
    return `Could not open the worktree: ${lastLine || `wt exited with ${result.code}`}`;
  }

  openWorktreeDialog(issue) {
    const project = this.project;
    openOverlay({
      mod: "issues", kind: "dialog", width: 440, height: 260,
      props: {
        folder: project?.root, machine: project?.on ?? null, action: "new",
        branch: issue.branch ?? undefined, name: issue.id, ...workIssueSession(issue),
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

  // Room for SLA and priority under the ID when the tracker shows them; otherwise just the longest listed ID.
  idColumnWidth(groups) {
    if (this.prioritized()) return ID_COLUMN_PX;
    const longestId = groups.reduce((longest, group) => group.issues.reduce((most, issue) => Math.max(most, issue.id.length), longest), 0);
    return longestId * ID_CHARACTER_PX;
  }

  prioritized() {
    return this.tracker?.prioritized !== false;
  }

  row(issue, idColumnWidth, t) {
    const blockers = holdingBlockers(issue, this.issues);
    const waiting = waitingIssues(issue, this.issues), sla = slaStatus(issue), pullRequestCount = issue.pullRequests?.length ?? 0;
    const finishable = canFinishWork(issue), startable = canStartWork(issue, this.issues);
    const inSpace = Boolean(worktreeSpace(this.repository, issue.branch));
    return v_flex().id(`issue-${issue.id}`).flex_none().px(10).py(6).gap(3).rounded(7).cursor_pointer()
      .hover((s) => s.bg(rowHover(t)))
      .on_mouse_up("left", (_e, cx) => { cx.stop_propagation(); this.openId = issue.id; cx.notify(); })
      .child(h_flex().gap(8).items_start()
        .child(v_flex().flex_none().min_w(idColumnWidth).when(this.prioritized(), (e) => e.w(idColumnWidth)).pt(1).gap(3).text_size(11)
          .child(div().whitespace_nowrap().text_color(t.accent).child(issue.id))
          .when(Boolean(sla), (e) => e.child(div().text_color(t[SLA_COLORS[sla.risk]]).child([SLA_ICONS[sla.risk], sla.text].filter(Boolean).join(" "))))
          .when(issue.priority > 0, (e) => e.child(div().id(`priority-${issue.id}`).flex_none().tooltip(PRIORITIES[issue.priority])
            .child(svg(`mods/issues/${PRIORITY_ICONS[issue.priority]}.svg`).size(PRIORITY_ICON_PX).text_color(t[PRIORITY_COLORS[issue.priority]] ?? t.dim)))))
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().whitespace_normal().child(issue.title))
          .when(issue.labels.length > 0 || blockers.length > 0 || waiting.length > 0 || pullRequestCount > 0, (e) => e.child(h_flex().flex_wrap().gap_x(8).gap_y(2).items_center().text_size(11).text_color(t.dim).overflow_hidden()
            .children(labelChips(issue, t).slice(0, 3))
            .when(pullRequestCount > 0, (e) => e.child(h_flex().flex_none().gap(3).items_center()
              .child(svg("mods/issues/pull-request.svg").flex_none().size(11))
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
            finishable, startable, inSpace, opening: this.opening?.id === issue.id, onStart: (cx) => this.startWork(issue, cx), onContinue: (cx) => this.continueWork(issue, cx),
          }, t, { primary: false, compact: true }))))));
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
          : svg("mods/issues/cloud.svg").flex_none().size(AVATAR_PX).text_color(t.ansi4))
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
    if (!this.loaded) return "Loading…";
    if (!this.tracker) return `No issues/ folder or Linear mapping for ${this.project?.root ?? "this folder"}`;
    return "No issues yet";
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
      .child(svg("mods/issues/rotate-cw.svg").size(REFRESH_ICON_PX).text_color(this.refreshing ? t.dim : t.foreground));
  }

  // Start and Continue in a row report their failures in detailError, so the list shows them too.
  list(t) {
    const labels = this.listedLabels(), label = this.shownLabel(labels);
    const groups = groupIssues(this.issues, this.unloaded, label), error = this.error ?? this.detailError, filterBar = this.filterBar(labels, label, t);
    const shown = this.shownCounts(groups), syncIndicator = this.syncIndicator(t), idColumnWidth = this.idColumnWidth(groups);
    return v_flex().size_full().min_h(0)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Issues"))
        .when(Boolean(this.project), (e) => e.child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(folderName(this.project.root))))
        .child(div().flex_1())
        .when(Boolean(syncIndicator), (e) => e.child(syncIndicator))
        .when(Boolean(this.tracker) && this.tracker.kind !== "local", (e) => e.child(this.refreshButton(t)))
        .when(Boolean(this.tracker), (e) => e.child(this.trackerLabel(t))))
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
    this.scheduleStatusCommits(cx);
    this.openRequestedIssue();
    this.applyFieldEdits(cx);
    const t = theme(), issue = this.issues.find((each) => each.id === this.openId);
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
        inSpace: Boolean(worktreeSpace(this.repository, issue.branch)),
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
