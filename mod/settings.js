// The settings view, which the gear in the panel's header opens in place of the list, with Back at the top left as
// the setup view (setup.js) has: the focused repository's settings (repository-settings.js), built on the form
// pieces the forms share (settings-form.js). Each setting is a select menu (select.js) whose open list says what
// each option means, or a typed field, with its description below its controls. Save writes only the changed keys
// and goes back to the list; a failed save shows its error and stays. Back writes nothing.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { collapseButton } from "./detail.js";
import { RepositorySettings } from "./repository-settings.js";

export class SettingsView {
  // project: the focused { root, on }; main: its repository's main checkout; current: the tracker the panel lists,
  // { kind, team?, repo? }. onSaved(cx) runs once the changes are written.
  constructor(project, main, current, { onBack, onSaved }) {
    this.onBack = onBack;
    this.repository = new RepositorySettings(project, main, current, { onSaved });
  }

  load(cx) {
    this.repository.load(cx);
  }

  takePickedTeam(cx) {
    this.repository.takePickedTeam(cx);
  }

  shown() {
    return this.repository;
  }

  render(t, { onCollapse }) {
    const form = this.shown();
    const content = v_flex().id("issues-settings").flex_1().min_h(0).overflow_y_scrollbar().p(14).gap(12);
    return v_flex().size_full().min_h(0).child(this.bar(t, onCollapse)).child(form.loading
      ? content.child(div().text_size(12).text_color(t.dim).child("Loading…"))
      : form.form(content, t));
  }

  bar(t, onCollapse) {
    const saving = this.shown().saving;
    return h_flex().h(42).flex_none().px(10).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().id("settings-back").flex_none().h(26).px(8).flex().items_center().rounded(7)
        .text_color(saving ? t.dim : t.muted)
        .when(!saving, (b) => b.cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => this.onBack(cx)))
        .child("‹ Back"))
      .child(div().flex_1())
      .child(div().px(4).text_size(12).text_color(t.dim).child("Settings"))
      .child(collapseButton(onCollapse, t));
  }
}
