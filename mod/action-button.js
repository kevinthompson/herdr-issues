// The issue view's action bar buttons: the same size as each other, drawn like the native pane header's, with
// only the primary action filled and the rest outlined.
import { div, svg } from "gpui-kit";
import { actionButtonState } from "./action-button-state.js";

/** @import { Context, NativeElement } from "gpui-kit" */
/** @import { Theme } from "./menu.js" */

export const ACTION_GAP_PX = 8;
const ICON_PX = 14;
export const BUTTON_HEIGHT_PX = 26;
const BUTTON_WIDTH_PX = 34;
const PRIMARY_HOVER_OPACITY = 0.85;

/**
 * @param {{ id: string, icon: string, tooltip: string, onClick: (cx: Context) => void, primary?: boolean, enabled?: boolean, busy?: boolean }} props
 * @param {Theme} t
 */
export function actionButton({ id, icon, tooltip, onClick, primary = false, enabled = true, busy = false }, t) {
  const state = actionButtonState({ primary, enabled, busy });
  const glyph = svg(`mods/issues/icons/${state.icon ?? icon}.svg`).size(ICON_PX);
  return div()
    .id(id)
    .flex_none()
    .w(BUTTON_WIDTH_PX)
    .h(BUTTON_HEIGHT_PX)
    .flex()
    .items_center()
    .justify_center()
    .rounded(4)
    .tooltip(tooltip)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_mouse_up("left", (_e, cx) => cx.stop_propagation())
    .when(primary, (e) => e.bg(t.solid).text_color(t.solid_foreground))
    .when(!primary, (e) => e.text_color(t.dim))
    .when(state.outlined, (e) => e.border_1().border_color(t.border))
    .when(state.opacity < 1, (e) => e.opacity(state.opacity))
    .when(state.interactive, (e) =>
      e
        .cursor_pointer()
        .hover((s) => (primary ? s.opacity(PRIMARY_HOVER_OPACITY) : s.bg(t.hover).text_color(t.foreground)))
        .on_click((_e, cx) => onClick(cx)),
    )
    .child(state.spin ? glyph.spin(state.spin) : glyph);
}

/**
 * Cancel and Save while editing keep their text labels, at the same height as the icon buttons.
 * @param {{ id: string, label: string, onClick: (cx: Context) => void, primary?: boolean, enabled?: boolean }} props
 * @param {Theme} t
 * @returns {NativeElement}
 */
export function textActionButton({ id, label, onClick, primary = false, enabled = true }, t) {
  const state = actionButtonState({ primary, enabled });
  return div()
    .id(id)
    .flex_none()
    .h(BUTTON_HEIGHT_PX)
    .px(10)
    .flex()
    .items_center()
    .rounded(4)
    .text_size(12)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_mouse_up("left", (_e, cx) => cx.stop_propagation())
    .when(primary, (e) => e.bg(t.solid).text_color(t.solid_foreground))
    .when(!primary, (e) => e.text_color(t.dim))
    .when(state.outlined, (e) => e.border_1().border_color(t.border))
    .when(state.opacity < 1, (e) => e.opacity(state.opacity))
    .when(state.interactive, (e) =>
      e
        .cursor_pointer()
        .hover((s) => (primary ? s.opacity(PRIMARY_HOVER_OPACITY) : s.bg(t.hover).text_color(t.foreground)))
        .on_click((_e, cx) => onClick(cx)),
    )
    .child(label);
}
