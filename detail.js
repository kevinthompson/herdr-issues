// One issue, drawn inside the panel in place of the list: a way back, its status and priority
// (each a dropdown), its other details and its Markdown body, which Edit swaps for an editor.
import { div } from "gpui-kit";
import { v_flex, h_flex, TextView, Editor } from "gpui-base";
import { optionLabel } from "./menu.js";

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
// stop the pointer events a list row would otherwise take as the start of a drag or an open.
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

// `blocking`: the IDs of issues that list this one in their blocked_by.
function facts(view, t) {
  const { issue: { labels, blockedBy, branch }, blocking } = view;
  return h_flex().flex_wrap().gap_x(14).gap_y(2).text_size(11).text_color(t.dim)
    .when(labels.length > 0, (e) => e.child(div().child(`Labels: ${labels.join(", ")}`)))
    .when(blockedBy.length > 0, (e) => e.child(linkedFact("detail-blocker", "Blocked by:", blockedBy, view, t)))
    .when(blocking.length > 0, (e) => e.child(linkedFact("detail-blocking", "Blocking:", blocking, view, t)))
    .when(Boolean(branch), (e) => e.child(div().child(`Branch: ${branch}`)));
}

function button(id, label, onClick, t, { primary = false, enabled = true } = {}) {
  return div().id(id).flex_none().h(26).px(10).flex().items_center().rounded(7).text_size(12)
    .when(enabled, (e) => e.bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground))
    .when(!enabled, (e) => e.bg(t.raised).text_color(t.dim))
    .when(enabled, (e) => e.cursor_pointer().hover((s) => s.opacity(0.85)).on_click((_e, cx) => onClick(cx)))
    .child(label);
}

function editActions({ writable, editor, saving, onEdit, onSave, onCancel }, t) {
  if (!writable) return div();
  if (!editor) return button("issue-edit", "Edit", onEdit, t);
  return h_flex().flex_none().gap(6)
    .child(button("issue-cancel", "Cancel", onCancel, t, { enabled: !saving }))
    .child(button("issue-save", saving ? "Saving…" : "Save", onSave, t, { primary: true, enabled: !saving }));
}

function body({ issue, editor }) {
  return editor
    ? Editor.new(editor).size_full()
    : TextView.markdown(`issue-body-${issue.id}`, issue.body).selectable().scrollable().size_full();
}

export function issueDetail(view, t) {
  const { issue, error, onBack } = view;
  return v_flex().id("issue-detail").size_full().min_h(0)
    .child(h_flex().h(42).flex_none().px(10).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().id("issue-back").flex_none().h(26).px(8).flex().items_center().rounded(7).cursor_pointer().text_color(t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => onBack(cx)).child("‹ Issues"))
      .child(div().flex_1())
      .child(div().flex_none().text_size(11).text_color(t.accent).child(issue.id))
      .when(!view.editor, (e) => e.child(button("issue-start", "Start", view.onStart, t, { primary: true, enabled: view.startable })))
      .child(editActions(view, t)))
    .when(Boolean(error), (e) => e.child(div().flex_none().px(14).py(6).text_size(11).text_color(t.ansi1).whitespace_normal().child(error ?? "")))
    .child(v_flex().flex_none().px(14).py(10).gap(8).border_b(1).border_color(t.border)
      .child(div().whitespace_normal().font_semibold().child(issue.title))
      .child(h_flex().flex_wrap().gap(14).items_center()
        .child(dropdown("status", "Status", view, t))
        .child(dropdown("priority", "Priority", view, t)))
      .child(facts(view, t)))
    .child(div().flex_1().min_h(0).px(14).py(10).child(body(view)));
}
