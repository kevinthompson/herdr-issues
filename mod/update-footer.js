// The footer the panel shows while its checkout has an update to offer, one line of a notice icon, the offer and
// a link that starts the update, beside a dismiss control, or, once an update finishes, the note that it did.
// update.js decides when there is an update and runs it.
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { HEADER_TEXT_PX } from "./header.js";

/** @import { Context } from "gpui-kit" */
/** @import { Theme } from "./menu.js" */

const UPDATED_NOTE_TEXT_PX = 11;
const UPDATED_NOTE = "Updated. New Claude Code sessions pick up the plugin's update.";

/**
 * @param {Theme} t
 * @param {{ updateAvailable: boolean, onUpdate: (cx: Context) => void, onDismissUpdate: (cx: Context) => void, onDismissUpdated: (cx: Context) => void }} props
 */
export function updateFooter(t, { updateAvailable, onUpdate, onDismissUpdate, onDismissUpdated }) {
  /**
   * @param {string} id
   * @param {(cx: Context) => void} onDismiss
   */
  const dismiss = (id, onDismiss) =>
    div()
      .id(id)
      .flex_none()
      .size(20)
      .flex()
      .items_center()
      .justify_center()
      .rounded(5)
      .tooltip("Dismiss")
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => onDismiss(cx))
      .child("×");
  const row = h_flex()
    .flex_none()
    .h(30)
    .px(14)
    .gap(8)
    .items_center()
    .border_t(1)
    .border_color(t.border)
    .text_color(t.dim);
  if (!updateAvailable) {
    return row
      .text_size(UPDATED_NOTE_TEXT_PX)
      .child(div().flex_1().min_w(0).truncate().child(UPDATED_NOTE))
      .child(dismiss("issues-updated-dismiss", onDismissUpdated));
  }
  const updateLink = div()
    .id("issues-update")
    .flex_none()
    .text_color(t.accent)
    .cursor_pointer()
    .hover((s) => s.underline())
    .on_click((_e, cx) => onUpdate(cx))
    .child("Click here to update");
  return row
    .text_size(HEADER_TEXT_PX)
    .child(svg("mods/issues/icons/info.svg").flex_none().size(HEADER_TEXT_PX).text_color(t.dim))
    .child(
      h_flex()
        .flex_1()
        .min_w(0)
        .gap(4)
        .items_center()
        .child(div().flex_none().child("New version available."))
        .child(updateLink),
    )
    .child(dismiss("issues-update-dismiss", onDismissUpdate));
}
