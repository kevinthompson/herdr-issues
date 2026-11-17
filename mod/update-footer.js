// The footer the panel shows while its checkout has an update to offer, with Update and a dismiss control, or,
// once an update finishes, the note that it did. update.js decides when there is an update and runs it.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { button } from "./detail.js";

/** @import { Context } from "gpui-kit" */
/** @import { Theme } from "./menu.js" */

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
    .text_size(11)
    .text_color(t.dim);
  if (!updateAvailable) {
    return row
      .child(div().flex_1().min_w(0).truncate().child(UPDATED_NOTE))
      .child(dismiss("issues-updated-dismiss", onDismissUpdated));
  }
  return row
    .child(div().flex_1().min_w(0).truncate().child("Update available"))
    .child(button("issues-update", "Update", onUpdate, t, { primary: true }).h(22).px(8).text_size(11))
    .child(dismiss("issues-update-dismiss", onDismissUpdate));
}
