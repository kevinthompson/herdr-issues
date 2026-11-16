// The focused repository's settings, a form of the settings view (settings.js), whose fields show only when they
// apply to the choices above them (settings-fields.js): the name of the space on its main checkout, its name,
// typed in with the default as placeholder, where emptying the field removes it from the entry; where its issues
// live, its tracker, which a different choice checks as the setup view does (tracker-choice.js) before it can be
// saved, with Linear's team once Linear is checked; how its work gets into main, and, only for a pull request,
// when the work is complete, its merge and complete in issues.json; what a finished session does about its
// worktree, its close; the command run in each new worktree, its worktreeSetup; the name of each issue's space, its
// spaceName; how often the panel polls its tracker, its pollSeconds, which must be a whole number of at least 10
// seconds before it can be saved; then the model and effort of the sessions that work its issues, its workModel
// and workEffort, whose choice that removes them from the entry is labeled with the global value, such as
// "Global (opus)", or the default; and last the text appended to those sessions' system prompt after the global
// prompt, its workPrompt, in a soft-wrapped textarea several rows tall, where emptying it removes it from the
// entry. Each of worktreeSetup, spaceName and pollSeconds is typed in as name is, with what applies without it as
// the placeholder, naming the global value where one is set. It opens on the settings in effect, the global
// values and defaults applied, as `issues setting` prints them. Save
// waits for a different tracker's check to pass and, for Linear, a team, and writes only the changed keys
// (saveTrackerChoice, saveMergeSettings, saveCloseSetting, saveNameSetting, saveRepositorySettings,
// saveAgentSettings and saveWorkPrompt in setting.js).
import { div } from "gpui-kit";
import { InputState, TextareaState } from "gpui-base";
import { MERGE_CHOICES } from "./setup.js";
import { SelectMenu } from "./select.js";
import { settingsFields } from "./settings-fields.js";
import {
  AGENT_QUESTIONS, CLOSE_CHOICES, CLOSE_SENTENCE, COMPLETE_CHOICES, COMPLETE_SENTENCE, COMPLETE_WITHOUT_PULL_REQUEST,
  SettingsForm, WORK_PROMPT_ROWS,
} from "./settings-form.js";
import { TrackerChoice, TRACKERS } from "./tracker-choice.js";
import {
  AGENT_DEFAULTS, DEFAULT_POLL_SECONDS, DEFAULT_PULL_REQUEST_COMPLETE, REPOSITORY_KEYS,
  agentSettings, closeSettings, mergeSettings, nameSettings, parsePollSeconds, repositorySettings,
  saveAgentSettings, saveCloseSetting, saveMergeSettings, saveNameSetting, saveRepositorySettings, saveTrackerChoice,
  saveWorkPrompt, workPromptSettings,
} from "./trackers/setting.js";

const TEAM_PICKS = "issues.settingsTeams";

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
      onTeam: (cx) => cx.notify(),
    });
    this.saved = null; this.merge = null; this.complete = null;
    this.savedClose = null; this.close = null;
    this.savedName = null; this.nameInput = null;
    this.savedRepository = null; this.repositoryInputs = null;
    this.agentSources = null;
    this.savedWorkPrompt = null; this.workPromptInput = null;
    this.selects = null;
  }

  load(cx) {
    this.selects = {
      tracker: new SelectMenu("settings-tracker", "Issue tracker", cx),
      merge: new SelectMenu("settings-merge", "How work gets into main", cx),
      complete: new SelectMenu("settings-complete", "When the work is complete", cx),
      close: new SelectMenu("settings-close", "When the work is complete, close the worktree?", cx),
      ...this.agentSelects("settings", cx),
    };
    cx.spawn(async (cx) => {
      try {
        const [merge, { close }, name, repository, agent, workPrompt] = await Promise.all([
          mergeSettings(this.project), closeSettings(this.project), nameSettings(this.project),
          repositorySettings(this.project), agentSettings(this.project), workPromptSettings(this.project),
        ]);
        this.saved = merge; Object.assign(this, merge);
        this.savedClose = close; this.close = close;
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

  // A pull request completes as it was saved, or as its default; anything else completes once merged.
  chooseMerge(merge, cx) {
    const savedPullRequestComplete = this.saved?.merge === "pull-request" ? this.saved.complete : DEFAULT_PULL_REQUEST_COMPLETE;
    Object.assign(this, { merge, complete: merge === "pull-request" ? savedPullRequestComplete : "merged", error: null });
    cx.notify();
  }

  chooseComplete(complete, cx) {
    Object.assign(this, { complete, error: null });
    cx.notify();
  }

  chooseClose(close, cx) {
    Object.assign(this, { close, error: null });
    cx.notify();
  }

  mergeChanged() {
    return Boolean(this.merge) && (this.merge !== this.saved?.merge || this.complete !== this.saved?.complete);
  }

  closeChanged() {
    return Boolean(this.close) && this.close !== this.savedClose;
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
    return Boolean(this.trackerChange()) || this.mergeChanged() || this.closeChanged() || this.nameChanged()
      || Object.keys(this.repositoryChanges()).length > 0 || Object.keys(this.agentChanges()).length > 0
      || this.workPromptChanged();
  }

  canSave() {
    return !this.saving && !this.trackerPending() && !this.pollSecondsProblem() && this.changed();
  }

  save(cx) {
    if (!this.canSave()) return;
    const trackerChoice = this.trackerChange();
    const mergeChoice = this.mergeChanged() ? { merge: this.merge, complete: this.merge === "pull-request" ? this.complete : null } : null;
    const closeChoice = this.closeChanged() ? this.close : null;
    const nameChanged = this.nameChanged(), name = this.typedName();
    const repositoryChanges = this.repositoryChanges(), agentChanges = this.agentChanges();
    const workPromptChanged = this.workPromptChanged(), workPrompt = this.typedWorkPrompt();
    this.runSave(cx, async () => {
      if (trackerChoice) await saveTrackerChoice(this.main, trackerChoice);
      if (mergeChoice) await saveMergeSettings(this.main, mergeChoice);
      if (closeChoice) await saveCloseSetting(this.main, closeChoice);
      if (nameChanged) await saveNameSetting(this.main, name);
      if (Object.keys(repositoryChanges).length > 0) await saveRepositorySettings(this.main, repositoryChanges);
      if (Object.keys(agentChanges).length > 0) await saveAgentSettings(this.main, agentChanges);
      if (workPromptChanged) await saveWorkPrompt(this.main, workPrompt);
    });
  }

  fields() {
    return settingsFields({
      trackerChoice: this.tracker.choice, trackerReady: this.trackerReady, merge: this.merge,
      workModel: this.agentValues.workModel, otherWorkModelPicked: this.otherWorkModelPicked,
    });
  }

  form(content, t) {
    const fields = this.fields();
    return this.saveRow(content
      .when(Boolean(this.nameInput), (e) => e.child(this.question("Repository name", NAME_SENTENCE, t,
        (controls) => controls.child(this.textField(this.nameInput, t)))))
      .child(this.trackerSection(fields, t))
      .child(this.question("How does work get into main?", null, t, (controls) => controls
        .child(this.selects.merge.render(t, { options: MERGE_CHOICES, value: this.merge, onChoose: (id, cx) => this.chooseMerge(id, cx), enabled: !this.saving }))
        .when(fields.mergedNote, (e) => e.child(this.note(COMPLETE_WITHOUT_PULL_REQUEST, t)))))
      .when(fields.completeSelect, (e) => e.child(this.question("When is the work complete?", COMPLETE_SENTENCE, t, (controls) => controls
        .child(this.selects.complete.render(t, { options: COMPLETE_CHOICES, value: this.complete, onChoose: (id, cx) => this.chooseComplete(id, cx), enabled: !this.saving })))))
      .child(this.question("When the work is complete, close the worktree?", CLOSE_SENTENCE, t, (controls) => controls
        .child(this.selects.close.render(t, { options: CLOSE_CHOICES, value: this.close, onChoose: (id, cx) => this.chooseClose(id, cx), enabled: !this.saving }))))
      .when(Boolean(this.repositoryInputs), (e) => e.children(REPOSITORY_QUESTIONS.map((question) => this.repositoryQuestion(question, t))))
      .when(Boolean(this.agentSources), (e) => e.children(AGENT_QUESTIONS.map((question) =>
        this.agentQuestion(question, this.agentClearLabel(question.key), fields.workModelInput, t))))
      .when(Boolean(this.workPromptInput), (e) => e.child(this.question("Work prompt", WORK_PROMPT_SENTENCE, t,
        (controls) => controls.child(this.textareaField(this.workPromptInput, t))))), "settings-save", t);
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
