// One issue, drawn inside the panel in place of the list: a way back, its status and priority
// (each a dropdown), its other details and its Markdown body, which Edit swaps for an editor.
// Task-list items in the body are checkboxes that check off in place.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextView, Editor } from "gpui-base";
import { optionLabel } from "./menu.js";
import { bodySegments } from "./tasks.js";

function dropdown(field, label, { issue, writable, onMenu }, t) {
  return h_flex().gap(6).items_center().text_size(11)
    .child(div().text_color(t.dim).child(label))
    .child(h_flex().id(`field-${field}`).h(24).px(8).gap(6).items_center().rounded(6).border_1().border_color(t.border)
      .text_color(t.foreground).bg(t.raised)
      .when(writable, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => onMenu(field, cx)))
      .child(optionLabel(field, issue[field]))
      .when(writable, (e) => e.child(div().text_color(t.dim).child("▾"))));
}

// Issue IDs, each a link that opens that issue when the panel has it, separated by commas. Links
// stop the pointer events a list row would otherwise take as an open.
export function issueLinks(key, ids, { hasIssue, onOpen }, t, color) {
  return h_flex().flex_none().flex_wrap().gap_x(4).items_center().children(ids.map((id, index) => {
    const label = index < ids.length - 1 ? `${id},` : id;
    if (!hasIssue(id)) return div().flex_none().whitespace_nowrap().child(label);
    return div().id(`${key}-${id}`).flex_none().whitespace_nowrap().cursor_pointer().text_color(color)
      .hover((s) => s.underline())
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_mouse_up("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); onOpen(id, cx); })
      .child(label);
  }));
}

function linkedFact(key, label, ids, view, t) {
  return h_flex().gap(4).items_center()
    .child(div().flex_none().child(label))
    .child(issueLinks(key, ids, view, t, t.accent));
}

// A label as Linear draws it: a dot in the label's color before its name, when the tracker knows the color.
function labelChip(label, color, t) {
  return h_flex().flex_none().px(5).gap(4).items_center().rounded(4).border_1().border_color(t.border).text_color(t.muted)
    .when(Boolean(color), (e) => e.child(div().flex_none().size(6).rounded(3).bg(color)))
    .child(label);
}

export const labelChips = ({ labels, labelColors }, t) => labels.map((label) => labelChip(label, labelColors?.[label], t));

// `blocking`: the IDs of issues that list this one in their blocked_by.
function facts(view, t) {
  const { issue, issue: { labels, blockedBy, branch }, blocking } = view;
  return h_flex().flex_wrap().gap_x(14).gap_y(2).text_size(11).text_color(t.dim)
    .when(labels.length > 0, (e) => e.child(h_flex().flex_wrap().gap(4).items_center().child(div().child("Labels:")).children(labelChips(issue, t))))
    .when(blockedBy.length > 0, (e) => e.child(linkedFact("detail-blocker", "Blocked by:", blockedBy, view, t)))
    .when(blocking.length > 0, (e) => e.child(linkedFact("detail-blocking", "Blocking:", blocking, view, t)))
    .when(Boolean(branch), (e) => e.child(div().child(`Branch: ${branch}`)));
}

const PULL_REQUEST_STATUSES = {
  draft: ["Draft", "dim"], open: ["Open", "ansi2"], inReview: ["In review", "ansi2"], approved: ["Approved", "ansi2"],
  merged: ["Merged", "ansi5"], closed: ["Closed", "ansi1"],
};

// Each pull request attached to the issue, opened in the browser when clicked.
function pullRequests({ issue: { id, pullRequests }, onLink }, t) {
  return v_flex().gap(3).text_size(11)
    .child(div().text_color(t.dim).child("Pull requests:"))
    .children(pullRequests.map((pullRequest) => {
      const [status, color] = PULL_REQUEST_STATUSES[pullRequest.status] ?? [pullRequest.status, "dim"];
      const reference = pullRequest.number ? `${pullRequest.repo ?? ""}#${pullRequest.number}` : "";
      return h_flex().id(`pull-request-${id}-${pullRequest.url}`).gap(6).items_start().cursor_pointer()
        .hover((s) => s.underline())
        .on_click((_e, cx) => onLink(pullRequest.url, cx))
        .child(div().flex_none().text_color(t[color]).child(status))
        .child(div().flex_none().text_color(t.accent).child(reference))
        .child(div().flex_1().min_w(0).whitespace_normal().child(pullRequest.title));
    }));
}

// An icon has its own color, so a button whose label is an icon redraws it in the hover color.
let hoveredButton = null;

// Buttons stop the pointer events a list row would otherwise take as an open. A label may be a
// function of the button's text color, for an icon.
function button(id, label, onClick, t, { primary = false, enabled = true, tooltip = null, primaryOnHover = false } = {}) {
  const solidOnHover = primaryOnHover && !primary;
  const hoverStyle = solidOnHover ? (s) => s.bg(t.solid).text_color(t.solid_foreground) : (s) => s.opacity(0.85);
  const textColor = !enabled ? t.dim
    : primary || (solidOnHover && hoveredButton === id) ? t.solid_foreground : t.foreground;
  return div().id(id).flex_none().h(26).px(10).flex().items_center().rounded(7).text_size(12)
    .when(tooltip, (e) => e.tooltip(tooltip))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_mouse_up("left", (_e, cx) => cx.stop_propagation())
    .bg(enabled && primary ? t.solid : t.raised).text_color(textColor)
    .when(enabled, (e) => e.cursor_pointer().hover(hoverStyle).on_click((_e, cx) => onClick(cx)))
    .when(enabled && typeof label === "function", (e) => e.on_hover((hovered, cx) => {
      if (hovered) hoveredButton = id;
      else if (hoveredButton === id) hoveredButton = null;
      cx.notify();
    }))
    .child(typeof label === "function" ? label(textColor) : label);
}

// Continue for an issue in progress, otherwise Start, which is disabled until work can start. An issue
// whose worktree a space already shows switches to that space instead, and the button stands out to say so.
// The list's compact button shows the issue's branch for both, so it fits beside a title. Each is disabled
// while the issue's worktree is opening.
export function workButton(key, { finishable, startable, inSpace, opening, onStart, onContinue }, t, { primary = true, compact = false } = {}) {
  if (inSpace) {
    return button(`${key}-space`, compact ? "↗" : "Go to space", onContinue, t, { primary: true, enabled: !opening, tooltip: "Switch to this issue's worktree space" });
  }
  const style = { primary, primaryOnHover: compact, enabled: !opening };
  const branchIcon = (color) => svg("mods/issues/git-branch-plus.svg").size(14).text_color(color);
  if (finishable) return button(`${key}-continue`, compact ? branchIcon : "Continue", onContinue, t, { ...style, tooltip: compact ? "Continue work" : null });
  return button(`${key}-start`, compact ? branchIcon : "Start", onStart, t, { ...style, enabled: startable && !opening, tooltip: compact ? "Start work" : null });
}

// Hands the issue to the Cloud Agent, disabled once it has the issue or while the handoff saves.
function cloudAgentButton({ delegated, delegating, onDelegate }, t) {
  const enabled = !delegated && !delegating;
  const tooltip = delegated ? "Delegated to Cloud Agent" : delegating ? "Delegating…" : "Delegate to Cloud Agent";
  return div().id("issue-delegate").flex_none().size(26).flex().items_center().justify_center().rounded(7).bg(t.raised)
    .tooltip(tooltip)
    .when(enabled, (e) => e.cursor_pointer().hover((s) => s.opacity(0.85)).on_click((_e, cx) => onDelegate(cx)))
    .child(svg("mods/issues/cloud.svg").size(14).text_color(enabled ? t.foreground : t.dim));
}

// Continue and Done for an issue in progress, otherwise Start.
function workActions(view, t) {
  if (!view.finishable) return workButton("issue", view, t);
  const { awaitingPullRequest, hasUnmergedPullRequests, onDone } = view;
  const blockedReason = awaitingPullRequest ? "Waiting for this branch's pull request to merge"
    : hasUnmergedPullRequests ? "This issue has pull requests that haven't merged" : null;
  return h_flex().flex_none().gap(6)
    .child(workButton("issue", view, t, { primary: false }))
    .child(button("issue-done", "Done", onDone, t, { primary: true, enabled: !blockedReason, tooltip: blockedReason }));
}

function editActions({ issue, writable, editor, saving, onEdit, onSave, onCancel }, t) {
  if (!writable || issue.body === null) return div();
  if (!editor) return button("issue-edit", "Edit", onEdit, t);
  return h_flex().flex_none().gap(6)
    .child(button("issue-cancel", "Cancel", onCancel, t, { enabled: !saving }))
    .child(button("issue-save", saving ? "Saving…" : "Save", onSave, t, { primary: true, enabled: !saving }));
}

const TASK_INDENT_PX = 9;
const AFTER_TASKS_PX = 14;

function taskItem(task, { issue, writable, onToggleTask, onLink, linkFiles }, t) {
  const box = div().id(`task-${issue.id}-${task.line}`).flex_none().mt(3).size(14).rounded(4).border_1().flex().items_center().justify_center()
    .text_size(10).border_color(task.checked ? t.accent : t.input).when(task.checked, (e) => e.bg(t.accent).text_color(t.accent_foreground).child("✓"))
    .when(writable, (e) => e.cursor_pointer().hover((s) => s.opacity(0.8)).on_click((_e, cx) => onToggleTask(task.line, cx)));
  return h_flex().flex_none().gap(8).items_start().pl(task.indent * TASK_INDENT_PX)
    .child(box)
    .child(TextView.markdown(`task-text-${issue.id}-${task.line}`, linkFiles(task.text)).selectable().flex_1().min_w(0)
      .on_link_click(onLink).text_color(task.checked ? t.muted : t.foreground));
}

function body(view, t) {
  const { issue, editor, onLink, linkFiles } = view;
  if (editor) return Editor.new(editor).size_full();
  if (issue.body === null) return div().text_color(t.dim).child("Loading…");
  return v_flex().id(`issue-body-${issue.id}`).size_full().overflow_y_scrollbar().gap(4)
    .children(bodySegments(issue.body).map((segment, index, segments) => segment.markdown !== undefined
      ? TextView.markdown(`issue-body-${issue.id}-${index}`, linkFiles(segment.markdown)).selectable().flex_none().on_link_click(onLink)
        .when(index > 0 && segments[index - 1].markdown === undefined, (e) => e.mt(AFTER_TASKS_PX))
      : taskItem(segment, view, t)));
}

export function issueDetail(view, t) {
  const { issue, error, onBack } = view;
  return v_flex().id("issue-detail").size_full().min_h(0)
    .child(h_flex().h(42).flex_none().px(10).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().id("issue-back").flex_none().h(26).px(8).flex().items_center().rounded(7).cursor_pointer().text_color(t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => onBack(cx)).child("‹ Issues"))
      .child(div().flex_1())
      .child(div().flex_none().text_size(11).text_color(t.accent).child(issue.id))
      .when(!view.editor && Boolean(view.onDelegate), (e) => e.child(cloudAgentButton(view, t)))
      .when(!view.editor, (e) => e.child(workActions(view, t)))
      .child(editActions(view, t)))
    .when(Boolean(error), (e) => e.child(div().flex_none().px(14).py(6).text_size(11).text_color(t.ansi1).whitespace_normal().child(error ?? "")))
    .child(v_flex().flex_none().px(14).py(10).gap(8).border_b(1).border_color(t.border)
      .child(div().whitespace_normal().font_semibold().child(issue.title))
      .child(h_flex().flex_wrap().gap(14).items_center()
        .child(dropdown("status", "Status", view, t))
        .child(dropdown("priority", "Priority", view, t)))
      .child(facts(view, t))
      .when(issue.pullRequests?.length > 0, (e) => e.child(pullRequests(view, t))))
    .child(div().flex_1().min_h(0).px(14).py(10).child(body(view, t)));
}
