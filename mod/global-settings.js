// The settings at issues.json's top level, which apply to every repository without its own: the settings view's
// Global form (settings.js). It shows only the settings that have a top-level version, under the Repository form's
// section headings except Tracker (GLOBAL_SECTIONS in settings-fields.js). Approval: whether a session asks for
// approval of its work, approval; how the branch then gets into main, onApproval; whether a session waits for
// its pull request's checks, waitForChecks, shown for a pull request or the default onApproval, which is a pull
// request for a repository on GitHub; and whether main is pushed after merging, pushAfterMerge, shown for a merge
// or the default onApproval (settings-fields.js). A retired merge and complete open as the values they mean, and
// any change to the four saves all four. Worktrees: the command each new issue space runs, worktreeCommand; the
// name of each issue's space, spaceName; and what a finished session does about its worktree, close. Panel: how
// often the panel polls each tracker, pollSeconds, and checks for its own update, updateCheckHours, each a whole
// number before it can be saved. Each opens on the top level's value. Each select leads with a Default choice and each field
// shows the default as placeholder, and either removes the key, so the default applies. Each change saves as it's
// made (settings-form.js), writing only the changed keys with saveTopLevelSettings (setting.js); a field holding a
// value that can't be saved writes nothing until it's fixed.
import { div } from "gpui-kit";
import { InputState } from "gpui-base";
import { APPROVAL_QUESTIONS } from "./setup.js";
import { SelectMenu } from "./select.js";
import { CLEAR_CHOICE, GLOBAL_SECTIONS, yesNoChoiceId, globalSettingsFields, yesNoValue } from "./settings-fields.js";
import { CLOSE_CHOICES, SETTING_LABELS, SettingsForm, spaceNameLabel, worktreeCommandLabel } from "./settings-form.js";
import {
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
/** @import { InputState as InputStateType } from "gpui-base" */
/** @import { Theme } from "./menu.js" */
/** @import { SelectOption } from "./select.js" */
/** @import { ApprovalKey } from "./setup.js" */
/** @import { SaveRequest, SettingLabel } from "./settings-form.js" */

/** @typedef {{ key: string, label: SettingLabel, placeholder: string, parse: (text: string) => string | number | null }} TypedQuestion */
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
    key: "worktreeCommand",
    label: worktreeCommandLabel(
      "Runs in the tab of each new issue space, such as an agent given the issue. Empty opens a shell.",
    ),
    placeholder: "No command",
    parse: (/** @type {string} */ text) => text.trim() || null,
  },
  {
    key: "spaceName",
    label: spaceNameLabel("Empty uses the issue's ID."),
    placeholder: "<issueId>",
    parse: (/** @type {string} */ text) => text.trim() || null,
  },
  {
    key: "pollSeconds",
    label: {
      title: "Poll interval",
      sentence: `Seconds between checks of each repository's tracker, 10 or more. Empty polls every ${DEFAULT_POLL_SECONDS} seconds.`,
    },
    placeholder: String(DEFAULT_POLL_SECONDS),
    parse: parsePollSeconds,
  },
  {
    key: "updateCheckHours",
    label: {
      title: "Update check interval",
      sentence: `Hours between checks for an update to the panel, 1 or more. Empty checks every ${DEFAULT_UPDATE_CHECK_HOURS} hours.`,
    },
    placeholder: String(DEFAULT_UPDATE_CHECK_HOURS),
    parse: parseUpdateCheckHours,
  },
];
const SELECT_KEYS = [...APPROVAL_QUESTION_KEYS, "close"];

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
  }

  /**
   * @param {Context} cx
   */
  load(cx) {
    this.selects = {
      ...Object.fromEntries(
        Object.keys(APPROVAL_QUESTIONS).map((key) => [
          key,
          new SelectMenu(`global-${key}`, SETTING_LABELS[/** @type {ApprovalKey} */ (key)].title, cx),
        ]),
      ),
      close: new SelectMenu("global-close", SETTING_LABELS.close.title, cx),
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
          ...Object.fromEntries(TYPED_QUESTIONS.map(({ key }) => [key, value(key)])),
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
    return globalSettingsFields({ onApproval: this.chosen.onApproval });
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
    const current = { close: this.chosen.close, ...this.typed().values };
    const changed = Object.fromEntries(
      Object.entries(current)
        .filter(([key, value]) => (value ?? null) !== this.saved[key])
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
        this.saved = { ...this.saved, ...changes };
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
          [{ id: CLEAR_CHOICE, label: `Default (${choiceLabel(CLOSE_CHOICES, DEFAULT_CLOSE)})` }, ...CLOSE_CHOICES],
          t,
        ),
    };
    for (const { key, label } of TYPED_QUESTIONS)
      questions[key] = () =>
        this.typedInputs &&
        this.question(label, t, (controls) =>
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
    return (key) => questions[key]?.() ?? null;
  }

  // The select of approval, onApproval, waitForChecks or pushAfterMerge, led by `defaultChoice`.
  /**
   * @param {ApprovalKey} key
   * @param {SelectOption} defaultChoice
   * @param {Theme} t
   */
  approvalQuestion(key, defaultChoice, t) {
    return this.selectQuestion(key, [defaultChoice, ...APPROVAL_QUESTIONS[key].choices], t);
  }

  // A select of an approval question or close, opening on the top level's value or Default.
  /**
   * @param {ApprovalKey | "close"} key
   * @param {SelectOption[]} options
   * @param {Theme} t
   */
  selectQuestion(key, options, t) {
    return this.question(SETTING_LABELS[key], t, (controls) =>
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
