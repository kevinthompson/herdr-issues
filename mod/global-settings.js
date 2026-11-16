// The settings at issues.json's top level, which apply to every repository without its own: the settings view's
// Global form (settings.js). It shows only the settings that have a top-level version: how work gets into main and
// when it's complete, merge and complete, where complete shows for a pull request or the default merge, which is a
// pull request for a repository on GitHub (settings-fields.js); what a finished session does about its worktree,
// close; the name of each issue's space, spaceName; how often the panel polls each tracker, pollSeconds, and checks
// for its own update, updateCheckHours, each a whole number before it can be saved; the issue sessions' model and
// effort, workModel and workEffort; and the prompt appended to their system prompt, workPrompt, before any
// repository's own. Each opens on the top level's value. Each select leads with a Default choice and each field
// shows the default as placeholder, and either removes the key, so the default applies. Save writes only the
// changed keys with saveTopLevelSettings (setting.js).
import { div } from "gpui-kit";
import { InputState, TextareaState } from "gpui-base";
import { MERGE_CHOICES } from "./setup.js";
import { SelectMenu } from "./select.js";
import { CLEAR_CHOICE, globalSettingsFields } from "./settings-fields.js";
import {
  AGENT_QUESTIONS, CLOSE_CHOICES, CLOSE_SENTENCE, COMPLETE_CHOICES, COMPLETE_SENTENCE, COMPLETE_WITHOUT_PULL_REQUEST,
  SettingsForm, WORK_PROMPT_ROWS,
} from "./settings-form.js";
import {
  AGENT_DEFAULTS, DEFAULT_CLOSE, DEFAULT_POLL_SECONDS, DEFAULT_PULL_REQUEST_COMPLETE, DEFAULT_UPDATE_CHECK_HOURS,
  PULL_REQUEST_COMPLETES, parsePollSeconds, parseUpdateCheckHours, saveTopLevelSettings, topLevelSettings,
} from "./trackers/setting.js";

const DEFAULT_MERGE_LABEL = "Default (a pull request on GitHub, else review)";
const choiceLabel = (choices, id) => choices.find((choice) => choice.id === id)?.label;

const TYPED_QUESTIONS = [
  { key: "spaceName", title: "Issue space name", placeholder: "<issueId>", parse: (text) => text.trim() || null,
    sentence: "The name of each issue's worktree space, where <issueId> is the issue's ID and <repo> the repository's name. Leave it empty to name spaces after the issue's ID." },
  { key: "pollSeconds", title: "Poll interval", placeholder: String(DEFAULT_POLL_SECONDS), parse: parsePollSeconds,
    sentence: `How often, in whole seconds of 10 or more, the panel asks each repository's tracker for its issues. Leave it empty to poll every ${DEFAULT_POLL_SECONDS} seconds.` },
  { key: "updateCheckHours", title: "Update check interval", placeholder: String(DEFAULT_UPDATE_CHECK_HOURS), parse: parseUpdateCheckHours,
    sentence: `How often, in whole hours of 1 or more, the panel checks for an update to itself. Leave it empty to check every ${DEFAULT_UPDATE_CHECK_HOURS} hours.` },
];
const SELECT_KEYS = ["merge", "complete", "close"];
const WORK_PROMPT_SENTENCE = "Instructions appended to the system prompt of every Claude session that works an issue. A repository's own prompt is added after this one.";

export class GlobalSettings extends SettingsForm {
  constructor({ onSaved }) {
    super({ onSaved });
    this.saved = null; this.chosen = {};
    this.typedInputs = null; this.workPromptInput = null;
    this.selects = null;
  }

  load(cx) {
    this.selects = {
      merge: new SelectMenu("global-merge", "How work gets into main", cx),
      complete: new SelectMenu("global-complete", "When the work is complete", cx),
      close: new SelectMenu("global-close", "When the work is complete, close the worktree?", cx),
      ...this.agentSelects("global", cx),
    };
    cx.spawn(async (cx) => {
      try {
        const settings = await topLevelSettings();
        const value = (key) => (typeof settings[key] === "string" ? settings[key].trim() || null : settings[key] ?? null);
        this.saved = Object.fromEntries([...SELECT_KEYS, ...TYPED_QUESTIONS.map(({ key }) => key), "workPrompt"].map((key) => [key, value(key)]));
        this.chosen = Object.fromEntries(SELECT_KEYS.map((key) => [key, this.saved[key]]));
        this.typedInputs = Object.fromEntries(TYPED_QUESTIONS.map(({ key, placeholder }) => {
          const input = InputState.new({ placeholder, value: this.saved[key] == null ? "" : String(this.saved[key]) });
          input.on("change", (_e, cx) => { this.error = null; cx.notify(); });
          input.on("submit", (_e, cx) => this.save(cx));
          return [key, input];
        }));
        this.openAgent(Object.fromEntries(Object.keys(AGENT_DEFAULTS).map((key) => [key, value(key)])));
        this.workPromptInput = TextareaState.new({ placeholder: "No prompt", value: this.saved.workPrompt ?? "", rows: WORK_PROMPT_ROWS });
        this.workPromptInput.set_soft_wrap(true);
        this.workPromptInput.on("change", (_e, cx) => { this.error = null; cx.notify(); });
      } catch (e) { this.error = String(e.message ?? e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  // `value` for merge, complete or close, or null to remove it.
  choose(key, value, cx) {
    this.chosen = { ...this.chosen, [key]: value };
    this.error = null;
    cx.notify();
  }

  fields() {
    return globalSettingsFields({ merge: this.chosen.merge, workModel: this.agentValues.workModel, otherWorkModelPicked: this.otherWorkModelPicked });
  }

  // Each typed setting's value, or its problem when it can't be saved.
  typed() {
    if (!this.typedInputs) return { values: {}, problems: {} };
    const values = {}, problems = {};
    for (const { key, parse } of TYPED_QUESTIONS) {
      try { values[key] = parse(this.typedInputs[key].value()); }
      catch (e) { problems[key] = String(e.message ?? e); }
    }
    return { values, problems };
  }

  // Every top-level setting whose control differs from the top level, as its value or null. A complete that needs
  // a pull request is removed under a merge that isn't one, since the top level would refuse the pair.
  changes() {
    if (!this.saved) return {};
    const refused = !this.fields().completeSelect && PULL_REQUEST_COMPLETES.includes(this.chosen.complete);
    const complete = refused ? null : this.chosen.complete;
    const current = {
      ...this.chosen, complete, ...this.typed().values, ...this.agentValues,
      workPrompt: this.workPromptInput?.value().trim() || null,
    };
    const savedFor = (key) => (key in AGENT_DEFAULTS ? this.savedAgent[key] : this.saved[key]);
    return Object.fromEntries(Object.entries(current)
      .filter(([key, value]) => (value ?? null) !== savedFor(key))
      .map(([key, value]) => [key, value ?? null]));
  }

  changed() {
    return Object.keys(this.changes()).length > 0;
  }

  canSave() {
    return !this.saving && Object.keys(this.typed().problems).length === 0 && this.changed();
  }

  save(cx) {
    if (!this.canSave()) return;
    const changes = this.changes();
    this.runSave(cx, () => saveTopLevelSettings(changes));
  }

  form(content, t) {
    const fields = this.fields();
    const { problems } = this.typed();
    return this.saveRow(content
      .child(this.selectQuestion("merge", "How does work get into main?", null, [{ id: CLEAR_CHOICE, label: DEFAULT_MERGE_LABEL }, ...MERGE_CHOICES], t,
        (controls) => controls.when(fields.mergedNote, (e) => e.child(this.note(COMPLETE_WITHOUT_PULL_REQUEST, t)))))
      .when(fields.completeSelect, (e) => e.child(this.selectQuestion("complete", "When is the work complete?", COMPLETE_SENTENCE,
        [{ id: CLEAR_CHOICE, label: `Default (${choiceLabel(COMPLETE_CHOICES, DEFAULT_PULL_REQUEST_COMPLETE)})` }, ...COMPLETE_CHOICES], t)))
      .child(this.selectQuestion("close", "When the work is complete, close the worktree?", CLOSE_SENTENCE,
        [{ id: CLEAR_CHOICE, label: `Default (${choiceLabel(CLOSE_CHOICES, DEFAULT_CLOSE)})` }, ...CLOSE_CHOICES], t))
      .when(Boolean(this.typedInputs), (e) => e.children(TYPED_QUESTIONS.map(({ key, title, sentence }) => this.question(title, sentence, t, (controls) => controls
        .child(this.textField(this.typedInputs[key], t))
        .when(Boolean(problems[key]), (e) => e.child(div().whitespace_normal().text_size(12).text_color(t.ansi1).child(problems[key] ?? "")))))))
      .when(Boolean(this.savedAgent), (e) => e.children(AGENT_QUESTIONS.map((question) =>
        this.agentQuestion(question, `Default (${AGENT_DEFAULTS[question.key]})`, fields.workModelInput, t))))
      .when(Boolean(this.workPromptInput), (e) => e.child(this.question("Work prompt", WORK_PROMPT_SENTENCE, t,
        (controls) => controls.child(this.textareaField(this.workPromptInput, t))))), "global-save", t);
  }

  // A select of merge, complete or close, opening on the top level's value or Default.
  selectQuestion(key, title, sentence, options, t, addMore = (controls) => controls) {
    return this.question(title, sentence, t, (controls) => addMore(controls
      .child(this.selects[key].render(t, { options, value: this.chosen[key] ?? CLEAR_CHOICE, enabled: !this.saving,
        onChoose: (id, cx) => this.choose(key, id === CLEAR_CHOICE ? null : id, cx) }))));
  }
}
