// A row under a view's header holding one dropdown, with its heading beside it and a border beneath, as the list's
// filters (filters.js) are shown: pressing the dropdown runs `onClick`, which opens a scope menu popup (menu.js).
// `rowBeneathHeader` is the fixed-height row these and the issue view's action bar (detail.js) share, so moving
// between views never shifts the content below it.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";

/** @import { NativeElement } from "gpui-kit" */
/** @import { Theme } from "./menu.js" */

export const ROW_HEIGHT_PX = 40;
export const ROW_BORDER_PX = 1;
export const ROW_PADDING_X_PX = 10;
export const DROPDOWN_HEIGHT_PX = 24;
const DROPDOWN_MAX_PX = 260;

/** @param {Theme} t */
export function rowBeneathHeader(t) {
  return h_flex()
    .flex_none()
    .h(ROW_HEIGHT_PX)
    .px(ROW_PADDING_X_PX)
    .items_center()
    .border_b(ROW_BORDER_PX)
    .border_color(t.border);
}

/**
 * @param {string} id
 * @param {string} label
 * @param {() => void} onClick
 * @param {Theme} t
 */
function dropdown(id, label, onClick, t) {
  return h_flex()
    .id(id)
    .min_w(0)
    .h(DROPDOWN_HEIGHT_PX)
    .px(8)
    .gap(6)
    .items_center()
    .rounded(6)
    .border_1()
    .border_color(t.border)
    .text_size(11)
    .text_color(t.foreground)
    .bg(t.raised)
    .cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_click(() => onClick())
    .child(div().min_w(0).truncate().child(label))
    .child(div().flex_none().text_color(t.dim).child("▾"));
}

/**
 * A row with `leading` on the left and the dropdown aligned to the right, as the settings view's Back and scope
 * picker are shown.
 * @param {string} id
 * @param {NativeElement} leading
 * @param {string} shown
 * @param {() => void} onClick
 * @param {Theme} t
 */
export function leadingFilterRow(id, leading, shown, onClick, t) {
  return rowBeneathHeader(t)
    .gap(8)
    .child(leading)
    .child(div().flex_1())
    .child(dropdown(id, shown, onClick, t).flex_shrink(1).max_w(DROPDOWN_MAX_PX));
}

/**
 * @param {string} id
 * @param {string} heading
 * @param {string} shown
 * @param {() => void} onClick
 * @param {Theme} t
 */
export function filterRow(id, heading, shown, onClick, t) {
  return rowBeneathHeader(t)
    .gap(8)
    .child(div().flex_none().text_size(11).font_semibold().text_color(t.dim).child(`${heading}:`))
    .child(dropdown(id, shown, onClick, t).flex_shrink(1).max_w(DROPDOWN_MAX_PX));
}
