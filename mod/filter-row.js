// A row under a view's header holding one dropdown, with its heading beside it and a border beneath, as the list's
// filters (filters.js) are shown: pressing the dropdown runs `onClick`, which opens a scope menu popup (menu.js).
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";

const DROPDOWN_MAX_PX = 260;

function dropdown(id, label, onClick, t) {
  return h_flex().id(id).min_w(0).h(24).px(8).gap(6).items_center().rounded(6).border_1().border_color(t.border)
    .text_size(11).text_color(t.foreground).bg(t.raised).cursor_pointer().hover((s) => s.bg(t.hover))
    .on_click(() => onClick())
    .child(div().min_w(0).truncate().child(label))
    .child(div().flex_none().text_color(t.dim).child("▾"));
}

export function filterRow(id, heading, shown, onClick, t) {
  return h_flex().flex_none().px(14).py(8).gap(8).items_center().border_b(1).border_color(t.border)
    .child(div().flex_none().text_size(11).font_semibold().text_color(t.dim).child(`${heading}:`))
    .child(dropdown(id, shown, onClick, t).flex_shrink(1).max_w(DROPDOWN_MAX_PX));
}
