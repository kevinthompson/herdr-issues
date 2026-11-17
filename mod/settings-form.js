// What the settings view's forms (settings.js) share: the labels of the settings both forms show, each setting's
// row, typed fields, the line saying why its last save failed, saving as the form changes (autosave.js), where a
// picked choice or Enter in a field saves at once and typing saves once it pauses, the issue sessions' model and
// effort, and each section's card under its heading. Those two are select menus (select.js) of their allowed values
// led by a choice that removes the setting, labeled with what then applies; workModel's Other takes another model
// alias or full name typed in. Each form gives saveRequest(), what to write and how its saved values change once
// written, or null when nothing can be saved yet. The layout follows AGENTS.md's UI design guidance: a row puts the
// setting's label and description on the left and its controls in a column on the right, a setting that applies
// only after another's choice follows it on the panel's color with that condition above its title, and a multi-line field
// spans the row beneath its label.
import { div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState, Textarea } from "gpui-base";
import { settings } from "herdr";
import { AutosaveQueue } from "./autosave.js";
import { chipFill } from "./colors.js";
import { card, section, CARD_RADIUS_PX } from "./section.js";
import { SelectMenu } from "./select.js";
import { CLEAR_CHOICE, OTHER_WORK_MODEL, isTypedWorkModel, workModelChoice } from "./settings-fields.js";
import { AGENT_DEFAULTS, EFFORTS, SUGGESTED_WORK_MODELS } from "./trackers/setting.js";

/** @import { AsyncContext, Color, Context, NativeElement } from "gpui-kit" */
/** @import { InputState as InputStateType, TextareaState } from "gpui-base" */
/** @import { Theme } from "./menu.js" */
/** @import { SelectOption } from "./select.js" */
/** @import { SettingsSection } from "./settings-fields.js" */

/** @typedef {"workModel" | "workEffort"} AgentKey */
/** @typedef {{ key: AgentKey, title: string, sentence: string | null, choices: string[] }} AgentQuestion */
/** @typedef {{ title: string, sentence: string | null, after?: string, tokens?: [string, string][], wide?: boolean }} SettingLabel */
/** @typedef {{ workModel?: string | null, workEffort?: string | null }} AgentValues */
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
export const workPromptLabel = (sentence) => ({ title: "Work prompt", sentence, wide: true });

/** @type {AgentQuestion[]} */
export const AGENT_QUESTIONS = [
  {
    key: "workModel",
    title: "Model",
    sentence: "The model issue sessions use. Inherit uses your own Claude Code model.",
    choices: SUGGESTED_WORK_MODELS,
  },
  {
    key: "workEffort",
    title: "Effort",
    sentence: "The effort issue sessions use.",
    choices: EFFORTS,
  },
];
const CONTROL_COLUMN_MAX_PX = 280;
const COLUMN_GAP_PX = 24;
const ROW_PADDING_X_PX = 20;
const ROW_PADDING_Y_PX = 18;
const OTHER_WORK_MODEL_OPTION = {
  id: OTHER_WORK_MODEL,
  label: "Other…",
  detail: "Another model alias or full name, typed in.",
};
export const WORK_PROMPT_ROWS = 6;

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
    /** @type {AgentValues | null} */
    this.savedAgent = null;
    /** @type {AgentValues} */
    this.agentValues = {};
    this.otherWorkModelPicked = false;
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
    this.workModelInput = InputState.new({
      placeholder: "Another model alias or full name",
    });
    this.workModelInput.on("change", (_e, cx) => this.typeWorkModel(this.workModelInput.value().trim(), cx));
    this.workModelInput.on("submit", (_e, cx) => this.saveNow(cx));
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

  // A select for each of workModel and workEffort, with ids led by `prefix`.
  /**
   * @param {string} prefix
   * @param {Context} cx
   */
  agentSelects(prefix, cx) {
    return Object.fromEntries(
      AGENT_QUESTIONS.map(({ key, title }) => [key, new SelectMenu(`${prefix}-${key}`, title, cx)]),
    );
  }

  // Opens workModel and workEffort on `saved`, each its value or null where unset.
  /**
   * @param {AgentValues} saved
   */
  openAgent(saved) {
    this.savedAgent = saved;
    this.agentValues = { ...saved };
    if (isTypedWorkModel(saved.workModel)) this.workModelInput.set_value(saved.workModel);
  }

  // The value for `key`, or null to remove it. workModel's Other keeps the value until a model is typed; a listed
  // model clears the typed one.
  /**
   * @param {AgentKey} key
   * @param {string | null} value
   * @param {Context} cx
   */
  chooseAgent(key, value, cx) {
    if (key === "workModel") {
      this.otherWorkModelPicked = value === OTHER_WORK_MODEL;
      if (!this.otherWorkModelPicked && isTypedWorkModel(this.workModelInput.value().trim()))
        this.workModelInput.set_value("");
    }
    if (value !== OTHER_WORK_MODEL) this.agentValues = { ...this.agentValues, [key]: value };
    this.saveNow(cx);
  }

  // Emptying the field of a typed model removes workModel.
  /**
   * @param {string} text
   * @param {Context} cx
   */
  typeWorkModel(text, cx) {
    if (text) this.agentValues = { ...this.agentValues, workModel: text };
    else if (isTypedWorkModel(this.agentValues.workModel)) this.agentValues = { ...this.agentValues, workModel: null };
    this.edited(cx);
  }

  /**
   * @returns {AgentValues}
   */
  agentChanges() {
    return Object.fromEntries(
      /** @type {AgentKey[]} */ (Object.keys(AGENT_DEFAULTS))
        .filter((key) => this.savedAgent && (this.agentValues[key] ?? null) !== this.savedAgent[key])
        .map((key) => [key, this.agentValues[key] ?? null]),
    );
  }

  // A select of the setting's values led by the one that removes it, labeled `clearLabel`; workModel's ends with
  // Other, which shows the typed model.
  /**
   * @param {AgentQuestion} question
   * @param {string} clearLabel
   * @param {boolean} showTypedModel
   * @param {Theme} t
   */
  agentQuestion({ key, title, sentence, choices }, clearLabel, showTypedModel, t) {
    const isWorkModel = key === "workModel";
    const options = [
      { id: CLEAR_CHOICE, label: clearLabel },
      ...choices.map((id) => ({ id, label: id })),
      ...(isWorkModel ? [OTHER_WORK_MODEL_OPTION] : []),
    ];
    const chosen = isWorkModel
      ? workModelChoice(this.agentValues.workModel, this.otherWorkModelPicked)
      : (this.agentValues[key] ?? CLEAR_CHOICE);
    return this.question({ title, sentence }, t, (controls) =>
      controls
        .child(
          this.selects[key].render(t, {
            options,
            value: chosen,
            onChoose: (id, cx) => this.chooseAgent(key, id === CLEAR_CHOICE ? null : id, cx),
          }),
        )
        .when(isWorkModel && showTypedModel, (e) => e.child(this.textField(this.workModelInput, t))),
    );
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
        return rows.length > 0 ? [this.section(title, rows, t)] : [];
      }),
    );
  }

  /**
   * @param {string} title
   * @param {NativeElement[]} rows
   * @param {Theme} t
   */
  section(title, rows, t) {
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

  // A setting's row: its label beside its controls, or above them when the label is wide.
  /**
   * @param {SettingLabel} label
   * @param {Theme} t
   * @param {(controls: NativeElement) => NativeElement} addControls
   */
  question({ title, sentence, after, tokens, wide = false }, t, addControls) {
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
      .when(Boolean(tokens), (e) => e.child(this.tokenChips(tokens ?? [], t)));
    const controls = addControls(v_flex().gap(8).min_w(0));
    const row = wide
      ? v_flex().gap(12).child(labelColumn).child(controls.w_full())
      : h_flex()
          .items_start()
          .gap(COLUMN_GAP_PX)
          .child(labelColumn)
          .child(controls.flex_1().max_w(CONTROL_COLUMN_MAX_PX));
    return row
      .flex_none()
      .px(ROW_PADDING_X_PX)
      .pb(ROW_PADDING_Y_PX)
      .when(!after, (e) => e.pt(ROW_PADDING_Y_PX))
      .when(Boolean(after), (e) => e.pt(ROW_PADDING_Y_PX - 4).bg(t.surface));
  }

  // The placeholders a typed setting understands, each in a monospace chip with what it stands for.
  /**
   * @param {[string, string][]} tokens
   * @param {Theme} t
   */
  tokenChips(tokens, t) {
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

  /**
   * @param {TextareaState} state
   * @param {Theme} t
   */
  textareaField(state, t) {
    return Textarea.new(state)
      .w_full()
      .min_w(0)
      .px(8)
      .py(6)
      .rounded(7)
      .border(1)
      .border_color(t.input)
      .bg(t.surface)
      .text_size(12)
      .text_color(t.foreground);
  }
}
