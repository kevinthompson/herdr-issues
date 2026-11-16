// The settings at issues.json's top level, which apply to every repository without its own: the settings view's
// Global form (settings.js). It shows only the settings that have a top-level version: whether a session asks for
// approval before its work lands, approval; how the branch then gets into main, onApproval; whether a session waits
// for its pull request's checks, waitForChecks, shown for a pull request or the default onApproval, which is a
// pull request for a repository on GitHub (settings-fields.js), where a retired merge and complete open as the
// values they mean and any change to the three saves all three; what a finished session does about its worktree,
// close; the name of each issue's space, spaceName; how often the panel polls each tracker, pollSeconds, and checks
// for its own update, updateCheckHours, each a whole number before it can be saved; the issue sessions' model and
// effort, workModel and workEffort; and the prompt appended to their system prompt, workPrompt, before any
// repository's own. Each opens on the top level's value. Each select leads with a Default choice and each field
// shows the default as placeholder, and either removes the key, so the default applies. Save writes only the
// changed keys with saveTopLevelSettings (setting.js).
import { div } from "gpui-kit";
import { InputState, TextareaState } from "gpui-base";
import { LANDING_QUESTIONS } from "./setup.js";
import { SelectMenu } from "./select.js";
import { CLEAR_CHOICE, checksChoiceId, globalSettingsFields, waitForChecksOf } from "./settings-fields.js";
import { AGENT_QUESTIONS, CLOSE_CHOICES, CLOSE_SENTENCE, SettingsForm, WORK_PROMPT_ROWS } from "./settings-form.js";
import {
  AGENT_DEFAULTS, DEFAULT_APPROVAL, DEFAULT_CLOSE, DEFAULT_POLL_SECONDS, DEFAULT_UPDATE_CHECK_HOURS, DEFAULT_WAIT_FOR_CHECKS,
  LANDING_KEYS, closeChoice, ownLanding, parsePollSeconds, parseUpdateCheckHours, saveTopLevelSettings, topLevelSettings,
} from "./trackers/setting.js";

const DEFAULT_ON_APPROVAL_CHOICE = {
  id: CLEAR_CHOICE, label: "Default",
  detail: "A pull request when the repository's origin is on GitHub, and a merge into main otherwise.",
};
const choiceLabel = (choices, id) => choices.find((choice) => choice.id === id)?.label;

const TYPED_QUESTIONS = [
  { key: "spaceName", title: "Issue space name", placeholder: "<issueId>", parse: (text) => text.trim() || null,
    sentence: "The name of each issue's worktree space, where <issueId> is the issue's ID and <repo> the repository's name. Leave it empty to name spaces after the issue's ID." },
  { key: "pollSeconds", title: "Poll interval", placeholder: String(DEFAULT_POLL_SECONDS), parse: parsePollSeconds,
    sentence: `How often, in whole seconds of 10 or more, the panel asks each repository's tracker for its issues. Leave it empty to poll every ${DEFAULT_POLL_SECONDS} seconds.` },
  { key: "updateCheckHours", title: "Update check interval", placeholder: String(DEFAULT_UPDATE_CHECK_HOURS), parse: parseUpdateCheckHours,
    sentence: `How often, in whole hours of 1 or more, the panel checks for an update to itself. Leave it empty to check every ${DEFAULT_UPDATE_CHECK_HOURS} hours.` },
];
const SELECT_KEYS = [...LANDING_KEYS, "close"];
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
      ...Object.fromEntries(Object.entries(LANDING_QUESTIONS).map(([key, { title }]) => [key, new SelectMenu(`global-${key}`, title, cx)])),
      close: new SelectMenu("global-close", "How are worktrees closed?", cx),
      ...this.agentSelects("global", cx),
    };
    cx.spawn(async (cx) => {
      try {
        const settings = await topLevelSettings();
        const value = (key) => (typeof settings[key] === "string" ? settings[key].trim() || null : settings[key] ?? null);
        this.saved = {
          ...Object.fromEntries([...TYPED_QUESTIONS.map(({ key }) => key), "workPrompt"].map((key) => [key, value(key)])),
          close: closeChoice(value("close")),
          ...ownLanding(settings),
        };
        this.chosen = { ...Object.fromEntries(SELECT_KEYS.map((key) => [key, this.saved[key]])), waitForChecks: checksChoiceId(this.saved.waitForChecks) };
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

  // `value` for approval, onApproval, waitForChecks or close, or null to remove it.
  choose(key, value, cx) {
    this.chosen = { ...this.chosen, [key]: value };
    this.error = null;
    cx.notify();
  }

  fields() {
    return globalSettingsFields({ onApproval: this.chosen.onApproval, workModel: this.agentValues.workModel, otherWorkModelPicked: this.otherWorkModelPicked });
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

  // The approval, onApproval and waitForChecks to save; waitForChecks only under a pull request or the default.
  landingValues() {
    const { approval, onApproval, waitForChecks } = this.chosen;
    return { approval, onApproval, waitForChecks: this.fields().waitForChecksSelect ? waitForChecksOf(waitForChecks) : null };
  }

  // Every top-level setting whose control differs from the top level, as its value or null. A change to any of
  // approval, onApproval and waitForChecks includes all three, since saving them removes the retired merge and
  // complete; a hidden waitForChecks isn't a change by itself.
  changes() {
    if (!this.saved) return {};
    const landing = this.landingValues();
    const landingChanged = LANDING_KEYS.some((key) => (key !== "waitForChecks" || this.fields().waitForChecksSelect) && landing[key] !== this.saved[key]);
    const current = {
      close: this.chosen.close, ...this.typed().values, ...this.agentValues,
      workPrompt: this.workPromptInput?.value().trim() || null,
    };
    const savedFor = (key) => (key in AGENT_DEFAULTS ? this.savedAgent[key] : this.saved[key]);
    const changed = Object.fromEntries(Object.entries(current)
      .filter(([key, value]) => (value ?? null) !== savedFor(key))
      .map(([key, value]) => [key, value ?? null]));
    return landingChanged ? { ...changed, ...landing } : changed;
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
      .child(this.landingQuestion("approval", { id: CLEAR_CHOICE, label: `Default (${choiceLabel(LANDING_QUESTIONS.approval.choices, DEFAULT_APPROVAL)})` }, t))
      .child(this.landingQuestion("onApproval", DEFAULT_ON_APPROVAL_CHOICE, t))
      .when(fields.waitForChecksSelect, (e) => e.child(this.landingQuestion("waitForChecks",
        { id: CLEAR_CHOICE, label: `Default (${choiceLabel(LANDING_QUESTIONS.waitForChecks.choices, checksChoiceId(DEFAULT_WAIT_FOR_CHECKS))})` }, t)))
      .child(this.selectQuestion("close", "How are worktrees closed?", CLOSE_SENTENCE,
        [{ id: CLEAR_CHOICE, label: `Default (${choiceLabel(CLOSE_CHOICES, DEFAULT_CLOSE)})` }, ...CLOSE_CHOICES], t))
      .when(Boolean(this.typedInputs), (e) => e.children(TYPED_QUESTIONS.map(({ key, title, sentence }) => this.question(title, sentence, t, (controls) => controls
        .child(this.textField(this.typedInputs[key], t))
        .when(Boolean(problems[key]), (e) => e.child(div().whitespace_normal().text_size(12).text_color(t.ansi1).child(problems[key] ?? "")))))))
      .when(Boolean(this.savedAgent), (e) => e.children(AGENT_QUESTIONS.map((question) =>
        this.agentQuestion(question, `Default (${AGENT_DEFAULTS[question.key]})`, fields.workModelInput, t))))
      .when(Boolean(this.workPromptInput), (e) => e.child(this.question("Work prompt", WORK_PROMPT_SENTENCE, t,
        (controls) => controls.child(this.textareaField(this.workPromptInput, t))))), "global-save", t);
  }

  // The select of approval, onApproval or waitForChecks, led by `defaultChoice`.
  landingQuestion(key, defaultChoice, t) {
    const { title, sentence, choices } = LANDING_QUESTIONS[key];
    return this.selectQuestion(key, title, sentence, [defaultChoice, ...choices], t);
  }

  // A select of approval, onApproval, waitForChecks or close, opening on the top level's value or Default.
  selectQuestion(key, title, sentence, options, t) {
    return this.question(title, sentence, t, (controls) => controls
      .child(this.selects[key].render(t, { options, value: this.chosen[key] ?? CLEAR_CHOICE, enabled: !this.saving,
        onChoose: (id, cx) => this.choose(key, id === CLEAR_CHOICE ? null : id, cx) })));
  }
}
