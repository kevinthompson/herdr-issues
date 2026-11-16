// The settings view, which the gear in the panel's header opens in place of the list, with Back at the top left as
// the setup view (setup.js) has. Under the header, a row like the list's label filter (filter-row.js), with a
// border beneath it, chooses its scope from a scope menu popup (menu.js), opening on Repository: the focused
// repository's own settings (repository-settings.js), or Global, the settings at issues.json's top level that
// apply to every repository without its own (global-settings.js), both built on the pieces the forms share
// (settings-form.js). The popup hands its pick back through shared state, keyed by the main checkout. Both forms
// load when the view opens and save each change to their own scope as it's made, the header saying Saving… while
// one writes; switching scope leaves the hidden form's waiting save to run. Back writes any save still waiting for
// typing to pause, then returns to the list once every save is done, or stays on the form whose save failed to
// show its error. Each setting is a select menu (select.js) whose open list says what each option means, or a typed
// field, with its description below its controls.
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

export class SettingsView {
  // project: the focused { root, on }; main: its repository's main checkout; current: the tracker the panel lists,
  // { kind, team?, repo? }. onSaved(cx) runs after each save is written.
  constructor(project, main, current, { onBack, onSaved }) {
    this.main = main; this.onBack = onBack;
    this.forms = {
      repository: new RepositorySettings(project, main, current, { onSaved }),
      global: new GlobalSettings({ onSaved }),
    };
    for (const form of Object.values(this.forms)) form.onSettled = (cx) => this.leaveOnceSaved(cx);
    this.scope = "repository";
    this.leaving = false;
  }

  load(cx) {
    for (const form of Object.values(this.forms)) form.load(cx);
  }

  // Takes the team and the scope picked in their popups, which hand them over through shared state. The panel
  // calls this from its render, before drawing the view, so the render that follows shows the picks; Herdr
  // refuses cx.notify() there and shows the view's last render with an error instead.
  takePicks(cx) {
    this.forms.repository.takePickedTeam(cx);
    const picks = shared(SCOPE_PICKS) ?? {}, scope = picks[this.main];
    if (!scope) return;
    const { [this.main]: _taken, ...others } = picks;
    setShared(SCOPE_PICKS, others);
    if (scope in this.forms) this.scope = scope;
  }

  shown() {
    return this.forms[this.scope];
  }

  saving() {
    return Object.values(this.forms).some((form) => form.saving);
  }

  // A save that failed before this Back has shown its error already, so only one failing now keeps the view open.
  back(cx) {
    for (const form of Object.values(this.forms)) { form.saveFailed = false; form.flush(cx); }
    this.leaving = true;
    this.leaveOnceSaved(cx);
  }

  // Returns to the list once Back's saves are done, unless one failed, whose form then shows its error.
  leaveOnceSaved(cx) {
    if (!this.leaving || this.saving()) return;
    this.leaving = false;
    const failed = Object.entries(this.forms).find(([, form]) => form.saveFailed);
    if (failed) { this.scope = failed[0]; cx.notify(); return; }
    this.onBack(cx);
  }

  render(t, { onCollapse }) {
    const form = this.shown();
    const shownLabel = SCOPES.find(({ id }) => id === this.scope)?.label ?? "";
    const content = v_flex().id("issues-settings").flex_1().min_h(0).overflow_y_scrollbar().p(14).gap(12);
    return v_flex().size_full().min_h(0).child(this.bar(t, onCollapse))
      .child(filterRow("settings-scope", "Settings", shownLabel, () => openScopeMenu(SCOPES, this.scope, this.main, SCOPE_PICKS), t))
      .child(form.loading
        ? content.child(div().text_size(12).text_color(t.dim).child("Loading…"))
        : form.form(content, t));
  }

  bar(t, onCollapse) {
    return h_flex().h(42).flex_none().px(10).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().id("settings-back").flex_none().h(26).px(8).flex().items_center().rounded(7)
        .text_color(this.leaving ? t.dim : t.muted)
        .when(!this.leaving, (b) => b.cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => this.back(cx)))
        .child("‹ Back"))
      .child(div().flex_1())
      .child(div().px(4).text_size(12).text_color(t.dim).child(this.saving() ? "Saving…" : "Settings"))
      .child(collapseButton(onCollapse, t));
  }
}
