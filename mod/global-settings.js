// The settings at issues.json's top level, which apply to every repository without its own: the settings view's
// Global form (settings.js). It shows only the settings that have a top-level version, under the Repository form's
// section headings except Tracker (GLOBAL_SECTIONS in settings-fields.js). Approval: whether a session asks for
// approval of its work, approval; how the branch then gets into main, onApproval; whether a session waits for
// its pull request's checks, waitForChecks, shown for a pull request or the default onApproval, which is a pull
// request for a repository on GitHub; and whether main is pushed after merging, pushAfterMerge, shown for a merge
// or the default onApproval (settings-fields.js). A retired merge and complete open as the values they mean, and
// any change to the four saves all four. Worktrees: the name of each issue's space, spaceName; and
// what a finished session does about its worktree, close. Issue sessions: their model and effort, workModel and
// workEffort; and the prompt appended to their system prompt, workPrompt, before any repository's own. Panel: how
// often the panel polls each tracker, pollSeconds, and checks for its own update, updateCheckHours, each a whole
// number before it can be saved. Each opens on the top level's value. Each select leads with a Default choice and each field
// shows the default as placeholder, and either removes the key, so the default applies. Each change saves as it's
// made (settings-form.js), writing only the changed keys with saveTopLevelSettings (setting.js); a field holding a
// value that can't be saved writes nothing until it's fixed.
import { div } from "gpui-kit";
import { InputState, TextareaState } from "gpui-base";
import { APPROVAL_QUESTIONS } from "./setup.js";
import { SelectMenu } from "./select.js";
import { CLEAR_CHOICE, GLOBAL_SECTIONS, yesNoChoiceId, globalSettingsFields, yesNoValue } from "./settings-fields.js";
import { AGENT_QUESTIONS, CLOSE_CHOICES, CLOSE_SENTENCE, SettingsForm, WORK_PROMPT_ROWS } from "./settings-form.js";
import {
  AGENT_DEFAULTS,
  DEFAULT_APPROVAL,
  DEFAULT_CLOSE,
  DEFAULT_POLL_SECONDS,
  DEFAULT_UPDATE_CHECK_HOURS,
  DEFAULT_WAIT_FOR_CHECKS,
  DEFAULT_PUSH_AFTER_MERGE,
  APPROVAL_QUESTION_KEYS,
  closeChoice,
  ownApproval,
  parsePollSeconds,
  parseUpdateCheckHours,
  saveTopLevelSettings,
  topLevelSettings,
} from "./trackers/setting.js";

/** @import { AsyncContext, Context, NativeElement } from "gpui-kit" */
/** @import { InputState as InputStateType, TextareaState as TextareaStateType } from "gpui-base" */
/** @import { Theme } from "./menu.js" */
/** @import { SelectOption } from "./select.js" */
/** @import { ApprovalKey } from "./setup.js" */
/** @import { AgentKey, AgentValues, SaveRequest } from "./settings-form.js" */

/** @typedef {{ key: string, title: string, placeholder: string, parse: (text: string) => string | number | null, sentence: string }} TypedQuestion */
/** @typedef {Record<string, string | number | boolean | null>} SavedValues */

/** @type {SelectOption} */
const DEFAULT_ON_APPROVAL_CHOICE = {
  id: CLEAR_CHOICE,
  label: "Default (Pull request or merge)",
  detail: "A pull request when the repository's origin is on GitHub, and a merge into main otherwise.",
};
/**
 * @param {SelectOption[]} choices
 * @param {string} id
 */
const choiceLabel = (choices, id) => choices.find((choice) => choice.id === id)?.label;

/** @type {TypedQuestion[]} */
const TYPED_QUESTIONS = [
  {
    key: "spaceName",
    title: "Issue space name",
    placeholder: "<issueId>",
    parse: (/** @type {string} */ text) => text.trim() || null,
    sentence:
      "The name of each issue's worktree space, where <issueId> is the issue's ID and <repo> the repository's name. Leave it empty to name spaces after the issue's ID.",
  },
  {
    key: "pollSeconds",
    title: "Poll interval",
    placeholder: String(DEFAULT_POLL_SECONDS),
    parse: parsePollSeconds,
    sentence: `How often, in whole seconds of 10 or more, the panel asks each repository's tracker for its issues. Leave it empty to poll every ${DEFAULT_POLL_SECONDS} seconds.`,
  },
  {
    key: "updateCheckHours",
    title: "Update check interval",
    placeholder: String(DEFAULT_UPDATE_CHECK_HOURS),
    parse: parseUpdateCheckHours,
    sentence: `How often, in whole hours of 1 or more, the panel checks for an update to itself. Leave it empty to check every ${DEFAULT_UPDATE_CHECK_HOURS} hours.`,
  },
];
const SELECT_KEYS = [...APPROVAL_QUESTION_KEYS, "close"];
const WORK_PROMPT_SENTENCE =
  "Instructions appended to the system prompt of every Claude session that works an issue. A repository's own prompt is added after this one.";

export class GlobalSettings extends SettingsForm {
  /**
   * @param {{ onSaved: (cx: AsyncContext) => void }} callbacks
   */
  constructor({ onSaved }) {
    super({ onSaved });
    /** @type {SavedValues} */
    this.saved = null;
    /** @type {Record<string, string | null>} */
    this.chosen = {};
    /** @type {Record<string, InputStateType> | null} */
    this.typedInputs = null;
    /** @type {TextareaStateType | null} */
    this.workPromptInput = null;
  }

  /**
   * @param {Context} cx
   */
  load(cx) {
    this.selects = {
      ...Object.fromEntries(
        Object.entries(APPROVAL_QUESTIONS).map(([key, { title }]) => [key, new SelectMenu(`global-${key}`, title, cx)]),
      ),
      close: new SelectMenu("global-close", "How are worktrees closed?", cx),
      ...this.agentSelects("global", cx),
    };
    cx.spawn(async (cx) => {
      try {
        const settings = await topLevelSettings();
        /** @param {string} key */
        const value = (key) => {
          const raw = /** @type {Record<string, string | number | boolean | undefined>} */ (settings)[key];
          return typeof raw === "string" ? raw.trim() || null : (raw ?? null);
        };
        this.saved = {
          ...Object.fromEntries(
            [...TYPED_QUESTIONS.map(({ key }) => key), "workPrompt"].map((key) => [key, value(key)]),
          ),
          close: closeChoice(/** @type {string | null} */ (value("close"))),
          ...ownApproval(settings),
        };
        this.chosen = {
          ...Object.fromEntries(SELECT_KEYS.map((key) => [key, this.saved[key]])),
          waitForChecks: yesNoChoiceId(/** @type {boolean | null} */ (this.saved.waitForChecks)),
          pushAfterMerge: yesNoChoiceId(/** @type {boolean | null} */ (this.saved.pushAfterMerge)),
        };
        this.typedInputs = Object.fromEntries(
          TYPED_QUESTIONS.map(({ key, placeholder }) => {
            const input = InputState.new({
              placeholder,
              value: this.saved[key] == null ? "" : String(this.saved[key]),
            });
            input.on("change", (_e, cx) => this.edited(cx));
            input.on("submit", (_e, cx) => this.saveNow(cx));
            return [key, input];
          }),
        );
        this.openAgent(
          /** @type {AgentValues} */ (Object.fromEntries(Object.keys(AGENT_DEFAULTS).map((key) => [key, value(key)]))),
        );
        this.workPromptInput = TextareaState.new({
          placeholder: "No prompt",
          value: String(this.saved.workPrompt ?? ""),
          rows: WORK_PROMPT_ROWS,
        });
        this.workPromptInput.set_soft_wrap(true);
        this.workPromptInput.on("change", (_e, cx) => this.edited(cx));
      } catch (/** @type {any} */ e) {
        this.error = String(e.message ?? e);
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  // `value` for approval, onApproval, waitForChecks, pushAfterMerge or close, or null to remove it.
  /**
   * @param {string} key
   * @param {string | null} value
   * @param {Context} cx
   */
  choose(key, value, cx) {
    this.chosen = { ...this.chosen, [key]: value };
    this.saveNow(cx);
  }

  fields() {
    return globalSettingsFields({
      onApproval: this.chosen.onApproval,
      workModel: this.agentValues.workModel,
      otherWorkModelPicked: this.otherWorkModelPicked,
    });
  }

  // Each typed setting's value, or its problem when it can't be saved.
  typed() {
    if (!this.typedInputs) return { values: {}, problems: {} };
    /** @type {Record<string, string | number | null>} */
    const values = {};
    /** @type {Record<string, string>} */
    const problems = {};
    for (const { key, parse } of TYPED_QUESTIONS) {
      try {
        values[key] = parse(this.typedInputs[key].value());
      } catch (/** @type {any} */ e) {
        problems[key] = String(e.message ?? e);
      }
    }
    return { values, problems };
  }

  // The approval, onApproval, waitForChecks and pushAfterMerge to save; waitForChecks only under a pull request or
  // the default, and pushAfterMerge only under a merge or the default.
  approvalValues() {
    const { approval, onApproval, waitForChecks, pushAfterMerge } = this.chosen;
    const { waitForChecksSelect, pushAfterMergeSelect } = this.fields();
    return {
      approval,
      onApproval,
      waitForChecks: waitForChecksSelect ? yesNoValue(waitForChecks) : null,
      pushAfterMerge: pushAfterMergeSelect ? yesNoValue(pushAfterMerge) : null,
    };
  }

  // Every top-level setting whose control differs from the top level, as its value or null. A change to any of
  // approval, onApproval, waitForChecks and pushAfterMerge includes all four, since saving them removes the retired
  // merge and complete; a hidden waitForChecks or pushAfterMerge isn't a change by itself.
  changes() {
    if (!this.saved) return {};
    const approvalSettings = this.approvalValues();
    const { waitForChecksSelect, pushAfterMergeSelect } = this.fields();
    /** @type {Record<string, boolean>} */
    const shown = { waitForChecks: waitForChecksSelect, pushAfterMerge: pushAfterMergeSelect };
    const approvalChanged = APPROVAL_QUESTION_KEYS.some(
      (key) => (shown[key] ?? true) && approvalSettings[/** @type {ApprovalKey} */ (key)] !== this.saved[key],
    );
    const current = {
      close: this.chosen.close,
      ...this.typed().values,
      ...this.agentValues,
      workPrompt: this.workPromptInput?.value().trim() || null,
    };
    /** @param {string} key */
    const savedFor = (key) =>
      key in AGENT_DEFAULTS ? this.savedAgent[/** @type {AgentKey} */ (key)] : this.saved[key];
    const changed = Object.fromEntries(
      Object.entries(current)
        .filter(([key, value]) => (value ?? null) !== savedFor(key))
        .map(([key, value]) => [key, value ?? null]),
    );
    return approvalChanged ? { ...changed, ...approvalSettings } : changed;
  }

  // The changed keys, written together, after which they're the saved values, or null when nothing changed. A typed
  // value that can't be saved isn't a change yet.
  /**
   * @returns {SaveRequest | null}
   */
  saveRequest() {
    const changes = this.changes();
    if (Object.keys(changes).length === 0) return null;
    return {
      write: () => saveTopLevelSettings(changes),
      written: () => {
        const agent = Object.entries(changes).filter(([key]) => key in AGENT_DEFAULTS);
        const others = Object.entries(changes).filter(([key]) => !(key in AGENT_DEFAULTS));
        this.savedAgent = { ...this.savedAgent, .../** @type {AgentValues} */ (Object.fromEntries(agent)) };
        this.saved = { ...this.saved, ...Object.fromEntries(others) };
      },
    };
  }

  /**
   * @param {NativeElement} content
   * @param {Theme} t
   */
  form(content, t) {
    return this.sections(this.errorLine(content, t), GLOBAL_SECTIONS, this.questionRenderer(t), t);
  }

  // The question for each setting's key, or null while it hasn't loaded or doesn't apply: waitForChecks only under a
  // pull request or the default onApproval, and pushAfterMerge only under a merge or the default.
  /**
   * @param {Theme} t
   * @returns {(key: string) => NativeElement | null}
   */
  questionRenderer(t) {
    const fields = this.fields();
    const { problems } = this.typed();
    /** @type {Record<string, () => NativeElement | null>} */
    const questions = {
      approval: () =>
        this.approvalQuestion(
          "approval",
          {
            id: CLEAR_CHOICE,
            label: `Default (${choiceLabel(APPROVAL_QUESTIONS.approval.choices, DEFAULT_APPROVAL)})`,
          },
          t,
        ),
      onApproval: () => this.approvalQuestion("onApproval", DEFAULT_ON_APPROVAL_CHOICE, t),
      waitForChecks: () =>
        fields.waitForChecksSelect
          ? this.approvalQuestion(
              "waitForChecks",
              {
                id: CLEAR_CHOICE,
                label: `Default (${choiceLabel(APPROVAL_QUESTIONS.waitForChecks.choices, yesNoChoiceId(DEFAULT_WAIT_FOR_CHECKS))})`,
              },
              t,
            )
          : null,
      pushAfterMerge: () =>
        fields.pushAfterMergeSelect
          ? this.approvalQuestion(
              "pushAfterMerge",
              {
                id: CLEAR_CHOICE,
                label: `Default (${choiceLabel(APPROVAL_QUESTIONS.pushAfterMerge.choices, yesNoChoiceId(DEFAULT_PUSH_AFTER_MERGE))})`,
              },
              t,
            )
          : null,
      close: () =>
        this.selectQuestion(
          "close",
          "How are worktrees closed?",
          CLOSE_SENTENCE,
          [{ id: CLEAR_CHOICE, label: `Default (${choiceLabel(CLOSE_CHOICES, DEFAULT_CLOSE)})` }, ...CLOSE_CHOICES],
          t,
        ),
      workPrompt: () =>
        this.workPromptInput &&
        this.question("Work prompt", WORK_PROMPT_SENTENCE, t, (controls) =>
          controls.child(this.textareaField(this.workPromptInput, t)),
        ),
    };
    for (const { key, title, sentence } of TYPED_QUESTIONS)
      questions[key] = () =>
        this.typedInputs &&
        this.question(title, sentence, t, (controls) =>
          controls.child(this.textField(this.typedInputs[key], t)).when(Boolean(problems[key]), (e) =>
            e.child(
              div()
                .whitespace_normal()
                .text_size(12)
                .text_color(t.ansi1)
                .child(problems[key] ?? ""),
            ),
          ),
        );
    for (const question of AGENT_QUESTIONS)
      questions[question.key] = () =>
        this.savedAgent &&
        this.agentQuestion(question, `Default (${AGENT_DEFAULTS[question.key]})`, fields.workModelInput, t);
    return (key) => questions[key]?.() ?? null;
  }

  // The select of approval, onApproval, waitForChecks or pushAfterMerge, led by `defaultChoice`.
  /**
   * @param {ApprovalKey} key
   * @param {SelectOption} defaultChoice
   * @param {Theme} t
   */
  approvalQuestion(key, defaultChoice, t) {
    const { title, sentence, choices } = APPROVAL_QUESTIONS[key];
    return this.selectQuestion(key, title, sentence, [defaultChoice, ...choices], t);
  }

  // A select of an approval question or close, opening on the top level's value or Default.
  /**
   * @param {string} key
   * @param {string} title
   * @param {string | null} sentence
   * @param {SelectOption[]} options
   * @param {Theme} t
   */
  selectQuestion(key, title, sentence, options, t) {
    return this.question(title, sentence, t, (controls) =>
      controls.child(
        this.selects[key].render(t, {
          options,
          value: this.chosen[key] ?? CLEAR_CHOICE,
          onChoose: (id, cx) => this.choose(key, id === CLEAR_CHOICE ? null : id, cx),
        }),
      ),
    );
  }
}
