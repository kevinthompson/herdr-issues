// The lines of an issue row in the list. The top line holds the issue's ID, then its pills, with the work button at
// the right; the ID truncates first, so the pills and the button stay on the line. The 11px lines beneath the title
// each wrap their own items, and a line with nothing to show is left out.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";

/** @import { NativeElement } from "gpui-kit" */
/** @import { Theme } from "./menu.js" */

/**
 * @param {string} id
 * @param {NativeElement[]} pills
 * @param {NativeElement | null} button
 * @param {Theme} t
 */
export const idLine = (id, pills, button, t) =>
  h_flex()
    .gap(12)
    .items_center()
    .child(
      h_flex()
        .flex_1()
        .min_w(0)
        .gap(6)
        .items_center()
        .text_size(11)
        .child(div().min_w(0).truncate().text_color(t.accent).child(id))
        .children(pills),
    )
    .when(Boolean(button), (e) => e.child(/** @type {NativeElement} */ (button)));

/**
 * @param {NativeElement[][]} lines each line's items
 * @param {Theme} t
 */
export const detailLines = (lines, t) =>
  lines
    .filter((items) => items.length > 0)
    .map((items) =>
      h_flex()
        .flex_wrap()
        .gap_x(8)
        .gap_y(2)
        .items_center()
        .text_size(11)
        .text_color(t.dim)
        .overflow_hidden()
        .children(items),
    );
