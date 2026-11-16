// The settings view, which the gear in the panel's header opens in place of the list, with Back at the top left as
// the setup view (setup.js) has. A select at the top chooses its scope, opening on Repository: the focused
// repository's own settings (repository-settings.js), or Global, the settings at issues.json's top level that
// apply to every repository without its own (global-settings.js), both built on the pieces the forms share
// (settings-form.js). Both forms load when the view opens and keep their unsaved changes while the other is shown,
// and the shown form says when the other has some; Save writes only the shown form's changed keys, to its own
// scope, and goes back to the list; a failed save shows its error and stays. Back writes nothing. Each setting is a
// select menu (select.js) whose open list says what each option means, or a typed field, with its description
// below its controls.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { collapseButton } from "./detail.js";
import { GlobalSettings } from "./global-settings.js";
import { RepositorySettings } from "./repository-settings.js";
import { SelectMenu } from "./select.js";

const SCOPES = [
  { id: "repository", label: "Repository", detail: "This repository's own settings, which win over the global ones." },
  { id: "global", label: "Global", detail: "Settings for every repository without its own." },
];
const UNSAVED_ELSEWHERE = {
  repository: "Global has unsaved changes, which Save here doesn't write.",
  global: "Repository has unsaved changes, which Save here doesn't write.",
};

export class SettingsView {
  // project: the focused { root, on }; main: its repository's main checkout; current: the tracker the panel lists,
  // { kind, team?, repo? }. onSaved(cx) runs once the changes are written.
  constructor(project, main, current, { onBack, onSaved }) {
    this.onBack = onBack;
    this.forms = {
      repository: new RepositorySettings(project, main, current, { onSaved }),
      global: new GlobalSettings({ onSaved }),
    };
    this.scope = "repository";
    this.scopeSelect = null;
  }

  load(cx) {
    this.scopeSelect = new SelectMenu("settings-scope", "Settings for", cx);
    for (const form of Object.values(this.forms)) form.load(cx);
  }

  takePickedTeam(cx) {
    this.forms.repository.takePickedTeam(cx);
  }

  shown() {
    return this.forms[this.scope];
  }

  // The form not shown, which keeps its unsaved changes.
  hidden() {
    return this.forms[this.scope === "repository" ? "global" : "repository"];
  }

  chooseScope(scope, cx) {
    this.scope = scope;
    cx.notify();
  }

  render(t, { onCollapse }) {
    const form = this.shown(), hidden = this.hidden();
    const content = v_flex().id("issues-settings").flex_1().min_h(0).overflow_y_scrollbar().p(14).gap(12)
      .child(h_flex().flex_none().gap(8).items_center()
        .child(this.scopeSelect.render(t, { options: SCOPES, value: this.scope, enabled: !form.saving, onChoose: (id, cx) => this.chooseScope(id, cx) })))
      .when(!hidden.loading && hidden.changed(), (e) => e.child(form.note(UNSAVED_ELSEWHERE[this.scope], t)));
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
