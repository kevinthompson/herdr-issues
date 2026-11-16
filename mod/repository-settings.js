// The focused repository's settings, a form of the settings view (settings.js), whose fields show only when they
// apply to the choices above them (settings-fields.js), grouped under section headings (REPOSITORY_SECTIONS).
// Tracker: the name of the space on its main checkout, its name, typed in with the default as placeholder, where
// emptying the field removes it from the entry; and where its issues live, its tracker, which a different choice
// checks as the setup view does (tracker-choice.js) before it can be saved, with Linear's team once Linear is
// checked. Approval: whether a session asks for approval of its work, its approval; how the branch then gets into
// main, its onApproval; only when the onApproval that applies is a pull request, whether the session waits for
// its checks, its waitForChecks; and only when it is a merge, whether main is pushed after merging, its
// pushAfterMerge. Worktrees: the command run in each new worktree, its worktreeSetup; the name of
// each issue's space, its spaceName; and what a finished session does about its worktree, its close. The approval
// selects and close each lead with a choice that removes it from the entry, labeled with what applies in its place,
// such as "Global (Open a pull request)" or "Default (Ask me)", where the default onApproval is a pull request for
// an origin on GitHub. Issue sessions: the model and effort of the sessions that work its issues, its workModel and
// workEffort, whose choice that removes them from the entry is labeled with the global value, such as
// "Global (opus)", or the default; and the text appended to those sessions' system prompt after the global prompt,
// its workPrompt, in a soft-wrapped textarea several rows tall, where emptying it removes it from the entry. Panel:
// how often the panel polls its tracker, its pollSeconds, which must be a whole number of at least 10 seconds
// before it can be saved. Each of worktreeSetup, spaceName and pollSeconds is typed in as name is, with what
// applies without it as the placeholder, naming the global value where one is set. It opens on the entry's own
// settings, with each
// select the entry doesn't set on its choice that removes it; an entry's retired merge and complete show as the
// approval, onApproval and waitForChecks they mean. Each change saves as it's made (settings-form.js), writing only
// the changed keys (saveTrackerChoice, saveApprovalSettings, saveCloseSetting, saveNameSetting, saveRepositorySettings,
// saveAgentSettings and saveWorkPrompt in setting.js); a different tracker saves once its check passes and, for
// Linear, once a team is picked, and a poll interval that can't be saved is written once it's fixed.
import { div } from "gpui-kit";
import { InputState, TextareaState } from "gpui-base";
import { APPROVAL_QUESTIONS } from "./setup.js";
import { SelectMenu } from "./select.js";
import { CLEAR_CHOICE, REPOSITORY_SECTIONS, yesNoChoiceId, settingsFields, yesNoValue } from "./settings-fields.js";
import {
  AGENT_QUESTIONS,
  CLOSE_CHOICES,
  SETTING_LABELS,
  SettingsForm,
  WORK_PROMPT_ROWS,
  spaceNameLabel,
  workPromptLabel,
} from "./settings-form.js";
import { TrackerChoice, TRACKERS } from "./tracker-choice.js";
import {
  AGENT_DEFAULTS,
  DEFAULT_APPROVAL,
  DEFAULT_CLOSE,
  DEFAULT_POLL_SECONDS,
  DEFAULT_WAIT_FOR_CHECKS,
  DEFAULT_PUSH_AFTER_MERGE,
  REPOSITORY_KEYS,
  agentSettings,
  approvalSources,
  nameSettings,
  parsePollSeconds,
  repositorySettings,
  saveAgentSettings,
  saveCloseSetting,
  saveApprovalSettings,
  saveNameSetting,
  saveRepositorySettings,
  saveTrackerChoice,
  saveWorkPrompt,
  workPromptSettings,
} from "./trackers/setting.js";

/** @import { AsyncContext, Context, NativeElement } from "gpui-kit" */
/** @import { InputState as InputStateType, TextareaState as TextareaStateType } from "gpui-base" */
/** @import { Theme } from "./menu.js" */
/** @import { SelectOption } from "./select.js" */
/** @import { ApprovalKey } from "./setup.js" */
/** @import { SaveRequest, SettingLabel } from "./settings-form.js" */
/** @import { Project } from "./trackers/index.js" */

/** @typedef {{ kind: string, team?: string, repo?: string }} CurrentTracker */
/** @typedef {ApprovalKey | "close"} ApprovalChoiceKey */
/** @typedef {Partial<Record<ApprovalChoiceKey, string | null>>} ApprovalChoices */
/** @typedef {"worktreeSetup" | "spaceName" | "pollSeconds"} RepositoryKey */
/** @typedef {Awaited<ReturnType<typeof repositorySettings>>} RepositoryValues */

const TEAM_PICKS = "issues.settingsTeams";
const REPOSITORY_FIELDS = /** @type {RepositoryKey[]} */ (REPOSITORY_KEYS);

/**
 * @param {SelectOption[]} choices
 * @param {string} id
 */
const choiceLabel = (choices, id) => choices.find((choice) => choice.id === id)?.label;

/** @type {SettingLabel} */
const NAME_LABEL = {
  title: "Repository name",
  sentence: "Names the main checkout's space; issue spaces nest under it. Empty uses the repository's name.",
};

/** @type {Record<RepositoryKey, SettingLabel>} */
const REPOSITORY_LABELS = {
  worktreeSetup: {
    title: "Setup command",
    sentence: "Runs in each new issue worktree, such as npm install. Empty runs nothing.",
  },
  spaceName: spaceNameLabel("Empty uses the global name, or the issue's ID if there isn't one."),
  pollSeconds: {
    title: "Poll interval",
    sentence: "Seconds between checks of the tracker, 10 or more. Empty uses the global interval or the default.",
  },
};

const WORK_PROMPT_LABEL = workPromptLabel(
  "Added after the global prompt to the system prompt of each session that works this repository's issues. Empty uses only the global prompt.",
);

// Where the listed issues come from now, such as "Linear team WEB".
/**
 * @param {CurrentTracker} current
 */
function currentTrackerLabel({ kind, team, repo }) {
  if (kind === "linear") return `Linear team ${team}`;
  if (kind === "github") return repo ? `GitHub Issues in ${repo}` : "GitHub Issues";
  return "Beads";
}

export class RepositorySettings extends SettingsForm {
  // project: the focused { root, on }; main: its repository's main checkout; current: the tracker the panel lists,
  // { kind, team?, repo? }.
  /**
   * @param {Project} project
   * @param {string} main
   * @param {CurrentTracker} current
   * @param {{ onSaved: (cx: AsyncContext) => void }} callbacks
   */
  constructor(project, main, current, { onSaved }) {
    super({ onSaved });
    this.project = project;
    this.main = main;
    this.current = current;
    this.trackerReady = false;
    this.tracker = new TrackerChoice(main, {
      picks: TEAM_PICKS,
      // Both run before the tracker's check settles or within a render, so the save waits for the next tick.
      onReady: (_none, cx) => {
        this.trackerReady = true;
        this.autosave.schedule(cx, 0);
        cx.notify();
      },
      onTeam: (cx) => this.autosave.schedule(cx, 0),
    });
    // The entry's own approval, onApproval, waitForChecks and close, as their selects' ids, and the chosen ones.
    /** @type {Awaited<ReturnType<typeof approvalSources>> | null} */
    this.approvalSettings = null;
    /** @type {ApprovalChoices | null} */
    this.savedApproval = null;
    /** @type {ApprovalChoices} */
    this.chosenApproval = {};
    /** @type {string | null} */
    this.savedName = null;
    /** @type {InputStateType | null} */
    this.nameInput = null;
    /** @type {RepositoryValues | null} */
    this.savedRepository = null;
    /** @type {Record<RepositoryKey, InputStateType> | null} */
    this.repositoryInputs = null;
    /** @type {Awaited<ReturnType<typeof agentSettings>> | null} */
    this.agentSources = null;
    /** @type {string | null} */
    this.savedWorkPrompt = null;
    /** @type {TextareaStateType | null} */
    this.workPromptInput = null;
  }

  /**
   * @param {Context} cx
   */
  load(cx) {
    this.selects = {
      tracker: new SelectMenu("settings-tracker", "Issue source", cx),
      ...Object.fromEntries(
        Object.keys(APPROVAL_QUESTIONS).map((key) => [
          key,
          new SelectMenu(`settings-${key}`, SETTING_LABELS[/** @type {ApprovalKey} */ (key)].title, cx),
        ]),
      ),
      close: new SelectMenu("settings-close", SETTING_LABELS.close.title, cx),
      ...this.agentSelects("settings", cx),
    };
    cx.spawn(async (cx) => {
      try {
        const [approvalSettings, name, repository, agent, workPrompt] = await Promise.all([
          approvalSources(this.project),
          nameSettings(this.project),
          repositorySettings(this.project),
          agentSettings(this.project),
          workPromptSettings(this.project),
        ]);
        this.approvalSettings = approvalSettings;
        this.savedApproval = {
          ...approvalSettings.entry,
          waitForChecks: yesNoChoiceId(approvalSettings.entry.waitForChecks),
          pushAfterMerge: yesNoChoiceId(approvalSettings.entry.pushAfterMerge),
        };
        this.chosenApproval = { ...this.savedApproval };
        this.savedName = name.entry;
        this.nameInput = InputState.new({ placeholder: name.defaultName, value: name.entry ?? "" });
        this.nameInput.on("change", (_e, cx) => this.edited(cx));
        this.nameInput.on("submit", (_e, cx) => this.saveNow(cx));
        this.savedRepository = repository;
        this.repositoryInputs = this.newRepositoryInputs(repository);
        this.agentSources = agent;
        this.openAgent(Object.fromEntries(Object.entries(agent).map(([key, { entry }]) => [key, entry])));
        this.savedWorkPrompt = workPrompt.entry;
        this.workPromptInput = TextareaState.new({
          placeholder: "No prompt for this repository",
          value: workPrompt.entry ?? "",
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

  // A field for each of pollSeconds, spaceName and worktreeSetup, opening on the entry's value, with what applies
  // without it as the placeholder.
  /**
   * @param {RepositoryValues} repository
   */
  newRepositoryInputs(repository) {
    /** @type {Record<RepositoryKey, string>} */
    const placeholders = {
      pollSeconds:
        repository.topLevelPollSeconds != null
          ? `Global (${repository.topLevelPollSeconds})`
          : String(DEFAULT_POLL_SECONDS),
      spaceName: repository.topLevelSpaceName != null ? `Global (${repository.topLevelSpaceName})` : "<issueId>",
      worktreeSetup: "No command",
    };
    return /** @type {Record<RepositoryKey, InputStateType>} */ (
      Object.fromEntries(
        REPOSITORY_FIELDS.map((key) => {
          const input = InputState.new({
            placeholder: placeholders[key],
            value: repository[key] == null ? "" : String(repository[key]),
          });
          input.on("change", (_e, cx) => this.edited(cx));
          input.on("submit", (_e, cx) => this.saveNow(cx));
          return [key, input];
        }),
      )
    );
  }

  // Choosing the current GitHub or Beads tracker again undoes a change; Linear's is checked again to change its team.
  /**
   * @param {string} choice
   * @param {Context} cx
   */
  chooseTracker(choice, cx) {
    Object.assign(this, { trackerReady: false, error: null });
    if (choice === this.current.kind && choice !== "linear") {
      this.tracker.reset();
      cx.notify();
      return;
    }
    this.tracker.choose(choice, cx);
    if (choice === this.current.kind) this.tracker.team = this.current.team;
  }

  /**
   * @param {Context} cx
   */
  takePickedTeam(cx) {
    this.tracker.takePickedTeam(cx);
  }

  // The tracker to save, or null when it stays as it is.
  /**
   * @returns {{ tracker: string, team?: string } | null}
   */
  trackerChange() {
    const { choice, team } = this.tracker;
    if (!choice || !this.trackerReady) return null;
    if (choice === "linear")
      return team && (this.current.kind !== "linear" || team !== this.current.team) ? { tracker: choice, team } : null;
    return choice === this.current.kind ? null : { tracker: choice };
  }

  // `value` for approval, onApproval, waitForChecks, pushAfterMerge or close, or null to remove it from the entry.
  /**
   * @param {ApprovalChoiceKey} key
   * @param {string | null} value
   * @param {Context} cx
   */
  chooseApproval(key, value, cx) {
    this.chosenApproval = { ...this.chosenApproval, [key]: value };
    this.saveNow(cx);
  }

  // The approval, onApproval, waitForChecks, pushAfterMerge and close that apply without the entry's own, each
  // { value, label }, where label names whether that's the global value or the default.
  approvalFallbacks() {
    const { topLevel, defaultOnApproval } = this.approvalSettings;
    /**
     * @param {ApprovalChoiceKey} key
     * @param {SelectOption[]} choices
     * @param {string | null} defaultValue
     */
    const fallback = (key, choices, defaultValue) => {
      const own = key === "waitForChecks" || key === "pushAfterMerge" ? yesNoChoiceId(topLevel[key]) : topLevel[key];
      const value = own ?? defaultValue;
      return { value, label: `${own != null ? "Global" : "Default"} (${choiceLabel(choices, value)})` };
    };
    return {
      approval: fallback("approval", APPROVAL_QUESTIONS.approval.choices, DEFAULT_APPROVAL),
      onApproval: fallback("onApproval", APPROVAL_QUESTIONS.onApproval.choices, defaultOnApproval),
      waitForChecks: fallback(
        "waitForChecks",
        APPROVAL_QUESTIONS.waitForChecks.choices,
        yesNoChoiceId(DEFAULT_WAIT_FOR_CHECKS),
      ),
      pushAfterMerge: fallback(
        "pushAfterMerge",
        APPROVAL_QUESTIONS.pushAfterMerge.choices,
        yesNoChoiceId(DEFAULT_PUSH_AFTER_MERGE),
      ),
      close: fallback("close", CLOSE_CHOICES, DEFAULT_CLOSE),
    };
  }

  // The approval, onApproval, waitForChecks and pushAfterMerge to save; only a pull request keeps waitForChecks,
  // and only a merge keeps pushAfterMerge.
  approvalToSave() {
    const { approval, onApproval, waitForChecks, pushAfterMerge } = this.chosenApproval;
    const { waitForChecksSelect, pushAfterMergeSelect } = this.fields();
    return {
      approval,
      onApproval,
      waitForChecks: waitForChecksSelect ? waitForChecks : null,
      pushAfterMerge: pushAfterMergeSelect ? pushAfterMerge : null,
    };
  }

  // A hidden waitForChecks or pushAfterMerge doesn't count as a change, though saving another change removes it.
  approvalChanged() {
    if (!this.approvalSettings) return false;
    const { waitForChecksSelect, pushAfterMergeSelect } = this.fields();
    /** @type {ApprovalKey[]} */
    const keys = [
      "approval",
      "onApproval",
      ...(waitForChecksSelect ? /** @type {ApprovalKey[]} */ (["waitForChecks"]) : []),
      ...(pushAfterMergeSelect ? /** @type {ApprovalKey[]} */ (["pushAfterMerge"]) : []),
    ];
    return keys.some((key) => this.chosenApproval[key] !== this.savedApproval[key]);
  }

  closeChanged() {
    return Boolean(this.approvalSettings) && this.chosenApproval.close !== this.savedApproval.close;
  }

  // The typed name, or null when the field is empty, so the repository's name applies.
  typedName() {
    return this.nameInput?.value().trim() || null;
  }

  nameChanged() {
    return Boolean(this.nameInput) && this.typedName() !== this.savedName;
  }

  // The typed poll interval, or null when it's empty; undefined with the problem when it can't be saved.
  typedPollSeconds() {
    try {
      return { pollSeconds: parsePollSeconds(this.repositoryInputs.pollSeconds.value()) };
    } catch (/** @type {any} */ e) {
      return { problem: String(e.message ?? e) };
    }
  }

  // Each of pollSeconds, spaceName and worktreeSetup whose field differs from the entry, as its value or null.
  repositoryChanges() {
    if (!this.repositoryInputs) return {};
    /** @type {Record<RepositoryKey, string | number | null | undefined>} */
    const typed = {
      pollSeconds: this.typedPollSeconds().pollSeconds,
      spaceName: this.repositoryInputs.spaceName.value().trim() || null,
      worktreeSetup: this.repositoryInputs.worktreeSetup.value().trim() || null,
    };
    return Object.fromEntries(
      REPOSITORY_FIELDS.filter((key) => typed[key] !== undefined && typed[key] !== this.savedRepository[key]).map(
        (key) => [key, typed[key]],
      ),
    );
  }

  pollSecondsProblem() {
    return this.repositoryInputs ? (this.typedPollSeconds().problem ?? null) : null;
  }

  // The typed prompt, trimmed, or null when the textarea is empty, so only the global prompt applies.
  typedWorkPrompt() {
    return this.workPromptInput?.value().trim() || null;
  }

  workPromptChanged() {
    return Boolean(this.workPromptInput) && this.typedWorkPrompt() !== this.savedWorkPrompt;
  }

  // The changed keys, after which they're the saved values, or null when nothing changed. A tracker not yet checked
  // or without its team, and a poll interval that can't be saved, aren't changes yet.
  /**
   * @returns {SaveRequest | null}
   */
  saveRequest() {
    if (!this.approvalSettings) return null;
    const trackerChoice = this.trackerChange();
    const approvalSettings = this.approvalToSave(),
      approvalChanged = this.approvalChanged();
    const closeChanged = this.closeChanged(),
      close = this.chosenApproval.close;
    const nameChanged = this.nameChanged(),
      name = this.typedName();
    const repositoryChanges = this.repositoryChanges(),
      agentChanges = this.agentChanges();
    const workPromptChanged = this.workPromptChanged(),
      workPrompt = this.typedWorkPrompt();
    const hasRepositoryChanges = Object.keys(repositoryChanges).length > 0,
      hasAgentChanges = Object.keys(agentChanges).length > 0;
    if (
      !trackerChoice &&
      !approvalChanged &&
      !closeChanged &&
      !nameChanged &&
      !hasRepositoryChanges &&
      !hasAgentChanges &&
      !workPromptChanged
    )
      return null;
    return {
      write: async () => {
        if (trackerChoice) await saveTrackerChoice(this.main, trackerChoice);
        if (approvalChanged)
          await saveApprovalSettings(this.main, {
            ...approvalSettings,
            waitForChecks: yesNoValue(approvalSettings.waitForChecks),
            pushAfterMerge: yesNoValue(approvalSettings.pushAfterMerge),
          });
        if (closeChanged) await saveCloseSetting(this.main, close);
        if (nameChanged) await saveNameSetting(this.main, name);
        if (hasRepositoryChanges) await saveRepositorySettings(this.main, repositoryChanges);
        if (hasAgentChanges) await saveAgentSettings(this.main, agentChanges);
        if (workPromptChanged) await saveWorkPrompt(this.main, workPrompt);
      },
      written: () => {
        if (trackerChoice)
          this.current = {
            kind: trackerChoice.tracker,
            team: trackerChoice.team,
            repo: trackerChoice.tracker === this.current.kind ? this.current.repo : undefined,
          };
        if (approvalChanged) this.savedApproval = { ...this.savedApproval, ...approvalSettings };
        if (closeChanged) this.savedApproval = { ...this.savedApproval, close };
        if (nameChanged) this.savedName = name;
        this.savedRepository = { ...this.savedRepository, ...repositoryChanges };
        this.savedAgent = { ...this.savedAgent, ...agentChanges };
        if (workPromptChanged) this.savedWorkPrompt = workPrompt;
      },
    };
  }

  fields() {
    return settingsFields({
      trackerChoice: this.tracker.choice,
      trackerReady: this.trackerReady,
      onApproval: this.chosenApproval.onApproval,
      fallbackOnApproval: this.approvalSettings ? this.approvalFallbacks().onApproval.value : null,
      workModel: this.agentValues.workModel,
      otherWorkModelPicked: this.otherWorkModelPicked,
    });
  }

  /**
   * @param {NativeElement} content
   * @param {Theme} t
   */
  form(content, t) {
    return this.sections(this.errorLine(content, t), REPOSITORY_SECTIONS, this.questionRenderer(t), t);
  }

  // The question for each setting's key, or null while it hasn't loaded or doesn't apply: waitForChecks only when
  // the onApproval that applies is a pull request, and pushAfterMerge only when it is a merge.
  /**
   * @param {Theme} t
   * @returns {(key: string) => NativeElement | null}
   */
  questionRenderer(t) {
    const fields = this.fields();
    const fallbacks = this.approvalSettings ? this.approvalFallbacks() : null;
    /** @param {ApprovalKey} key */
    const approvalQuestion = (key) => this.approvalSelect(key, APPROVAL_QUESTIONS[key].choices, fallbacks, t);
    /** @type {Record<string, () => NativeElement | null>} */
    const questions = {
      name: () =>
        this.nameInput && this.question(NAME_LABEL, t, (controls) => controls.child(this.textField(this.nameInput, t))),
      tracker: () => this.trackerSection(fields, t),
      approval: () => fallbacks && approvalQuestion("approval"),
      onApproval: () => fallbacks && approvalQuestion("onApproval"),
      waitForChecks: () => (fallbacks && fields.waitForChecksSelect ? approvalQuestion("waitForChecks") : null),
      pushAfterMerge: () => (fallbacks && fields.pushAfterMergeSelect ? approvalQuestion("pushAfterMerge") : null),
      close: () => fallbacks && this.approvalSelect("close", CLOSE_CHOICES, fallbacks, t),
      workPrompt: () =>
        this.workPromptInput &&
        this.question(WORK_PROMPT_LABEL, t, (controls) => controls.child(this.textareaField(this.workPromptInput, t))),
    };
    for (const key of REPOSITORY_FIELDS)
      questions[key] = () => this.repositoryInputs && this.repositoryQuestion(key, REPOSITORY_LABELS[key], t);
    for (const question of AGENT_QUESTIONS)
      questions[question.key] = () =>
        this.agentSources && this.agentQuestion(question, this.agentClearLabel(question.key), fields.workModelInput, t);
    return (key) => questions[key]?.() ?? null;
  }

  // A select of an approval question or close, leading with the choice that removes it from the entry
  // and opening on the entry's value or that choice.
  /**
   * @param {ApprovalChoiceKey} key
   * @param {SelectOption[]} choices
   * @param {ReturnType<RepositorySettings["approvalFallbacks"]>} fallbacks
   * @param {Theme} t
   */
  approvalSelect(key, choices, fallbacks, t) {
    const options = [{ id: CLEAR_CHOICE, label: fallbacks[key].label }, ...choices];
    return this.question(SETTING_LABELS[key], t, (controls) =>
      controls.child(
        this.selects[key].render(t, {
          options,
          value: this.chosenApproval[key] ?? CLEAR_CHOICE,
          onChoose: (id, cx) => this.chooseApproval(key, id === CLEAR_CHOICE ? null : id, cx),
        }),
      ),
    );
  }

  // What applies without the entry's model or effort.
  /**
   * @param {import("./settings-form.js").AgentKey} key
   */
  agentClearLabel(key) {
    const { topLevel } = this.agentSources[key];
    return topLevel != null ? `Global (${topLevel})` : `Default (${AGENT_DEFAULTS[key]})`;
  }

  // The tracker in use, the chosen one's check, and Linear's team once Linear is checked.
  /**
   * @param {ReturnType<RepositorySettings["fields"]>} fields
   * @param {Theme} t
   */
  trackerSection(fields, t) {
    const { choice, checking } = this.tracker;
    return this.question(
      { title: "Issue source", sentence: `Lists issues from ${currentTrackerLabel(this.current)}.` },
      t,
      (controls) =>
        this.tracker
          .withCheckStatus(
            controls.child(
              this.selects.tracker.render(t, {
                options: TRACKERS,
                value: choice ?? this.current.kind,
                onChoose: (id, cx) => this.chooseTracker(id, cx),
                enabled: !checking,
              }),
            ),
            "settings-tracker-problem",
            t,
          )
          .when(fields.teamSelect, (e) => e.child(this.tracker.teamDropdown("settings-team", t))),
    );
  }

  // A typed setting; the poll interval says below its field why it can't be saved.
  /**
   * @param {RepositoryKey} key
   * @param {SettingLabel} label
   * @param {Theme} t
   */
  repositoryQuestion(key, label, t) {
    const problem = key === "pollSeconds" ? this.pollSecondsProblem() : null;
    return this.question(label, t, (controls) =>
      controls.child(this.textField(this.repositoryInputs[key], t)).when(Boolean(problem), (e) =>
        e.child(
          div()
            .whitespace_normal()
            .text_size(12)
            .text_color(t.ansi1)
            .child(problem ?? ""),
        ),
      ),
    );
  }
}
