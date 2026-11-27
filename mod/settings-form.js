// What the settings view's forms (settings.js) share: the labels of the settings both forms show, each setting's
// row, typed fields, the line saying why its last save failed, saving as the form changes (autosave.js), where a
// picked choice or Enter in a field saves at once and typing saves once it pauses, and each section's card under its
// heading. Each form gives saveRequest(), what to write and how its saved values change once
// written, or null when nothing can be saved yet. Rows and cards are laid out by setting-row.js.
import { div } from "gpui-kit";
import { Input } from "gpui-base";
import { AutosaveQueue } from "./autosave.js";
import { cardSection, settingRow } from "./setting-row.js";

/** @import { AsyncContext, Context, NativeElement } from "gpui-kit" */
/** @import { InputState as InputStateType } from "gpui-base" */
/** @import { Theme } from "./menu.js" */
/** @import { SelectMenu, SelectOption } from "./select.js" */
/** @import { SettingsSection } from "./settings-fields.js" */

/** @typedef {import("./setting-row.js").SettingLabel} SettingLabel */
/** @typedef {{ write: () => Promise<unknown>, written: () => void }} SaveRequest */

/** @type {SelectOption[]} */
export const CLOSE_CHOICES = [
  {
    id: "auto",
    label: "Automatically",
    detail: "The session closes its worktree without asking.",
  },
  {
    id: "ask",
    label: "Ask when work is approved",
    detail: "The session asks whether to close its worktree, and closes it if you say yes.",
  },
];
/** @type {[string, string][]} */
const SPACE_NAME_TOKENS = [
  ["<issueId>", "issue ID"],
  ["<repo>", "repository"],
];

// The settings whose labels both forms share; the approval ones differ from setup's questions (setup.js).
/** @type {Record<"approval" | "onApproval" | "waitForChecks" | "pushAfterMerge" | "close", SettingLabel>} */
export const SETTING_LABELS = {
  approval: { title: "Approve work", sentence: "Whether finished work waits for you." },
  onApproval: { title: "When approved", sentence: "How the branch gets into main." },
  waitForChecks: {
    title: "Wait for checks",
    sentence: "Waits for the pull request's checks and fixes failures the branch caused. The worktree stays open.",
    after: "After opening a pull request",
  },
  pushAfterMerge: {
    title: "Push main",
    sentence: "Pushes main to the remote it tracks once the merge finishes on this computer.",
    after: "After merging",
  },
  close: {
    title: "Close worktrees",
    sentence:
      "What a finished session does with its worktree. One that might lose work, or has spaces nested under it, always asks first.",
  },
};

/**
 * @param {string} sentence
 * @returns {SettingLabel}
 */
export const spaceNameLabel = (sentence) => ({ title: "Issue space name", sentence, tokens: SPACE_NAME_TOKENS });

/**
 * @param {string} sentence
 * @returns {SettingLabel}
 */
export const worktreeCommandLabel = (sentence) => ({
  title: "Issue space command",
  sentence,
  tokens: [SPACE_NAME_TOKENS[0]],
});

export class SettingsForm {
  // onSaved(cx) runs after each save is written; onSettled(cx), which the view sets, once none is running.
  /**
   * @param {{ onSaved: (cx: AsyncContext) => void }} callbacks
   */
  constructor({ onSaved }) {
    this.onSaved = onSaved;
    /** @type {(cx: Context) => void} */
    this.onSettled = () => {};
    /** @type {Record<string, SelectMenu>} */
    this.selects = null;
    this.loading = true;
    /** @type {string | null} */
    this.error = null;
    this.saveFailed = false;
    this.autosave = new AutosaveQueue({
      request: () => this.saveRequest(),
      onStart: (cx) => {
        Object.assign(this, { error: null, saveFailed: false });
        cx.notify();
      },
      onSaved: (cx) => this.onSaved(cx),
      onFailed: (e) =>
        Object.assign(this, {
          error: `Could not save: ${/** @type {{ message?: string }} */ (e).message ?? e}`,
          saveFailed: true,
        }),
      onSettled: (cx) => {
        this.onSettled(cx);
        cx.notify();
      },
    });
  }

  get saving() {
    return this.autosave.saving;
  }

  // A field changed: saves once typing pauses.
  /**
   * @param {Context} cx
   */
  edited(cx) {
    this.error = null;
    this.autosave.schedule(cx);
    cx.notify();
  }

  // Each form overrides this with what it writes; a form that writes nothing has nothing to save.
  /**
   * @returns {SaveRequest | null}
   */
  saveRequest() {
    return null;
  }

  // A choice was picked or Enter pressed: saves at once, with any typing still waiting.
  /**
   * @param {Context} cx
   */
  saveNow(cx) {
    this.error = null;
    this.autosave.now(cx);
    cx.notify();
  }

  // Saves typing still waiting for its pause at once, as the view is left.
  /**
   * @param {Context} cx
   */
  flush(cx) {
    this.autosave.flush(cx);
  }

  // Why the last save failed, leading the form.
  /**
   * @param {NativeElement} content
   * @param {Theme} t
   */
  errorLine(content, t) {
    return content.when(Boolean(this.error), (e) =>
      e.child(
        div()
          .whitespace_normal()
          .text_size(12)
          .text_color(t.ansi1)
          .child(this.error ?? ""),
      ),
    );
  }

  // Each section's heading above a card of its rows, where questionFor(key) is the row, or null while it doesn't
  // show; a section none of whose rows shows has neither.
  /**
   * @param {NativeElement} content
   * @param {SettingsSection[]} sections
   * @param {(key: string) => NativeElement | null} questionFor
   * @param {Theme} t
   */
  sections(content, sections, questionFor, t) {
    return content.children(
      sections.flatMap(({ title, keys }) => {
        const rows = /** @type {NativeElement[]} */ (keys.map(questionFor).filter(Boolean));
        return rows.length > 0 ? [cardSection(title, rows, t)] : [];
      }),
    );
  }

  /**
   * @param {SettingLabel} label
   * @param {Theme} t
   * @param {(controls: NativeElement) => NativeElement} addControls
   */
  question(label, t, addControls) {
    return settingRow(label, t, addControls);
  }

  /**
   * @param {string} text
   * @param {Theme} t
   */
  note(text, t) {
    return div().whitespace_normal().text_size(12).text_color(t.dim).child(text);
  }

  /**
   * @param {InputStateType} state
   * @param {Theme} t
   */
  textField(state, t) {
    return Input.new(state)
      .min_w(0)
      .max_w(280)
      .h(26)
      .px(8)
      .items_center()
      .rounded(7)
      .border(1)
      .border_color(t.input)
      .bg(t.surface)
      .text_size(12)
      .text_color(t.foreground);
  }
}
