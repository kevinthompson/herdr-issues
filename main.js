// The issues of the project in the focused pane: its git repository's root, or its folder outside one.
// Clicking an issue shows it in the panel in place of the list (detail.js). Dragging an issue onto
// another in its group changes its order. Status and priority dropdowns are popups of this same mod
// with props { menu } (menu.js). Edit swaps an open issue's body for a Markdown editor; Save,
// Cmd-Enter or the issues.save key command writes it back to the tracker. Start and Continue open a
// Claude session working the issue in its worktree. Clicking a task-list
// checkbox in the body saves that one change at once, and the tracker records every checkbox
// changed in a burst of clicks together, once they pause.
import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, EditorState } from "gpui-base";
import { theme, props, settings, nextCommand, openOverlay, shared, setShared, spaces, notify, exec, run } from "herdr";
import { location, projectRoot, mainCheckout } from "./location.js";
import { trackerFor } from "./trackers/index.js";
import { groupIssues, holdingBlockers, canStartWork, canFinishWork, blockedIssues, waitingIssues, reorder, slaStatus, unmergedPullRequests, PRIORITIES } from "./issue.js";
import { issueDetail, issueLinks, workButton, labelChips } from "./detail.js";
import { FieldMenu, ScopeMenu, openMenu, openScopeMenu, selectedScope } from "./menu.js";
import { worktreeFor, hasUncommittedChanges, isMerged, isCollaborative, mergeIntoMain, pullRequestFor, askClaude } from "./worktree.js";
import { toggleTask } from "./tasks.js";
import { linkTarget, codeSpanPaths, linkCodeSpanFiles } from "./links.js";
import { avatarImage } from "./avatars.js";
import { lastList, rememberList } from "./lists.js";
import { issuesChangedAt, announceIssueChange } from "./changes.js";

const POLL_MS = 5 * 60 * 1000;
const PULL_REQUEST_CHECK_MS = 2 * 60 * 1000;
const CHECKLIST_COMMIT_DELAY_MS = 5000;
const PRIORITY_COLORS = { 1: "ansi1", 2: "working" };
const AVATAR_PX = 14;
const SLA_COLORS = { breached: "ansi1", high: "ansi1", medium: "working", low: "dim" };
const SLA_ICONS = { breached: "🚨", high: "🔥", medium: "⚠️" };
// Wide enough for a five-digit ID such as CAL-12345 at the list's 11px.
const ID_COLUMN_PX = 68;
// The row's ▶ button, kept on rows without one so every title wraps at the same edge.
const ACTION_COLUMN_PX = 32;
// Linear's workflow state colors, tinted so headers stay calm on dark backgrounds.
const GROUP_TINT_ALPHA = "30";
const tinted = (color) => `${color}${GROUP_TINT_ALPHA}`;
const GROUP_COLORS = {
  "in-progress": "#f2c94c",
  "in-review": "#4cb782",
  todo: "#e2e2e2",
  blocked: "#eb5757",
  backlog: "#bec2c8",
  done: "#5e6ad2",
  canceled: "#95a2b3",
};
const contextKey = () => JSON.stringify(location());
// The new list, keeping each body already loaded for an issue that hasn't changed since.
function withLoadedBodies(issues, previous) {
  const loaded = new Map(previous.filter((issue) => issue.body !== null).map((issue) => [issue.id, issue]));
  return issues.map((issue) => {
    const before = issue.body === null && loaded.get(issue.id);
    return before && before.updated === issue.updated ? { ...issue, body: before.body } : issue;
  });
}

const folderName = (path) => path.split("/").filter(Boolean).pop() ?? path;

// Issues whose Done waits for their branch's pull request to merge: { id, branch, root, on }. Shared, so every
// copy of the panel shows the wait and it outlives a reload.
const AWAITING = "issues.awaitingPullRequest";
const awaitingPullRequests = () => shared(AWAITING) ?? [];
const sameRequest = (a, b) => a.id === b.id && a.branch === b.branch;
const workIssueSession = (issue) => ({ argv: ["claude"], task: `/work-issue ${issue.id}` });
const pullRequestAsk = (issue) => `Issue ${issue.id} is done. Open a pull request for this branch with the open-pull-request skill.`;

export default class Issues extends View {
  init(_props, cx) {
    if (props()?.menu) { this.menu = props().menu === "scope" ? new ScopeMenu() : new FieldMenu(); return; }
    this.issues = []; this.generation = 0; this.expanded = {};
    this.drag = null; this.dropTarget = null;
    this.editing = null; this.saving = false; this.detailError = null;
    this.links = { hasIssue: (id) => this.hasIssue(id), onOpen: (id, cx) => this.open(id, cx) };
    this.refresh(cx);
    cx.timer.every(POLL_MS, (cx) => this.refresh(cx));
    this.checkPullRequests(cx);
    cx.timer.every(PULL_REQUEST_CHECK_MS, (cx) => this.checkPullRequests(cx));
    cx.spawn(async (cx) => {
      for (; ;) {
        if (await nextCommand() === "save") this.save(cx);
        cx.notify();
      }
    });
  }

  refresh(cx) {
    const context = contextKey();
    if (context !== this.context) {
      this.context = context; this.project = null; this.tracker = null; this.issues = []; this.error = null; this.loaded = false;
      this.scopeKey = null; this.listedScope = undefined; this.listKey = null;
      this.closeIssue(); this.focusHandled = null;
    }
    const generation = ++this.generation;
    this.seenChangeAt = issuesChangedAt();
    this.refreshing = true;
    cx.spawn(async (cx) => {
      try {
        const where = location();
        if (!where.cwd) throw new Error("No folder in focus");
        const root = await projectRoot(where);
        const tracker = await trackerFor({ root, on: where.on });
        const scopeKey = await mainCheckout(root, where.on), scope = selectedScope(scopeKey);
        const project = { root, on: where.on }, listKey = `${scopeKey}\n${scope ?? ""}`;
        // A polled tracker is slow to list, so a scope not shown yet starts from its last list.
        const polled = Boolean(tracker) && !tracker.changed;
        this.listedScope = scope;
        if (polled && this.listKey !== listKey) {
          const last = await lastList(listKey);
          if (last && generation === this.generation) {
            Object.assign(this, { project, tracker, scopeKey, listKey, issues: last, loaded: true });
            cx.notify();
          }
        }
        const issues = tracker ? await tracker.list(scope) : [];
        if (generation !== this.generation) return;
        Object.assign(this, { project, tracker, scopeKey, listKey, issues: withLoadedBodies(issues, this.issues), error: null });
        if (polled) rememberList(listKey, issues).catch(() => {});
        this.watch(tracker, cx);
      } catch (e) { if (generation === this.generation) this.error = String(e.message ?? e); }
      finally { if (generation === this.generation) { this.loaded = true; this.refreshing = false; cx.notify(); } }
    });
  }

  watch(tracker, cx) {
    const context = this.context;
    if (!tracker?.changed || this.watching === context) return;
    this.watching = context;
    cx.spawn(async (cx) => {
      try {
        while (this.watching === context) {
          await tracker.changed();
          if (this.watching === context) this.refresh(cx);
        }
      } catch { if (this.watching === context) this.watching = null; }
    });
  }

  // Shows the new order at once, then saves every issue whose number changed.
  move(group, movingId, targetId, cx) {
    const tracker = this.tracker, changes = reorder(group.issues, movingId, targetId);
    if (!tracker?.writable || !changes.length) return;
    for (const { issue, order } of changes) issue.order = order;
    this.error = null;
    cx.spawn(async (cx) => {
      try { await Promise.all(changes.map(({ issue, order }) => tracker.update(issue, { order }))); }
      catch (e) { this.error = `Could not save the order: ${e.message ?? e}`; }
      this.refresh(cx);
    });
    cx.notify();
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
    if (issue.body !== null || this.loadingBody === issue.id || !tracker) return;
    this.loadingBody = issue.id;
    cx.spawn(async (cx) => {
      try {
        const full = await tracker.get(issue.id);
        if (!full) throw new Error(`${issue.id} was not found`);
        Object.assign(issue, { body: full.body, updated: full.updated });
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

  // Hands the link to macOS `open`, so each file opens in the app made for it and URLs in their own.
  openLink(issue, url, cx) {
    const { file, url: address } = linkTarget(url, issue.path ?? `${this.project.root}/`);
    if (file && this.project?.on) { this.detailError = `${file} is on ${this.project.on}, so it can't be opened here`; cx.notify(); return; }
    this.detailError = null;
    cx.spawn(async (cx) => {
      const opened = await exec("open", [file ?? address]).catch((e) => ({ code: 1, stderr: String(e.message ?? e) }));
      if (opened.code !== 0) this.detailError = `Could not open ${file ?? address}: ${opened.stderr.trim()}`;
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

  // Herdr's teardown hook: checkboxes still waiting for their commit get it now.
  async close() {
    await this.commitChecklists(this.takePendingChecklists()).catch(() => {});
  }

  // A fresh Claude session in a new worktree space on the issue's branch, working the issue with the work-issue skill.
  // Without a branch, the worktree dialog asks for one.
  startWork(issue, cx) {
    const tracker = this.tracker;
    if (!tracker?.writable) { this.detailError = "Can't mark this issue in progress here"; cx.notify(); return; }
    this.detailError = null;
    cx.spawn(async (cx) => {
      try { await tracker.start(issue); }
      catch (e) { this.detailError = `Could not start: ${e.message ?? e}`; cx.notify(); return; }
      this.openWorktree(issue);
      this.refresh(cx);
    });
  }

  // Picks up an issue already in progress: its space when one is open, else a new space on its worktree,
  // else a new worktree on its branch, fetched from origin when the work began elsewhere.
  continueWork(issue, cx) {
    const project = this.project;
    this.detailError = null;
    cx.spawn(async (cx) => {
      try {
        const worktree = project && await worktreeFor(issue.branch, project);
        if (worktree?.space) run("space.select", { id: worktree.space.id });
        else if (worktree) run("space.new", { name: issue.id, folder: worktree.path, machine: worktree.on, ...workIssueSession(issue) });
        else this.openWorktree(issue);
      } catch (e) { this.detailError = `Could not continue: ${e.message ?? e}`; }
      cx.notify();
    });
  }

  openWorktree(issue) {
    const project = this.project;
    openOverlay({
      mod: "fast-worktree", kind: "dialog", width: 440, height: 260,
      props: {
        folder: project?.root, machine: project?.on ?? null, action: "new",
        branch: issue.branch ?? undefined, name: issue.id, ...workIssueSession(issue),
      },
    });
  }

  // A clean worktree's branch is merged into main first in a personal project. In a collaborative
  // project, Done waits for the branch's pull request to merge instead, unless no Claude session is open to make one.
  // Anything else (no worktree, uncommitted changes) just marks the issue done. An issue with an
  // unmerged pull request attached is never marked done.
  finishWork(issue, cx) {
    const tracker = this.tracker, project = this.project;
    if (!tracker?.writable) { this.detailError = "Can't mark this issue done here"; cx.notify(); return; }
    if (unmergedPullRequests(issue).length) { this.detailError = "Merge its pull requests first"; cx.notify(); return; }
    this.detailError = null;
    cx.spawn(async (cx) => {
      try {
        const worktree = project && await worktreeFor(issue.branch, project);
        if (!worktree || await hasUncommittedChanges(worktree)) await tracker.finish(issue);
        else if (await this.landBranch(worktree)) await tracker.finish(issue);
        else await this.awaitPullRequest(issue, worktree, tracker, cx);
      } catch (e) { this.detailError = `Could not finish: ${e.message ?? e}`; }
      this.refresh(cx);
      cx.notify();
    });
  }

  // Whether the worktree's branch is in main now.
  async landBranch(worktree) {
    if (await isMerged(worktree)) return true;
    if (await isCollaborative(worktree)) return false;
    await mergeIntoMain(worktree);
    return true;
  }

  // Asks the Claude session open in the worktree's space for a pull request, unless one is already open
  // for the pushed branch. With neither, the issue is just marked done.
  async awaitPullRequest(issue, worktree, tracker, cx) {
    const request = { id: issue.id, branch: worktree.branch, root: worktree.main.path, on: worktree.on };
    if (!await pullRequestFor(request) && !await askClaude(worktree, pullRequestAsk(issue))) {
      await tracker.finish(issue);
      return;
    }
    setShared(AWAITING, [...awaitingPullRequests().filter((each) => !sameRequest(each, request)), request]);
    this.checkPullRequests(cx);
  }

  checkPullRequests(cx) {
    if (this.checkingPullRequests || !awaitingPullRequests().length) return;
    this.checkingPullRequests = true;
    cx.spawn(async (cx) => {
      for (const request of awaitingPullRequests()) {
        try { await this.finishOnPullRequest(request); }
        catch (e) { notify({ title: `Could not finish ${request.id}`, body: String(e.message ?? e), level: "error" }); }
      }
      this.checkingPullRequests = false;
      cx.notify();
    });
  }

  // Once the branch's pull request has merged and no other attached one is unmerged: marks the issue done.
  async finishOnPullRequest(request) {
    const pullRequest = await pullRequestFor(request);
    if (pullRequest?.state !== "MERGED" || !awaitingPullRequests().some((each) => sameRequest(each, request))) return;
    const tracker = await trackerFor(request), issue = await tracker?.get(request.id);
    if (issue && unmergedPullRequests(issue).length) return;
    setShared(AWAITING, awaitingPullRequests().filter((each) => !sameRequest(each, request)));
    if (issue && issue.status !== "done") await tracker.finish(issue);
    announceIssueChange();
    notify({ title: `${request.id} is done`, body: `Pull request: ${pullRequest.url}` });
  }

  toggle(group, cx) {
    this.expanded[group.id] = !this.isExpanded(group);
    cx.notify();
  }

  isExpanded(group) {
    return this.expanded[group.id] ?? !group.collapsed;
  }

  endDrag(cx) {
    if (!this.drag) return;
    this.drag = null; this.dropTarget = null;
    cx.notify();
  }

  row(issue, index, group, t) {
    const { issues } = group, blockers = holdingBlockers(issue, this.issues);
    const waiting = waitingIssues(issue, this.issues), sla = slaStatus(issue), pullRequestCount = issue.pullRequests?.length ?? 0;
    const finishable = canFinishWork(issue), startable = canStartWork(issue, this.issues);
    const dragging = this.drag?.id === issue.id;
    const dropping = this.drag && !dragging && this.drag.group === group.id && this.dropTarget === issue.id;
    const fromIndex = dropping ? issues.findIndex((each) => each.id === this.drag.id) : -1;
    // The accent line marks where the dragged issue lands: above when it moves up, below when down.
    return v_flex().id(`issue-${issue.id}`).relative().flex_none().px(10).py(6).gap(3).rounded(7).cursor_pointer()
      .when(dropping && fromIndex > index, (e) => e.child(div().absolute().top(0).left(6).right(6).h(2).bg(t.accent)))
      .when(dropping && fromIndex < index, (e) => e.child(div().absolute().bottom(0).left(6).right(6).h(2).bg(t.accent)))
      .when(dragging, (e) => e.opacity(0.45))
      .hover((s) => s.bg(t.hover))
      .on_hover((hovered, cx) => {
        if (hovered && this.drag) { this.dropTarget = issue.id; cx.notify(); }
      })
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.drag = { id: issue.id, group: group.id }; this.dropTarget = null; })
      .on_mouse_up("left", (_e, cx) => {
        cx.stop_propagation();
        const drag = this.drag;
        this.endDrag(cx);
        if (!drag) return;
        if (drag.id === issue.id) { this.openId = issue.id; cx.notify(); }
        else if (drag.group === group.id) this.move(group, drag.id, issue.id, cx);
      })
      .child(h_flex().gap(8).items_start()
        .child(v_flex().flex_none().w(ID_COLUMN_PX).pt(1).gap(3).text_size(11)
          .child(div().text_color(t.accent).child(issue.id))
          .when(Boolean(sla), (e) => e.child(div().text_color(t[SLA_COLORS[sla.risk]]).child([SLA_ICONS[sla.risk], sla.text].filter(Boolean).join(" "))))
          .when(issue.priority > 0, (e) => e.child(div().text_color(t[PRIORITY_COLORS[issue.priority]] ?? t.dim).child(PRIORITIES[issue.priority]))))
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
          .when(finishable || startable, (e) => e.child(workButton(`row-${issue.id}`, {
            finishable, startable, onStart: (cx) => this.startWork(issue, cx), onContinue: (cx) => this.continueWork(issue, cx),
          }, t, { primary: false, compact: true }))))));
  }

  // The assignee's name, after their avatar once it is cached.
  assignee(issue, t) {
    const avatar = avatarImage(issue.assigneeAvatar, (loading) => this.avatarLoads.push(loading));
    return h_flex().min_w(0).gap(5).items_center().text_size(11).text_color(t.dim)
      .when(Boolean(avatar), (e) => e.child(image(avatar ?? "").flex_none().size(AVATAR_PX).rounded(AVATAR_PX / 2)))
      .child(div().min_w(0).truncate().child(issue.assignee ?? ""));
  }

  group(group, t) {
    const expanded = this.isExpanded(group);
    const color = GROUP_COLORS[group.id];
    const fill = color ? tinted(color) : t.raised;
    return v_flex().flex_none().gap(1)
      .child(h_flex().id(`group-${group.id}`).mt(6).px(10).py(4).gap(6).items_center().rounded(6).cursor_pointer().text_size(11)
        .bg(fill).text_color(t.foreground)
        .on_click((_e, cx) => this.toggle(group, cx))
        .child(div().opacity(0.7).child(expanded ? "▾" : "▸"))
        .child(div().font_semibold().child(group.label))
        .child(div().opacity(0.7).child(String(group.issues.length))))
      .when(expanded, (e) => e.children(group.issues.map((issue, index) => this.row(issue, index, group, t))));
  }

  emptyText() {
    if (!this.loaded) return "Loading…";
    if (!this.tracker) return `No issues/ folder or Linear mapping for ${this.project?.root ?? "this folder"}`;
    return "No issues yet";
  }

  // The tracker's name, or a dropdown of the scopes it can list, showing the one listed now.
  trackerLabel(t) {
    const { scopes, name } = this.tracker;
    if (!scopes) return div().flex_none().text_size(11).text_color(t.dim).child(name);
    const current = scopes.find((scope) => scope.id === this.listedScope) ?? scopes[0];
    return h_flex().id("issues-scope").flex_none().min_w(0).h(24).px(8).gap(6).items_center().rounded(6).border_1().border_color(t.border)
      .text_size(11).text_color(t.foreground).bg(t.raised).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click(() => openScopeMenu(scopes, current.id, this.scopeKey))
      .child(div().min_w(0).truncate().child(current.label))
      .child(div().flex_none().text_color(t.dim).child("▾"));
  }

  refreshButton(t) {
    return div().id("issues-refresh").flex_none().size(24).flex().items_center().justify_center().rounded(6)
      .border_1().border_color(t.border).bg(t.raised).text_size(13)
      .when(this.refreshing, (e) => e.text_color(t.dim))
      .when(!this.refreshing, (e) => e.text_color(t.foreground).cursor_pointer().hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { this.refresh(cx); this.checkPullRequests(cx); cx.notify(); }))
      .child("↻");
  }

  // Start and Continue in a row report their failures in detailError, so the list shows them too.
  list(t) {
    const groups = groupIssues(this.issues), error = this.error ?? this.detailError;
    return v_flex().size_full().min_h(0)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Issues"))
        .when(Boolean(this.project), (e) => e.child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(folderName(this.project.root))))
        .child(div().flex_1())
        .when(Boolean(this.tracker), (e) => e.child(this.trackerLabel(t)))
        .child(this.refreshButton(t)))
      .when(Boolean(error), (e) => e.child(div().flex_none().px(14).py(6).text_size(11).text_color(t.ansi1).whitespace_normal().child(error ?? "")))
      .child(v_flex().id("issues-list").flex_1().min_h(0).overflow_y_scrollbar().p(6).gap(1)
        .children(groups.map((group) => this.group(group, t)))
        .when(!groups.length && !error, (e) => e.child(div().p(8).text_color(t.dim).child(this.emptyText()))));
  }

  render(cx) {
    if (this.menu) return this.menu.render();
    if (contextKey() !== this.context) this.refresh(cx);
    else if (issuesChangedAt() !== this.seenChangeAt) this.refresh(cx);
    else if (this.scopeKey && selectedScope(this.scopeKey) !== this.listedScope) { this.listedScope = selectedScope(this.scopeKey); this.refresh(cx); }
    this.openRequestedIssue();
    const t = theme(), issue = this.issues.find((each) => each.id === this.openId);
    this.avatarLoads = [];
    const content = issue
      ? (this.loadBody(issue, cx), issueDetail({
        issue, writable: this.tracker?.writable,
        editor: this.editing?.state ?? null, saving: this.saving, error: this.detailError, ...this.links,
        blocking: blockedIssues(issue, this.issues),
        onBack: (cx) => this.back(cx),
        onMenu: (field) => openMenu(field, issue, this.project, this.tracker?.statuses),
        onEdit: (cx) => this.edit(issue, cx),
        onToggleTask: (line, cx) => this.toggleTask(issue, line, cx),
        onLink: (url, cx) => this.openLink(issue, url, cx),
        linkFiles: (markdown) => linkCodeSpanFiles(markdown, this.project.root, this.filesInBody(issue, cx)),
        startable: canStartWork(issue, this.issues),
        onStart: (cx) => this.startWork(issue, cx),
        finishable: canFinishWork(issue),
        awaitingPullRequest: awaitingPullRequests().some((each) => sameRequest(each, issue)),
        hasUnmergedPullRequests: unmergedPullRequests(issue).length > 0,
        onDone: (cx) => this.finishWork(issue, cx),
        onContinue: (cx) => this.continueWork(issue, cx),
        onSave: (cx) => this.save(cx),
        onCancel: (cx) => { this.stopEditing(); cx.notify(); },
      }, t))
      : this.list(t);
    const avatarLoads = this.avatarLoads;
    if (avatarLoads.length) cx.spawn(async (cx) => { await Promise.all(avatarLoads); cx.notify(); });
    return v_flex().id("issues").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border)
      .text_color(t.foreground).text_size(13)
      .on_mouse_up("left", (_e, cx) => this.endDrag(cx))
      .child(content);
  }
}
