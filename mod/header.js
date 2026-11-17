// The header bar every view of the panel draws, and its icon button, with the values of Herdr's own pane
// header (the built-in `pane` mod) so the panel reads as part of the same UI: a 30px bar with a leading
// icon, a medium-weight title, dim secondary text that truncates, then the buttons on the right.
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";

/** @import { Color, Context, NativeElement } from "gpui-kit" */
/** @import { Theme } from "./menu.js" */

export const HEADER_HEIGHT_PX = 30;
export const HEADER_TEXT_PX = 12;
const HEADER_ICON_PX = 14;
const ICON_BUTTON_PADDING_PX = 3;
const TITLE_MAX_WIDTH_PX = 260;

/**
 * A button that is only an icon. A button with no `onClick` is dim and does nothing, and a `color` replaces the
 * dim icon color, which the hover then leaves alone.
 * @param {{ id: string, icon: string, tooltip: string, onClick?: ((cx: Context) => void) | null, color?: Color, spin?: number }} props
 * @param {Theme} t
 */
export function iconButton({ id, icon, tooltip, onClick, color, spin }, t) {
  const glyph = svg(`mods/issues/icons/${icon}.svg`).size(HEADER_ICON_PX);
  return div()
    .id(id)
    .flex_none()
    .p(ICON_BUTTON_PADDING_PX)
    .rounded(4)
    .text_color(color ?? t.dim)
    .tooltip(tooltip)
    .when(Boolean(onClick), (e) =>
      e
        .cursor_pointer()
        .hover((s) => (color ? s.bg(t.hover) : s.bg(t.hover).text_color(t.foreground)))
        .on_click((_e, cx) => /** @type {(cx: Context) => void} */ (onClick)(cx)),
    )
    .child(spin ? glyph.spin(spin) : glyph);
}

/** @param {(cx: Context) => void} onCollapse @param {Theme} t */
export const collapseButton = (onCollapse, t) =>
  iconButton({ id: "issues-collapse", icon: "panel-right-close", tooltip: "Collapse panel", onClick: onCollapse }, t);

/**
 * The header's full-width bar with its background and bottom line, empty, which the collapsed strip also draws
 * around its expand button.
 * @param {Theme} t
 */
export const headerCell = (t) =>
  h_flex().h(HEADER_HEIGHT_PX).w_full().flex_none().items_center().bg(t.background).border_b(1).border_color(t.border);

/**
 * @param {{ icon?: string, title: string, secondary?: string | null, trailing?: (NativeElement | null)[] }} props
 *   `icon` is the leading icon's name in mod/icons.
 * @param {Theme} t
 */
export function headerBar({ icon, title, secondary, trailing = [] }, t) {
  return headerCell(t)
    .px(10)
    .gap(8)
    .text_size(HEADER_TEXT_PX)
    .when(Boolean(icon), (e) =>
      e.child(svg(`mods/issues/icons/${icon}.svg`).size(HEADER_ICON_PX).flex_none().text_color(t.dim)),
    )
    .child(div().flex_none().truncate().max_w(TITLE_MAX_WIDTH_PX).font_medium().text_color(t.foreground).child(title))
    .child(
      div()
        .flex_1()
        .min_w(0)
        .truncate()
        .text_color(t.dim)
        .child(secondary ?? ""),
    )
    .children(trailing.filter(Boolean));
}
