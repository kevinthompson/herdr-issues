// What the settings view's forms (settings.js) share: each question's title, controls and description, typed
// fields, the line saying why its last save failed, saving as the form changes
// (autosave.js), where a picked choice or Enter in a field saves at once and typing saves once it pauses, and the
// issue sessions' model and effort. Those two are select menus (select.js) of their allowed values led by a choice
// that removes the setting, labeled with what then applies; workModel's Other takes another model alias or full
// name typed in. Each form gives saveRequest(), what to write and how its saved values change once written, or null
// when nothing can be saved yet.
import { div } from "gpui-kit";
import { v_flex, Input, InputState, Textarea } from "gpui-base";
import { AutosaveQueue } from "./autosave.js";
import { SelectMenu } from "./select.js";
import { CLEAR_CHOICE, OTHER_WORK_MODEL, isTypedWorkModel, workModelChoice } from "./settings-fields.js";
import { AGENT_DEFAULTS, EFFORTS, SUGGESTED_WORK_MODELS } from "./trackers/setting.js";

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
export const CLOSE_SENTENCE =
  "What a finished session does about its worktree. A worktree that might lose work, or that has other spaces nested under it, always shows the removal dialog first.";

export const AGENT_QUESTIONS = [
  {
    key: "workModel",
    title: "Issue sessions' model",
    sentence:
      "The model of the Claude sessions Start and Continue open to work an issue. Inherit uses your own Claude Code model.",
    choices: SUGGESTED_WORK_MODELS,
  },
  {
    key: "workEffort",
    title: "Issue sessions' effort",
    sentence: null,
    choices: EFFORTS,
  },
];
const OTHER_WORK_MODEL_OPTION = {
  id: OTHER_WORK_MODEL,
  label: "Other…",
  detail: "Another model alias or full name, typed in.",
};
export const WORK_PROMPT_ROWS = 6;

export class SettingsForm {
  // onSaved(cx) runs after each save is written; onSettled(cx), which the view sets, once none is running.
  constructor({ onSaved }) {
    this.onSaved = onSaved;
    this.onSettled = () => {};
    this.savedAgent = null;
    this.agentValues = {};
    this.otherWorkModelPicked = false;
    this.loading = true;
    this.error = null;
    this.saveFailed = false;
    this.autosave = new AutosaveQueue({
      request: () => this.saveRequest(),
      onStart: (cx) => {
        Object.assign(this, { error: null, saveFailed: false });
        cx.notify();
      },
      onSaved: (cx) => this.onSaved(cx),
      onFailed: (e, _cx) =>
        Object.assign(this, {
          error: `Could not save: ${e.message ?? e}`,
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
  edited(cx) {
    this.error = null;
    this.autosave.schedule(cx);
    cx.notify();
  }

  // A choice was picked or Enter pressed: saves at once, with any typing still waiting.
  saveNow(cx) {
    this.error = null;
    this.autosave.now(cx);
    cx.notify();
  }

  // Saves typing still waiting for its pause at once, as the view is left.
  flush(cx) {
    this.autosave.flush(cx);
  }

  // A select for each of workModel and workEffort, with ids led by `prefix`.
  agentSelects(prefix, cx) {
    return Object.fromEntries(
      AGENT_QUESTIONS.map(({ key, title }) => [key, new SelectMenu(`${prefix}-${key}`, title, cx)]),
    );
  }

  // Opens workModel and workEffort on `saved`, each its value or null where unset.
  openAgent(saved) {
    this.savedAgent = saved;
    this.agentValues = { ...saved };
    if (isTypedWorkModel(saved.workModel)) this.workModelInput.set_value(saved.workModel);
  }

  // The value for `key`, or null to remove it. workModel's Other keeps the value until a model is typed; a listed
  // model clears the typed one.
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
  typeWorkModel(text, cx) {
    if (text) this.agentValues = { ...this.agentValues, workModel: text };
    else if (isTypedWorkModel(this.agentValues.workModel)) this.agentValues = { ...this.agentValues, workModel: null };
    this.edited(cx);
  }

  agentChanges() {
    return Object.fromEntries(
      Object.keys(AGENT_DEFAULTS)
        .filter((key) => this.savedAgent && (this.agentValues[key] ?? null) !== this.savedAgent[key])
        .map((key) => [key, this.agentValues[key] ?? null]),
    );
  }

  // A select of the setting's values led by the one that removes it, labeled `clearLabel`; workModel's ends with
  // Other, which shows the typed model.
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
    return this.question(title, sentence, t, (controls) =>
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

  question(title, sentence, t, addControls) {
    return addControls(v_flex().flex_none().gap(8).pt(4).child(div().font_semibold().child(title))).when(
      Boolean(sentence),
      (e) =>
        e.child(
          div()
            .whitespace_normal()
            .text_size(12)
            .text_color(t.muted)
            .child(sentence ?? ""),
        ),
    );
  }

  note(text, t) {
    return div().whitespace_normal().text_size(12).text_color(t.dim).child(text);
  }

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
