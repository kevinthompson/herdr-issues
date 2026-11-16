// Throwaway prototypes of the issue view's action bar, drawn as a sheet of static rows: the current bar, then
// two restyles, each in its idle, hover, busy and disabled states with the hover and busy states forced so they
// can be compared side by side. Never merged; the decision is recorded on the issue.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { HEADER_HEIGHT_PX } from "./header.js";

/** @import { NativeElement } from "gpui-kit" */
/** @import { Theme } from "./menu.js" */

const STATES = ["idle", "hover", "busy", "disabled"];
const ICON_PX = 14;
const DISABLED_OPACITY = 0.5;

/** @param {string} name @param {number} [size] */
const glyph = (name, size = ICON_PX) => svg(`mods/issues/icons/${name}.svg`).size(size);

/**
 * A native header icon button (p(3), rounded(4), 14px icon) held in one state.
 * @param {string} icon @param {string} state @param {Theme} t
 */
function nativeIconButton(icon, state, t) {
  const busy = state === "busy";
  const hover = state === "hover";
  return div()
    .flex_none()
    .p(3)
    .rounded(4)
    .when(hover, (e) => e.bg(t.hover))
    .when(state === "disabled", (e) => e.opacity(DISABLED_OPACITY))
    .text_color(hover ? t.foreground : t.dim)
    .child(busy ? glyph("rotate-cw").spin(1000) : glyph(icon));
}

/**
 * The start button keeping its emphasis: a filled chip the height of an icon button's box, holding the icon.
 * @param {string} state @param {Theme} t
 */
function emphasizedStartButton(state, t, { height = ICON_PX + 6, padding = 7 } = {}) {
  const busy = state === "busy";
  return div()
    .flex_none()
    .flex()
    .items_center()
    .px(padding)
    .h(height)
    .rounded(4)
    .bg(t.solid)
    .text_color(t.solid_foreground)
    .when(state === "hover", (e) => e.opacity(0.85))
    .when(state === "disabled", (e) => e.opacity(DISABLED_OPACITY))
    .child(busy ? glyph("rotate-cw").spin(1000) : glyph("git-branch-plus"));
}

/** The bar today: a 38px bar, the ID in 11px accent, outlined 26px buttons. @param {string} state @param {Theme} t */
function currentBar(state, t) {
  const chip = (/** @type {NativeElement} */ child, filled = false) =>
    div()
      .flex_none()
      .flex()
      .items_center()
      .h(26)
      .px(10)
      .rounded(7)
      .bg(filled ? t.solid : t.raised)
      .text_color(filled ? t.solid_foreground : t.foreground)
      .when(state === "hover", (e) => e.opacity(0.85))
      .when(state === "disabled", (e) => e.text_color(t.dim))
      .child(child);
  return h_flex()
    .h(38)
    .w_full()
    .flex_none()
    .px(10)
    .gap(8)
    .items_center()
    .border_b(1)
    .border_color(t.border)
    .child(div().flex_1().pl(4).text_size(11).text_color(t.accent).child("#190"))
    .child(chip(glyph("pencil")))
    .child(chip(div().child(state === "busy" ? "Merging…" : "Merge")))
    .child(chip(state === "busy" ? glyph("rotate-cw").spin(1000) : glyph("git-branch-plus"), true));
}

/**
 * A 30px bar in the native header's proportions: the ID as the header's medium-weight 12px title in the
 * foreground color, then the actions on the right.
 * @param {"native" | "emphasis" | "large-emphasis"} variant @param {string} state @param {Theme} t
 */
function restyledBar(variant, state, t) {
  return h_flex()
    .h(HEADER_HEIGHT_PX)
    .w_full()
    .flex_none()
    .px(10)
    .gap(8)
    .items_center()
    .border_b(1)
    .border_color(t.border)
    .text_size(12)
    .child(div().flex_1().min_w(0).truncate().font_medium().text_color(t.foreground).child("#190"))
    .child(nativeIconButton("pencil", state, t))
    .child(nativeIconButton("pull-request", state, t))
    .child(
      variant === "native"
        ? nativeIconButton("git-branch-plus", state, t)
        : emphasizedStartButton(state, t, variant === "large-emphasis" ? { height: 26, padding: 10 } : undefined),
    );
}

const UNIFORM_BUTTON_HEIGHT_PX = 26;
const UNIFORM_BUTTON_WIDTH_PX = 34;

/**
 * A button at today's start button size, whichever action it is. Only the primary action has a fill; the others
 * show a background on hover alone.
 * @param {string} icon @param {boolean} primary @param {string} state @param {Theme} t
 */
function uniformButton(icon, primary, state, t) {
  const hover = state === "hover";
  return div()
    .flex_none()
    .flex()
    .items_center()
    .justify_center()
    .w(UNIFORM_BUTTON_WIDTH_PX)
    .h(UNIFORM_BUTTON_HEIGHT_PX)
    .rounded(4)
    .when(primary, (e) =>
      e
        .bg(t.solid)
        .text_color(t.solid_foreground)
        .when(hover, (s) => s.opacity(0.85)),
    )
    .when(!primary, (e) => e.text_color(hover ? t.foreground : t.dim).when(hover, (s) => s.bg(t.hover)))
    .when(state === "disabled", (e) => e.opacity(DISABLED_OPACITY))
    .child(state === "busy" ? glyph("rotate-cw").spin(1000) : glyph(icon));
}

/** @param {string} state @param {Theme} t */
const uniformBar = (state, t) =>
  h_flex()
    .h(HEADER_HEIGHT_PX)
    .w_full()
    .flex_none()
    .px(10)
    .gap(4)
    .items_center()
    .border_b(1)
    .border_color(t.border)
    .text_size(12)
    .child(div().flex_1().min_w(0).truncate().font_medium().text_color(t.foreground).child("#190"))
    .child(uniformButton("pencil", false, state, t))
    .child(uniformButton("pull-request", false, state, t))
    .child(uniformButton("git-branch-plus", true, state, t));

/** @param {string} text @param {Theme} t */
const caption = (text, t) => div().px(10).pt(8).pb(2).text_size(10).text_color(t.dim).child(text);

/** @param {Theme} t */
export function actionBarPrototypes(t) {
  /** @param {string} title @param {(state: string) => NativeElement} bar */
  const section = (title, bar) =>
    v_flex()
      .flex_none()
      .child(div().px(10).pt(10).text_size(12).font_semibold().text_color(t.foreground).child(title))
      .children(STATES.flatMap((state) => [caption(state, t), bar(state)]));
  return v_flex()
    .id("action-bar-prototypes")
    .size_full()
    .min_h(0)
    .overflow_y_scrollbar()
    .child(section("Current: 38px, 11px accent ID, outlined buttons", (state) => currentBar(state, t)))
    .child(section("A: native icon buttons throughout, 30px", (state) => restyledBar("native", state, t)))
    .child(section("B: native icon buttons, filled start button, 30px", (state) => restyledBar("emphasis", state, t)))
    .child(
      section("B2: B with the start button at today's 26px size", (state) => restyledBar("large-emphasis", state, t)),
    )
    .child(section("C: every button 26x34, start filled, others background on hover", (state) => uniformBar(state, t)));
}
