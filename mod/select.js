// A select menu built on the kit's Select root and Popup, which own only the open state, Escape and Enter: a
// trigger showing the chosen option's label with "▾", drawn like Linear's team dropdown (tracker-choice.js), that
// opens a list of the options, each with its detail under its label and the chosen one checked. The trigger takes
// the keyboard by Tab; Enter or Down opens the list, Up and Down move its highlight, Enter picks the highlighted
// option and Escape closes it. A press outside the open list closes it too.
import { div } from "gpui-kit";
import { v_flex, h_flex, Select, Popup } from "gpui-base";

const TRIGGER_MAX_PX = 280, LIST_WIDTH_PX = 280, LIST_PADDING = 5, OPTION_INSET = 9;
// A press on the trigger that closed the open list by falling outside it shouldn't open it again on release, and
// one the Select root already answered with an open change shouldn't toggle it back.
const PRESS_SETTLED_MS = 400;

export class SelectMenu {
  // Focus handles outlive renders, so a select is made in an event handler or a task, with its `cx`.
  constructor(id, label, cx) {
    this.id = id; this.label = label;
    this.open = false; this.highlight = 0; this.settledAt = 0;
    this.triggerFocus = cx.focus_handle();
    this.listFocus = cx.focus_handle();
  }

  show(options, value, cx) {
    this.open = true;
    this.highlight = Math.max(0, options.findIndex(({ id }) => id === value));
    this.listFocus.focus();
    cx.notify();
  }

  close(cx) {
    if (!this.open) return;
    this.open = false;
    this.triggerFocus.focus();
    cx.notify();
  }

  pick(option, onChoose, cx) {
    this.close(cx);
    if (option) onChoose(option.id, cx);
  }

  pressTrigger(options, value, cx) {
    if (Date.now() - this.settledAt < PRESS_SETTLED_MS) return;
    if (this.open) this.close(cx);
    else this.show(options, value, cx);
  }

  moveHighlight(key, count, cx) {
    const step = { up: -1, down: 1 }[key];
    if (!step || count === 0) return false;
    this.highlight = Math.min(count - 1, Math.max(0, this.highlight + step));
    cx.notify();
    return true;
  }

  // options: { id, label, detail? }; onChoose(id, cx) runs when one is picked, chosen or not.
  render(t, { options, value, onChoose, enabled = true }) {
    const chosen = options.find(({ id }) => id === value);
    const trigger = h_flex().id(`${this.id}-trigger`).track_focus(this.triggerFocus).tab_index(0).role("combo_box")
      .flex_none().max_w(TRIGGER_MAX_PX).h(26).px(10).gap(6).items_center().rounded(7).border_1()
      .border_color(this.triggerFocus.is_focused() || this.open ? t.accent : t.border).bg(t.raised).text_size(12)
      .text_color(enabled ? t.foreground : t.dim)
      .when(enabled, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.pressTrigger(options, value, cx)))
      .child(div().flex_1().truncate().child(chosen?.label ?? ""))
      .child(div().flex_none().text_color(t.dim).child("▾"));
    const open = enabled && this.open;
    return Select.new(this.id).accessibility_label(this.label).open(open)
      .track_focus(this.triggerFocus).content_focus_handle(this.listFocus)
      .on_open_change((opening, cx) => {
        this.settledAt = Date.now();
        if (opening && enabled) this.show(options, value, cx);
        else this.close(cx);
      })
      .on_confirm((_e, cx) => this.pick(options[this.highlight], onChoose, cx))
      .child(Popup.new(`${this.id}-popup`, trigger).anchor("top_left")
        .when(open, (e) => e.content(this.list(t, options, value, onChoose))));
  }

  list(t, options, value, onChoose) {
    return v_flex().id(`${this.id}-list`).track_focus(this.listFocus).role("list_box").w(LIST_WIDTH_PX).mt(4).py(LIST_PADDING)
      .rounded(8).border_1().border_color(t.border).bg(t.popover).shadow_md().text_size(12.5).text_color(t.foreground)
      .on_key_down((event, cx) => { if (this.moveHighlight(event.key, options.length, cx)) cx.stop_propagation(); })
      .on_mouse_down_out((_e, cx) => { this.settledAt = Date.now(); this.close(cx); })
      .children(options.map((option, index) => v_flex().id(`${this.id}-option-${option.id}`).role("list_box_option")
        .aria_selected(option.id === value).mx(LIST_PADDING).px(OPTION_INSET).py(5).gap(2).flex_none().rounded(6).cursor_pointer()
        .when(index === this.highlight, (e) => e.bg(t.selected).aria_active_descendant())
        .hover((s) => s.bg(t.selected)).on_click((_e, cx) => this.pick(option, onChoose, cx))
        .child(h_flex().gap(9).items_center()
          .child(div().flex_1().truncate().child(option.label))
          .child(div().flex_none().text_color(t.muted).child(option.id === value ? "✓" : "")))
        .when(Boolean(option.detail), (e) => e.child(div().whitespace_normal().text_size(11.5).text_color(t.dim).child(option.detail ?? "")))));
  }
}
