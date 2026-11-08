// The issues of the project in the focused pane: its git repository's root, or its folder outside one.
// Clicking an issue shows it in the panel in place of the list (detail.js). Dragging an issue onto
// another in its group, or its hover arrows, changes its order. Status and priority dropdowns are
// popups of this same mod with props { menu } (menu.js). Edit swaps an open issue's body for a
// Markdown editor; Save, Cmd-Enter or the issues.save key command writes it back to the tracker.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, EditorState } from "gpui-base";
import { theme, props, settings, nextCommand, openOverlay, shared, spaces } from "herdr";
import { location, projectRoot } from "./location.js";
import { trackerFor } from "./trackers/index.js";
import { groupIssues, holdingBlockers, canStartWork, blockedIssues, waitingIssues, reorder, PRIORITIES } from "./issue.js";
import { issueDetail, issueLinks } from "./detail.js";
import { FieldMenu, openMenu } from "./menu.js";

const POLL_MS = 30000;
const PRIORITY_COLORS = { 1: "ansi1", 2: "working" };
// Linear's workflow state colors, tinted so headers stay calm on dark backgrounds.
const GROUP_TINT_ALPHA = "30";
const GROUP_COLORS = {
  "in-progress": "#f2c94c",
  todo: "#e2e2e2",
  blocked: "#eb5757",
  backlog: "#bec2c8",
  done: "#5e6ad2",
  canceled: "#95a2b3",
};
const contextKey = () => JSON.stringify(location());
const folderName = (path) => path.split("/").filter(Boolean).pop() ?? path;

export default class Issues extends View {
  init(_props, cx) {
    if (props()?.menu) { this.menu = new FieldMenu(); return; }
    this.issues = []; this.generation = 0; this.expanded = {};
    this.drag = null; this.dropTarget = null; this.hovered = null;
    this.editing = null; this.saving = false; this.detailError = null;
    this.links = { hasIssue: (id) => this.hasIssue(id), onOpen: (id, cx) => this.open(id, cx) };
    this.refresh(cx);
    cx.timer.every(POLL_MS, (cx) => this.refresh(cx));
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
      this.close(); this.focusHandled = null;
    }
    const generation = ++this.generation;
    cx.spawn(async (cx) => {
      try {
        const where = location();
        if (!where.cwd) throw new Error("No folder in focus");
        const root = await projectRoot(where);
        const tracker = await trackerFor({ root, on: where.on });
        const issues = tracker ? await tracker.list() : [];
        if (generation !== this.generation) return;
        Object.assign(this, { project: { root, on: where.on }, tracker, issues, error: null });
        this.watch(tracker, cx);
      } catch (e) { if (generation === this.generation) this.error = String(e.message ?? e); }
      finally { if (generation === this.generation) { this.loaded = true; cx.notify(); } }
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

  close() {
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

  hasIssue(id) {
    return this.issues.some((issue) => issue.id === id);
  }

  back(cx) {
    if (this.hasUnsavedEdits()) this.detailError = "Save or cancel your edits first";
    else this.close();
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

  // A fresh Claude session in a new worktree space on the issue's branch, told which issue to work on.
  // Without a branch, the worktree dialog asks for one.
  startWork(issue) {
    const issueFile = issue.file ? ` (issues/${issue.file})` : "";
    openOverlay({
      mod: "fast-worktree", kind: "dialog", width: 440, height: 260,
      props: {
        folder: this.project?.root, machine: this.project?.on ?? null, action: "new",
        branch: issue.branch ?? undefined, name: issue.id, argv: ["claude"],
        task: `Start work on issue ${issue.id}: ${issue.title}${issueFile}`,
      },
    });
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

  arrow(id, label, enabled, onMove, t) {
    return div().id(id).flex_none().size(18).flex().items_center().justify_center().rounded(4).text_size(11)
      .text_color(enabled ? t.muted : t.border)
      .when(enabled, (e) => e.cursor_pointer().hover((s) => s.bg(t.raised).text_color(t.foreground)))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_mouse_up("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); if (enabled) onMove(cx); })
      .child(label);
  }

  row(issue, index, group, t) {
    const { issues } = group, blockers = holdingBlockers(issue, this.issues);
    const waiting = waitingIssues(issue, this.issues);
    const dragging = this.drag?.id === issue.id;
    const dropping = this.drag && !dragging && this.drag.group === group.id && this.dropTarget === issue.id;
    const fromIndex = dropping ? issues.findIndex((each) => each.id === this.drag.id) : -1;
    const showArrows = this.hovered === issue.id && !this.drag && this.tracker?.writable && issues.length > 1;
    // The accent line marks where the dragged issue lands: above when it moves up, below when down.
    return v_flex().id(`issue-${issue.id}`).relative().flex_none().px(10).py(6).gap(3).rounded(7).cursor_pointer()
      .when(dropping && fromIndex > index, (e) => e.child(div().absolute().top(0).left(6).right(6).h(2).bg(t.accent)))
      .when(dropping && fromIndex < index, (e) => e.child(div().absolute().bottom(0).left(6).right(6).h(2).bg(t.accent)))
      .when(dragging, (e) => e.opacity(0.45))
      .hover((s) => s.bg(t.hover))
      .on_hover((hovered, cx) => {
        if (hovered) { this.hovered = issue.id; if (this.drag) this.dropTarget = issue.id; }
        else if (this.hovered === issue.id) this.hovered = null;
        cx.notify();
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
        .child(div().flex_none().pt(1).text_size(11).text_color(t.accent).child(issue.id))
        .child(div().flex_1().min_w(0).whitespace_normal().child(issue.title))
        .when(showArrows, (e) => e.child(h_flex().flex_none().gap(2)
          .child(this.arrow(`up-${issue.id}`, "↑", index > 0, (cx) => this.move(group, issue.id, issues[index - 1].id, cx), t))
          .child(this.arrow(`down-${issue.id}`, "↓", index < issues.length - 1, (cx) => this.move(group, issue.id, issues[index + 1].id, cx), t)))))
      .child(h_flex().flex_wrap().gap_x(8).gap_y(2).items_center().text_size(11).text_color(t.dim).overflow_hidden()
        .when(issue.priority > 0, (e) => e.child(div().flex_none().text_color(t[PRIORITY_COLORS[issue.priority]] ?? t.dim).child(PRIORITIES[issue.priority])))
        .children(issue.labels.slice(0, 3).map((label) => div().flex_none().px(5).rounded(4).border_1().border_color(t.border).text_color(t.muted).child(label)))
        .when(blockers.length > 0, (e) => e.child(h_flex().flex_none().gap(4).items_center().text_color(t.blocked)
          .child(div().flex_none().child("Blocked by"))
          .child(issueLinks(`row-blocker-${issue.id}`, blockers, this.links, t, t.blocked))))
        .when(waiting.length > 0, (e) => e.child(h_flex().flex_none().gap(4).items_center()
          .child(div().flex_none().child("Blocking"))
          .child(issueLinks(`row-blocking-${issue.id}`, waiting, this.links, t, t.accent)))));
  }

  group(group, t) {
    const expanded = this.isExpanded(group);
    const color = GROUP_COLORS[group.id];
    const fill = color ? `${color}${GROUP_TINT_ALPHA}` : t.raised;
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
    if (!this.tracker) return `No issues/ folder in ${this.project?.root ?? "this folder"}`;
    return "No issues yet";
  }

  list(t) {
    const groups = groupIssues(this.issues);
    return v_flex().size_full().min_h(0)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Issues"))
        .when(Boolean(this.project), (e) => e.child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(folderName(this.project.root))))
        .child(div().flex_1())
        .when(Boolean(this.tracker), (e) => e.child(div().flex_none().text_size(11).text_color(t.dim).child(this.tracker.name))))
      .when(Boolean(this.error), (e) => e.child(div().flex_none().px(14).py(6).text_size(11).text_color(t.ansi1).child(this.error ?? "")))
      .child(v_flex().id("issues-list").flex_1().min_h(0).overflow_y_scrollbar().p(6).gap(1)
        .children(groups.map((group) => this.group(group, t)))
        .when(!groups.length && !this.error, (e) => e.child(div().p(8).text_color(t.dim).child(this.emptyText()))));
  }

  render(cx) {
    if (this.menu) return this.menu.render();
    if (contextKey() !== this.context) this.refresh(cx);
    this.openRequestedIssue();
    const t = theme(), issue = this.issues.find((each) => each.id === this.openId);
    const content = issue
      ? issueDetail({
        issue, writable: this.tracker?.writable,
        editor: this.editing?.state ?? null, saving: this.saving, error: this.detailError, ...this.links,
        blocking: blockedIssues(issue, this.issues),
        onBack: (cx) => this.back(cx),
        onMenu: (field) => openMenu(field, issue, this.project),
        onEdit: (cx) => this.edit(issue, cx),
        startable: canStartWork(issue, this.issues),
        onStart: () => this.startWork(issue),
        onSave: (cx) => this.save(cx),
        onCancel: (cx) => { this.stopEditing(); cx.notify(); },
      }, t)
      : this.list(t);
    return v_flex().id("issues").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border)
      .text_color(t.foreground).text_size(13)
      .on_mouse_up("left", (_e, cx) => this.endDrag(cx))
      .child(content);
  }
}
