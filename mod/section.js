// A section of a scrolling view, as the settings form and the issue view draw them: a small, bold, muted heading
// in capitals, with an optional count beside it, above its content, which is often a card: a bordered, rounded
// box filled a few percent from the panel's color.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { cardFill } from "./colors.js";

/** @import { Color, NativeElement } from "gpui-kit" */
/** @import { Theme } from "./menu.js" */

export const CARD_RADIUS_PX = 8;
// Headings and loose text sit this far inside a card's edge, so they line up with the text in cards.
export const SECTION_INSET_PX = 4;

/**
 * @param {string} title
 * @param {Theme} t
 * @param {number} [count]
 */
export function sectionHeading(title, t, count) {
  return h_flex()
    .flex_none()
    .px(SECTION_INSET_PX)
    .gap(6)
    .items_center()
    .text_size(11)
    .font_bold()
    .text_color(t.muted)
    .child(title.toUpperCase())
    .when(count != null, (e) => e.child(div().font_normal().text_color(t.dim).child(String(count))));
}

/**
 * @param {string} title
 * @param {NativeElement} content
 * @param {Theme} t
 * @param {number} [count]
 */
export function section(title, content, t, count) {
  return v_flex()
    .flex_none()
    .gap(12)
    .child(sectionHeading(title, t, count))
    .child(content);
}

/** @param {Theme} t */
export function card(t) {
  return v_flex()
    .rounded(CARD_RADIUS_PX)
    .border_1()
    .border_color(t.border)
    .bg(/** @type {Color} */ (cardFill(t)));
}
