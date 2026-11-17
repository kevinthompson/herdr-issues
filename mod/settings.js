// The settings view, which the gear in the panel's header opens in place of the list, its header reading Issues
// then Settings. Under the header, a row (filter-row.js) with Back on the left and, on the right, a dropdown with a
// border beneath the row, chooses its scope from a scope menu popup (menu.js), opening on Repository: the focused
// repository's own settings (repository-settings.js), or Global, the settings at issues.json's top level that
// apply to every repository without its own (global-settings.js), both built on the pieces the forms share
// (settings-form.js). The popup hands its pick back through shared state, keyed by the main checkout. Both forms
// load when the view opens and save each change to their own scope as it's made, the header saying Saving… while
// one writes; switching scope leaves the hidden form's waiting save to run. Back writes any save still waiting for
// typing to pause, then returns to the list once every save is done, or stays on the form whose save failed to
// show its error. Each form groups its settings in one scrolling column of sections, each a small capitalized heading
// above a bordered card of rows, in the order Tracker, Approval, Worktrees, Issue sessions and Panel, showing only
// the sections it has (settings-fields.js); nothing is collapsed. Each row (settings-form.js) puts a setting's label
// and description beside its controls: a select menu (select.js) whose open list says what each option means, or a
// typed field.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { shared, setShared } from "herdr";
import { actionButton } from "./action-button.js";
import { collapseButton, headerBar } from "./header.js";
import { leadingFilterRow, ROW_PADDING_X_PX } from "./filter-row.js";
import { GlobalSettings } from "./global-settings.js";
import { openScopeMenu } from "./menu.js";
import { RepositorySettings } from "./repository-settings.js";

/** @import { AsyncContext, Context } from "gpui-kit" */
/** @import { CurrentTracker } from "./repository-settings.js" */
/** @import { Theme } from "./menu.js" */
/** @import { Project } from "./trackers/index.js" */

/** @typedef {RepositorySettings | GlobalSettings} Form */

const SCOPE_PICKS = "issues.settingsScopes";
const SCOPES = [
  { id: "repository", label: "Repository" },
  { id: "global", label: "Global" },
];

export class SettingsView {
  // project: the focused { root, on }; main: its repository's main checkout; current: the tracker the panel lists,
  // { kind, team?, repo? }. onSaved(cx) runs after each save is written.
  /**
   * @param {Project} project
   * @param {string} main
   * @param {CurrentTracker} current
   * @param {{ onBack: (cx: Context) => void, onSaved: (cx: AsyncContext) => void }} callbacks
   */
  constructor(project, main, current, { onBack, onSaved }) {
    this.main = main;
    this.onBack = onBack;
    /** @type {{ repository: RepositorySettings, global: GlobalSettings } & Record<string, Form>} */
    this.forms = {
      repository: new RepositorySettings(project, main, current, { onSaved }),
      global: new GlobalSettings({ onSaved }),
    };
    for (const form of Object.values(this.forms)) form.onSettled = (cx) => this.leaveOnceSaved(cx);
    this.scope = "repository";
    this.leaving = false;
  }

  /**
   * @param {Context} cx
   */
  load(cx) {
    for (const form of Object.values(this.forms)) form.load(cx);
  }

  // Takes the team and the scope picked in their popups, which hand them over through shared state. The panel
  // calls this from its render, before drawing the view, so the render that follows shows the picks; Herdr
  // refuses cx.notify() there and shows the view's last render with an error instead.
  /**
   * @param {Context} cx
   */
  takePicks(cx) {
    this.forms.repository.takePickedTeam(cx);
    const picks = /** @type {Record<string, any>} */ (shared(SCOPE_PICKS) ?? {}),
      scope = picks[this.main];
    if (!scope) return;
    const others = { ...picks };
    delete others[this.main];
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
  /**
   * @param {Context} cx
   */
  back(cx) {
    for (const form of Object.values(this.forms)) {
      form.saveFailed = false;
      form.flush(cx);
    }
    this.leaving = true;
    this.leaveOnceSaved(cx);
  }

  // Returns to the list once Back's saves are done, unless one failed, whose form then shows its error.
  /**
   * @param {Context} cx
   */
  leaveOnceSaved(cx) {
    if (!this.leaving || this.saving()) return;
    this.leaving = false;
    const failed = Object.entries(this.forms).find(([, form]) => form.saveFailed);
    if (failed) {
      this.scope = failed[0];
      cx.notify();
      return;
    }
    this.onBack(cx);
  }

  /**
   * @param {Theme} t
   * @param {{ onCollapse: Parameters<typeof collapseButton>[0] }} props
   */
  render(t, { onCollapse }) {
    const form = this.shown();
    const shownLabel = SCOPES.find(({ id }) => id === this.scope)?.label ?? "";
    const content = v_flex()
      .id("issues-settings")
      .flex_1()
      .min_h(0)
      .overflow_y_scrollbar()
      .p(ROW_PADDING_X_PX)
      .pt(16)
      .gap(32);
    return v_flex()
      .size_full()
      .min_h(0)
      .child(this.bar(t, onCollapse))
      .child(
        leadingFilterRow(
          "settings-scope",
          this.backButton(t),
          shownLabel,
          () => openScopeMenu(SCOPES, this.scope, this.main, SCOPE_PICKS),
          t,
        ),
      )
      .child(
        form.loading ? content.child(div().text_size(12).text_color(t.dim).child("Loading…")) : form.form(content, t),
      );
  }

  /** @param {Theme} t */
  backButton(t) {
    return actionButton(
      {
        id: "settings-back",
        icon: "chevron-left",
        tooltip: "Back",
        onClick: (cx) => this.back(cx),
        enabled: !this.leaving,
      },
      t,
    );
  }

  /**
   * @param {Theme} t
   * @param {Parameters<typeof collapseButton>[0]} onCollapse
   */
  bar(t, onCollapse) {
    return headerBar(
      {
        icon: "issues",
        title: "Issues",
        secondary: "Settings",
        trailing: [
          this.saving() ? div().flex_none().text_color(t.dim).child("Saving…") : null,
          collapseButton(onCollapse, t),
        ],
      },
      t,
    );
  }
}
