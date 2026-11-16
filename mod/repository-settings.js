// The focused repository's settings, a form of the settings view (settings.js), whose fields show only when they
// apply to the choices above them (settings-fields.js): the name of the space on its main checkout, its name,
// typed in with the default as placeholder, where emptying the field removes it from the entry; where its issues
// live, its tracker, which a different choice checks as the setup view does (tracker-choice.js) before it can be
// saved, with Linear's team once Linear is checked; whether a session asks for approval before its work lands,
// its approval; how the branch then gets into main, its onApproval; only when the onApproval that applies is a
// pull request, whether the session waits for its checks, its waitForChecks; what a finished session does about
// its worktree, its close, each of these leading with a choice that removes it from the entry, labeled with what
// applies in its place, such as "Global (Open a pull request)" or "Default (Ask me)", where the default onApproval
// is a pull request for an origin on GitHub; the command run in each new worktree, its
// worktreeSetup; the name of each issue's space, its
// spaceName; how often the panel polls its tracker, its pollSeconds, which must be a whole number of at least 10
// seconds before it can be saved; then the model and effort of the sessions that work its issues, its workModel
// and workEffort, whose choice that removes them from the entry is labeled with the global value, such as
// "Global (opus)", or the default; and last the text appended to those sessions' system prompt after the global
// prompt, its workPrompt, in a soft-wrapped textarea several rows tall, where emptying it removes it from the
// entry. Each of worktreeSetup, spaceName and pollSeconds is typed in as name is, with what applies without it as
// the placeholder, naming the global value where one is set. It opens on the entry's own settings, with each
// select the entry doesn't set on its choice that removes it; an entry's retired merge and complete show as the
// approval, onApproval and waitForChecks they mean. Save
// waits for a different tracker's check to pass and, for Linear, a team, and writes only the changed keys
// (saveTrackerChoice, saveLandingSettings, saveCloseSetting, saveNameSetting, saveRepositorySettings,
// saveAgentSettings and saveWorkPrompt in setting.js).
import { div } from "gpui-kit";
import { InputState, TextareaState } from "gpui-base";
import { LANDING_QUESTIONS } from "./setup.js";
import { SelectMenu } from "./select.js";
import { CLEAR_CHOICE, checksChoiceId, settingsFields, waitForChecksOf } from "./settings-fields.js";
import { AGENT_QUESTIONS, CLOSE_CHOICES, CLOSE_SENTENCE, SettingsForm, WORK_PROMPT_ROWS } from "./settings-form.js";
import { TrackerChoice, TRACKERS } from "./tracker-choice.js";
import {
  AGENT_DEFAULTS, DEFAULT_APPROVAL, DEFAULT_CLOSE, DEFAULT_POLL_SECONDS, DEFAULT_WAIT_FOR_CHECKS, REPOSITORY_KEYS,
  agentSettings, landingSources, nameSettings, parsePollSeconds, repositorySettings,
  saveAgentSettings, saveCloseSetting, saveLandingSettings, saveNameSetting, saveRepositorySettings, saveTrackerChoice,
  saveWorkPrompt, workPromptSettings,
} from "./trackers/setting.js";

const TEAM_PICKS = "issues.settingsTeams";

const choiceLabel = (choices, id) => choices.find((choice) => choice.id === id)?.label;

const NAME_SENTENCE = "The name of the space opened on the main checkout, which issue worktree spaces nest under. Leave it empty to use the repository's name.";

const REPOSITORY_QUESTIONS = [
  { key: "worktreeSetup", title: "Worktree setup command", sentence: "A shell command run in each new issue worktree, such as npm install. Leave it empty to run nothing." },
  { key: "spaceName", title: "Issue space name", sentence: "The name of each issue's worktree space, where <issueId> is the issue's ID and <repo> the repository's name. Leave it empty to use the global name, or the issue's ID without one." },
  { key: "pollSeconds", title: "Poll interval", sentence: "How often, in whole seconds of 10 or more, the panel asks the tracker for this repository's issues. Leave it empty to use the global interval or the default." },
];

const WORK_PROMPT_SENTENCE = "Instructions appended after the global prompt, if any, to the system prompt of every Claude session that works one of this repository's issues. Leave it empty to use only the global prompt.";

// Where the listed issues come from now, such as "Linear team WEB".
function currentTrackerLabel({ kind, team, repo }) {
  if (kind === "linear") return `Linear team ${team}`;
  if (kind === "github") return repo ? `GitHub Issues in ${repo}` : "GitHub Issues";
  return "Beads";
}

export class RepositorySettings extends SettingsForm {
  // project: the focused { root, on }; main: its repository's main checkout; current: the tracker the panel lists,
  // { kind, team?, repo? }.
  constructor(project, main, current, { onSaved }) {
    super({ onSaved });
    this.project = project; this.main = main; this.current = current;
    this.trackerReady = false;
    this.tracker = new TrackerChoice(main, {
      picks: TEAM_PICKS,
      onReady: (_none, cx) => { this.trackerReady = true; cx.notify(); },
      onTeam: () => {},
    });
    // The entry's own approval, onApproval, waitForChecks and close, as their selects' ids, and the chosen ones.
    this.landing = null; this.savedLanding = null; this.chosenLanding = {};
    this.savedName = null; this.nameInput = null;
    this.savedRepository = null; this.repositoryInputs = null;
    this.agentSources = null;
    this.savedWorkPrompt = null; this.workPromptInput = null;
    this.selects = null;
  }

  load(cx) {
    this.selects = {
      tracker: new SelectMenu("settings-tracker", "Issue tracker", cx),
      ...Object.fromEntries(Object.entries(LANDING_QUESTIONS).map(([key, { title }]) => [key, new SelectMenu(`settings-${key}`, title, cx)])),
      close: new SelectMenu("settings-close", "How are worktrees closed?", cx),
      ...this.agentSelects("settings", cx),
    };
    cx.spawn(async (cx) => {
      try {
        const [landing, name, repository, agent, workPrompt] = await Promise.all([
          landingSources(this.project), nameSettings(this.project),
          repositorySettings(this.project), agentSettings(this.project), workPromptSettings(this.project),
        ]);
        this.landing = landing;
        this.savedLanding = { ...landing.entry, waitForChecks: checksChoiceId(landing.entry.waitForChecks) };
        this.chosenLanding = { ...this.savedLanding };
        this.savedName = name.entry;
        this.nameInput = InputState.new({ placeholder: name.defaultName, value: name.entry ?? "" });
        this.nameInput.on("change", (_e, cx) => { this.error = null; cx.notify(); });
        this.nameInput.on("submit", (_e, cx) => this.save(cx));
        this.savedRepository = repository;
        this.repositoryInputs = this.newRepositoryInputs(repository);
        this.agentSources = agent;
        this.openAgent(Object.fromEntries(Object.entries(agent).map(([key, { entry }]) => [key, entry])));
        this.savedWorkPrompt = workPrompt.entry;
        this.workPromptInput = TextareaState.new({ placeholder: "No prompt for this repository", value: workPrompt.entry ?? "", rows: WORK_PROMPT_ROWS });
        this.workPromptInput.set_soft_wrap(true);
        this.workPromptInput.on("change", (_e, cx) => { this.error = null; cx.notify(); });
      } catch (e) { this.error = String(e.message ?? e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  // A field for each of pollSeconds, spaceName and worktreeSetup, opening on the entry's value, with what applies
  // without it as the placeholder.
  newRepositoryInputs(repository) {
    const placeholders = {
      pollSeconds: repository.topLevelPollSeconds != null ? `Global (${repository.topLevelPollSeconds})` : String(DEFAULT_POLL_SECONDS),
      spaceName: repository.topLevelSpaceName != null ? `Global (${repository.topLevelSpaceName})` : "<issueId>",
      worktreeSetup: "No command",
    };
    return Object.fromEntries(REPOSITORY_KEYS.map((key) => {
      const input = InputState.new({ placeholder: placeholders[key], value: repository[key] == null ? "" : String(repository[key]) });
      input.on("change", (_e, cx) => { this.error = null; cx.notify(); });
      input.on("submit", (_e, cx) => this.save(cx));
      return [key, input];
    }));
  }

  // Choosing the current GitHub or Beads tracker again undoes a change; Linear's is checked again to change its team.
  chooseTracker(choice, cx) {
    Object.assign(this, { trackerReady: false, error: null });
    if (choice === this.current.kind && choice !== "linear") { this.tracker.reset(); cx.notify(); return; }
    this.tracker.choose(choice, cx);
    if (choice === this.current.kind) this.tracker.team = this.current.team;
  }

  takePickedTeam(cx) {
    this.tracker.takePickedTeam(cx);
  }

  // The tracker to save, or null when it stays as it is.
  trackerChange() {
    const { choice, team } = this.tracker;
    if (!choice || !this.trackerReady) return null;
    if (choice === "linear") return team && (this.current.kind !== "linear" || team !== this.current.team) ? { tracker: choice, team } : null;
    return choice === this.current.kind ? null : { tracker: choice };
  }

  // A tracker that is chosen but not yet checked, or Linear without a team, holds back Save.
  trackerPending() {
    const { choice, team, checking } = this.tracker;
    return Boolean(choice) && (checking || !this.trackerReady || (choice === "linear" && !team));
  }

  // `value` for approval, onApproval, waitForChecks or close, or null to remove it from the entry.
  chooseLanding(key, value, cx) {
    this.chosenLanding = { ...this.chosenLanding, [key]: value };
    this.error = null;
    cx.notify();
  }

  // The approval, onApproval, waitForChecks and close that apply without the entry's own, each { value, label },
  // where label names whether that's the global value or the default.
  landingFallbacks() {
    const { topLevel, defaultOnApproval } = this.landing;
    const fallback = (key, choices, defaultValue) => {
      const own = key === "waitForChecks" ? checksChoiceId(topLevel[key]) : topLevel[key];
      const value = own ?? defaultValue;
      return { value, label: `${own != null ? "Global" : "Default"} (${choiceLabel(choices, value)})` };
    };
    return {
      approval: fallback("approval", LANDING_QUESTIONS.approval.choices, DEFAULT_APPROVAL),
      onApproval: fallback("onApproval", LANDING_QUESTIONS.onApproval.choices, defaultOnApproval),
      waitForChecks: fallback("waitForChecks", LANDING_QUESTIONS.waitForChecks.choices, checksChoiceId(DEFAULT_WAIT_FOR_CHECKS)),
      close: fallback("close", CLOSE_CHOICES, DEFAULT_CLOSE),
    };
  }

  // The approval, onApproval and waitForChecks to save; only a pull request keeps waitForChecks.
  landingToSave() {
    const { approval, onApproval, waitForChecks } = this.chosenLanding;
    return { approval, onApproval, waitForChecks: this.fields().waitForChecksSelect ? waitForChecks : null };
  }

  // A hidden waitForChecks doesn't count as a change, though saving another change removes it.
  landingChanged() {
    if (!this.landing) return false;
    const keys = ["approval", "onApproval", ...(this.fields().waitForChecksSelect ? ["waitForChecks"] : [])];
    return keys.some((key) => this.chosenLanding[key] !== this.savedLanding[key]);
  }

  closeChanged() {
    return Boolean(this.landing) && this.chosenLanding.close !== this.savedLanding.close;
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
    try { return { pollSeconds: parsePollSeconds(this.repositoryInputs.pollSeconds.value()) }; }
    catch (e) { return { problem: String(e.message ?? e) }; }
  }

  // Each of pollSeconds, spaceName and worktreeSetup whose field differs from the entry, as its value or null.
  repositoryChanges() {
    if (!this.repositoryInputs) return {};
    const typed = {
      pollSeconds: this.typedPollSeconds().pollSeconds,
      spaceName: this.repositoryInputs.spaceName.value().trim() || null,
      worktreeSetup: this.repositoryInputs.worktreeSetup.value().trim() || null,
    };
    return Object.fromEntries(REPOSITORY_KEYS
      .filter((key) => typed[key] !== undefined && typed[key] !== this.savedRepository[key])
      .map((key) => [key, typed[key]]));
  }

  pollSecondsProblem() {
    return this.repositoryInputs ? this.typedPollSeconds().problem ?? null : null;
  }

  // The typed prompt, trimmed, or null when the textarea is empty, so only the global prompt applies.
  typedWorkPrompt() {
    return this.workPromptInput?.value().trim() || null;
  }

  workPromptChanged() {
    return Boolean(this.workPromptInput) && this.typedWorkPrompt() !== this.savedWorkPrompt;
  }

  changed() {
    return Boolean(this.trackerChange()) || this.landingChanged() || this.closeChanged() || this.nameChanged()
      || Object.keys(this.repositoryChanges()).length > 0 || Object.keys(this.agentChanges()).length > 0
      || this.workPromptChanged();
  }

  canSave() {
    return !this.saving && !this.trackerPending() && !this.pollSecondsProblem() && this.changed();
  }

  save(cx) {
    if (!this.canSave()) return;
    const trackerChoice = this.trackerChange();
    const landing = this.landingToSave();
    const landingChoice = this.landingChanged() ? { ...landing, waitForChecks: waitForChecksOf(landing.waitForChecks) } : null;
    const closeChanged = this.closeChanged(), close = this.chosenLanding.close;
    const nameChanged = this.nameChanged(), name = this.typedName();
    const repositoryChanges = this.repositoryChanges(), agentChanges = this.agentChanges();
    const workPromptChanged = this.workPromptChanged(), workPrompt = this.typedWorkPrompt();
    this.runSave(cx, async () => {
      if (trackerChoice) await saveTrackerChoice(this.main, trackerChoice);
      if (landingChoice) await saveLandingSettings(this.main, landingChoice);
      if (closeChanged) await saveCloseSetting(this.main, close);
      if (nameChanged) await saveNameSetting(this.main, name);
      if (Object.keys(repositoryChanges).length > 0) await saveRepositorySettings(this.main, repositoryChanges);
      if (Object.keys(agentChanges).length > 0) await saveAgentSettings(this.main, agentChanges);
      if (workPromptChanged) await saveWorkPrompt(this.main, workPrompt);
    });
  }

  fields() {
    return settingsFields({
      trackerChoice: this.tracker.choice, trackerReady: this.trackerReady, onApproval: this.chosenLanding.onApproval,
      fallbackOnApproval: this.landing ? this.landingFallbacks().onApproval.value : null, workModel: this.agentValues.workModel, otherWorkModelPicked: this.otherWorkModelPicked,
    });
  }

  form(content, t) {
    const fields = this.fields();
    return this.saveRow(content
      .when(Boolean(this.nameInput), (e) => e.child(this.question("Repository name", NAME_SENTENCE, t,
        (controls) => controls.child(this.textField(this.nameInput, t)))))
      .child(this.trackerSection(fields, t))
      .when(Boolean(this.landing), (e) => this.landingQuestions(e, fields, t))
      .when(Boolean(this.repositoryInputs), (e) => e.children(REPOSITORY_QUESTIONS.map((question) => this.repositoryQuestion(question, t))))
      .when(Boolean(this.agentSources), (e) => e.children(AGENT_QUESTIONS.map((question) =>
        this.agentQuestion(question, this.agentClearLabel(question.key), fields.workModelInput, t))))
      .when(Boolean(this.workPromptInput), (e) => e.child(this.question("Work prompt", WORK_PROMPT_SENTENCE, t,
        (controls) => controls.child(this.textareaField(this.workPromptInput, t))))), "settings-save", t);
  }

  // The approval, onApproval, waitForChecks and close selects, waitForChecks only when the onApproval that applies
  // is a pull request.
  landingQuestions(content, fields, t) {
    const fallbacks = this.landingFallbacks();
    const landingQuestion = (key) => {
      const { title, sentence, choices } = LANDING_QUESTIONS[key];
      return this.landingSelect(key, title, sentence, choices, fallbacks, t);
    };
    return content
      .child(landingQuestion("approval"))
      .child(landingQuestion("onApproval"))
      .when(fields.waitForChecksSelect, (e) => e.child(landingQuestion("waitForChecks")))
      .child(this.landingSelect("close", "How are worktrees closed?", CLOSE_SENTENCE, CLOSE_CHOICES, fallbacks, t));
  }

  // A select of approval, onApproval, waitForChecks or close, leading with the choice that removes it from the entry
  // and opening on the entry's value or that choice.
  landingSelect(key, title, sentence, choices, fallbacks, t) {
    const options = [{ id: CLEAR_CHOICE, label: fallbacks[key].label }, ...choices];
    return this.question(title, sentence, t, (controls) => controls
      .child(this.selects[key].render(t, { options, value: this.chosenLanding[key] ?? CLEAR_CHOICE, enabled: !this.saving,
        onChoose: (id, cx) => this.chooseLanding(key, id === CLEAR_CHOICE ? null : id, cx) })));
  }

  // What applies without the entry's model or effort.
  agentClearLabel(key) {
    const { topLevel } = this.agentSources[key];
    return topLevel != null ? `Global (${topLevel})` : `Default (${AGENT_DEFAULTS[key]})`;
  }

  // The tracker in use, the chosen one's check, and Linear's team once Linear is checked.
  trackerSection(fields, t) {
    const { choice, checking } = this.tracker;
    return this.question("Where do this repository's issues live?", `The panel lists issues from ${currentTrackerLabel(this.current)}.`, t, (controls) =>
      this.tracker.withCheckStatus(controls
        .child(this.selects.tracker.render(t, { options: TRACKERS, value: choice ?? this.current.kind, onChoose: (id, cx) => this.chooseTracker(id, cx), enabled: !this.saving && !checking })),
      "settings-tracker-problem", t)
        .when(fields.teamSelect, (e) => e.child(this.tracker.teamDropdown("settings-team", t))));
  }

  // A typed setting; the poll interval says below its field why it can't be saved.
  repositoryQuestion({ key, title, sentence }, t) {
    const problem = key === "pollSeconds" ? this.pollSecondsProblem() : null;
    return this.question(title, sentence, t, (controls) => controls
      .child(this.textField(this.repositoryInputs[key], t))
      .when(Boolean(problem), (e) => e.child(div().whitespace_normal().text_size(12).text_color(t.ansi1).child(problem ?? ""))));
  }
}
