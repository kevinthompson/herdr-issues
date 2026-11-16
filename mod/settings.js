// The settings view, which the gear in the panel's header opens in place of the list, with Back at the top left as
// the setup view (setup.js) has. Under the header, a row like the list's label filter (filter-row.js), with a
// border beneath it, chooses its scope from a scope menu popup (menu.js), opening on Repository: the focused
// repository's own settings (repository-settings.js), or Global, the settings at issues.json's top level that
// apply to every repository without its own (global-settings.js), both built on the pieces the forms share
// (settings-form.js). The popup hands its pick back through shared state, keyed by the main checkout. Both forms
// load when the view opens and keep their unsaved changes while the other is shown, and the shown form says when
// the other has some; Save writes only the shown form's changed keys, to its own scope, and goes back to the list;
// a failed save shows its error and stays. Back writes nothing. Each setting is a select menu (select.js) whose
// open list says what each option means, or a typed field, with its description below its controls.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { shared, setShared } from "herdr";
import { collapseButton } from "./detail.js";
import { filterRow } from "./filter-row.js";
import { GlobalSettings } from "./global-settings.js";
import { openScopeMenu } from "./menu.js";
import { RepositorySettings } from "./repository-settings.js";

const SCOPE_PICKS = "issues.settingsScopes";
const SCOPES = [{ id: "repository", label: "Repository" }, { id: "global", label: "Global" }];
const UNSAVED_ELSEWHERE = {
  repository: "Global has unsaved changes, which Save here doesn't write.",
  global: "Repository has unsaved changes, which Save here doesn't write.",
};

export class SettingsView {
  // project: the focused { root, on }; main: its repository's main checkout; current: the tracker the panel lists,
  // { kind, team?, repo? }. onSaved(cx) runs once the changes are written.
  constructor(project, main, current, { onBack, onSaved }) {
    this.main = main; this.onBack = onBack;
    this.forms = {
      repository: new RepositorySettings(project, main, current, { onSaved }),
      global: new GlobalSettings({ onSaved }),
    };
    this.scope = "repository";
  }

  load(cx) {
    for (const form of Object.values(this.forms)) form.load(cx);
  }

  // Takes the team and the scope picked in their popups, which hand them over through shared state.
  takePicks(cx) {
    this.forms.repository.takePickedTeam(cx);
    const picks = shared(SCOPE_PICKS) ?? {}, scope = picks[this.main];
    if (!scope) return;
    const { [this.main]: _taken, ...others } = picks;
    setShared(SCOPE_PICKS, others);
    if (!this.shown().saving && scope in this.forms) { this.scope = scope; cx.notify(); }
  }

  shown() {
    return this.forms[this.scope];
  }

  // The form not shown, which keeps its unsaved changes.
  hidden() {
    return this.forms[this.scope === "repository" ? "global" : "repository"];
  }

  openScopeMenu() {
    if (!this.shown().saving) openScopeMenu(SCOPES, this.scope, this.main, SCOPE_PICKS);
  }

  render(t, { onCollapse }) {
    const form = this.shown(), hidden = this.hidden();
    const shownLabel = SCOPES.find(({ id }) => id === this.scope)?.label ?? "";
    const content = v_flex().id("issues-settings").flex_1().min_h(0).overflow_y_scrollbar().p(14).gap(12)
      .when(!hidden.loading && hidden.changed(), (e) => e.child(form.note(UNSAVED_ELSEWHERE[this.scope], t)));
    return v_flex().size_full().min_h(0).child(this.bar(t, onCollapse))
      .child(filterRow("settings-scope", "Settings", shownLabel, () => this.openScopeMenu(), t))
      .child(form.loading
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
