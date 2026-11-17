// A setting's row and the card of rows under a section heading, as the settings view (settings-form.js) and
// repository setup (setup.js) draw them, following AGENTS.md's UI design guidance: a row puts the setting's label
// and description on the left and its controls in a column on the right, a setting that applies only after
// another's choice follows it on the panel's color with that condition above its title, and a multi-line field
// spans the row beneath its label. The placeholders a typed setting understands sit in monospace chips under its
// description.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { settings } from "herdr";
import { chipFill } from "./colors.js";
import { card, section, CARD_RADIUS_PX } from "./section.js";

/** @import { Color, NativeElement } from "gpui-kit" */
/** @import { Theme } from "./menu.js" */

/** @typedef {{ title: string, sentence: string | null, after?: string, tokens?: [string, string][], wide?: boolean }} SettingLabel */

export const CONTROL_COLUMN_MAX_PX = 280;
const COLUMN_GAP_PX = 24;
const ROW_PADDING_X_PX = 20;
const ROW_PADDING_Y_PX = 18;

/**
 * A section's heading above one card of its rows, divided from each other.
 * @param {string} title
 * @param {NativeElement[]} rows
 * @param {Theme} t
 */
export function cardSection(title, rows, t) {
  return section(
    title,
    card(t).children(
      rows.map((row, index) =>
        row
          .when(index > 0, (e) => e.border_t(1).border_color(t.border))
          .when(index === rows.length - 1, (e) => e.rounded_b(CARD_RADIUS_PX - 1)),
      ),
    ),
    t,
  );
}

/**
 * A row's padding, which every row in a card shares so labels and controls line up down the card.
 * @param {NativeElement} row
 * @param {Theme} t
 * @param {{ dependent?: boolean }} [options] a dependent field's row sits on the panel's color.
 */
export function padRow(row, t, { dependent = false } = {}) {
  return row
    .flex_none()
    .px(ROW_PADDING_X_PX)
    .pb(ROW_PADDING_Y_PX)
    .when(!dependent, (e) => e.pt(ROW_PADDING_Y_PX))
    .when(dependent, (e) => e.pt(ROW_PADDING_Y_PX - 4).bg(t.surface));
}

/**
 * A setting's row: its label beside its controls, or above them when the label is wide.
 * @param {SettingLabel} label
 * @param {Theme} t
 * @param {(controls: NativeElement) => NativeElement} addControls
 */
export function settingRow({ title, sentence, after, tokens, wide = false }, t, addControls) {
  const labelColumn = v_flex()
    .flex_1()
    .min_w(0)
    .gap(4)
    .when(Boolean(after), (e) =>
      e.child(
        div()
          .text_size(11)
          .text_color(t.muted)
          .child(after ?? ""),
      ),
    )
    .child(div().font_semibold().text_color(t.foreground).child(title))
    .when(Boolean(sentence), (e) =>
      e.child(
        div()
          .whitespace_normal()
          .text_size(12)
          .text_color(t.muted)
          .child(sentence ?? ""),
      ),
    )
    .when(Boolean(tokens), (e) => e.child(tokenChips(tokens ?? [], t)));
  const controls = addControls(v_flex().gap(8).min_w(0));
  const row = wide
    ? v_flex().gap(12).child(labelColumn).child(controls.w_full())
    : h_flex()
        .items_start()
        .gap(COLUMN_GAP_PX)
        .child(labelColumn)
        .child(controls.flex_1().max_w(CONTROL_COLUMN_MAX_PX));
  return padRow(row, t, { dependent: Boolean(after) });
}

/**
 * @param {[string, string][]} tokens
 * @param {Theme} t
 */
function tokenChips(tokens, t) {
  return h_flex()
    .flex_wrap()
    .gap(6)
    .mt(4)
    .children(
      tokens.map(([token, meaning]) =>
        div()
          .flex_none()
          .px(6)
          .py(2)
          .rounded(4)
          .bg(/** @type {Color} */ (chipFill(t)))
          .text_size(11)
          .text_color(t.foreground)
          .font_family(/** @type {string} */ (settings().font_family))
          .child(`${token} ${meaning}`),
      ),
    );
}
