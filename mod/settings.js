// The focused repository's settings, which the gear in the panel's header opens in place of the list, with Back
// at the top left as the setup view (setup.js) has. Each setting is a select menu (select.js) whose open list says
// what each option means, a field shows only when it applies to the choices above it (settings-fields.js), and
// each setting's description sits below its controls: the name of the space on its main checkout, its name, typed
// in with the default as placeholder, where emptying the field removes it from the entry; where its issues live,
// its tracker, which a different choice checks as the setup view does (tracker-choice.js) before it can be saved,
// with Linear's team once Linear is checked; how its work gets into main, and, only for a pull request, when the
// work is complete, its merge and complete in issues.json; what a finished session does about its worktree, its
// close; the command run in each new worktree, its worktreeSetup; the name of each issue's space, its spaceName;
// how often the panel polls its tracker, its pollSeconds, which must be a whole number of at least 10 seconds before
// it can be saved; then the model and effort of the sessions that work its issues, its workModel and workEffort;
// and last the text appended to those sessions' system prompt, its workPrompt, in a soft-wrapped textarea several
// rows tall with the top level's prompt, if any, as placeholder, where emptying it removes it from the entry.
// Each of worktreeSetup, spaceName and pollSeconds is typed in as name is, with what applies without it as the
// placeholder. It opens on the settings in effect, defaults applied, as `issues setting` prints them. Each model and effort offers its allowed values and a choice that removes
// it from the entry, so issues.json's top level or the default applies; workModel's Other takes another model alias
// or full name typed in. Save waits for a different tracker's check to pass and, for Linear, a team, writes only the
// changed keys (saveTrackerChoice, saveMergeSettings, saveCloseSetting, saveNameSetting, saveRepositorySettings,
// saveAgentSettings and saveWorkPrompt in setting.js) and goes
// back to the list; a failed save shows its error and stays. Back writes nothing.
import { div } from "gpui-kit";
import { v_flex, h_flex, Input, InputState, Textarea, TextareaState } from "gpui-base";
import { button, collapseButton } from "./detail.js";
import { MERGE_CHOICES } from "./setup.js";
import { SelectMenu } from "./select.js";
import { CLEAR_CHOICE, OTHER_WORK_MODEL, isTypedWorkModel, settingsFields, workModelChoice } from "./settings-fields.js";
import { TrackerChoice, TRACKERS } from "./tracker-choice.js";
import {
  AGENT_DEFAULTS, DEFAULT_POLL_SECONDS, EFFORTS, REPOSITORY_KEYS, SUGGESTED_WORK_MODELS,
  agentSettings, closeSettings, mergeSettings, nameSettings, parsePollSeconds, repositorySettings,
  saveAgentSettings, saveCloseSetting, saveMergeSettings, saveNameSetting, saveRepositorySettings, saveTrackerChoice,
  saveWorkPrompt, workPromptSettings,
} from "./trackers/setting.js";

const TEAM_PICKS = "issues.settingsTeams";

const COMPLETE_CHOICES = [
  { id: "pull-request-open", label: "Once the pull request is open", detail: "Once the branch is pushed with an open pull request, without waiting for its checks." },
  { id: "pull-request-passing", label: "Once its checks pass", detail: "Once the pull request is open and its checks pass, while it waits for review." },
  { id: "merged", label: "Once it merges", detail: "Once the branch is in main." },
];
const COMPLETE_SENTENCE = "When a session can finish and the issue's worktree is safe to close.";
const COMPLETE_WITHOUT_PULL_REQUEST = "Without a pull request, the work is complete once its branch is in main.";
const DEFAULT_COMPLETE = "pull-request-open";

const CLOSE_CHOICES = [
  { id: "ask", label: "Ask me", detail: "The session asks whether to close its worktree, and closes it if you say yes." },
  { id: "auto", label: "Close it", detail: "The session closes its worktree without asking." },
  { id: "manual", label: "I'll close it", detail: "The session tells you to close the worktree with cmd+shift+w." },
];
const CLOSE_SENTENCE = "What a finished session does about its worktree. A worktree that might lose work, or that has other spaces nested under it, always shows the removal dialog first.";
const NAME_SENTENCE = "The name of the space opened on the main checkout, which issue worktree spaces nest under. Leave it empty to use the repository's name.";

const REPOSITORY_QUESTIONS = [
  { key: "worktreeSetup", title: "Worktree setup command", sentence: "A shell command run in each new issue worktree, such as npm install. Leave it empty to run nothing." },
  { key: "spaceName", title: "Issue space name", sentence: "The name of each issue's worktree space, where <issueId> is the issue's ID and <repo> the repository's name. Leave it empty to name spaces after the issue's ID." },
  { key: "pollSeconds", title: "Poll interval", sentence: "How often, in whole seconds of 10 or more, the panel asks the tracker for this repository's issues. Leave it empty to use the top level's interval or the default." },
];

const AGENT_QUESTIONS = [
  { key: "workModel", title: "Issue sessions' model", sentence: "The model of the Claude sessions Start and Continue open to work an issue. inherit uses your own Claude Code model.", choices: SUGGESTED_WORK_MODELS },
  { key: "workEffort", title: "Issue sessions' effort", sentence: null, choices: EFFORTS },
];
const WORK_PROMPT_SENTENCE = "Instructions appended to the system prompt of every Claude session that works one of this repository's issues. Leave it empty to use the top level's prompt, if any.";
const WORK_PROMPT_ROWS = 6;
const OTHER_WORK_MODEL_OPTION ={ id: OTHER_WORK_MODEL, label: "Other…", detail: "Another model alias or full name, typed in." };

// Where the listed issues come from now, such as "Linear team WEB".
function currentTrackerLabel({ kind, team, repo }) {
  if (kind === "linear") return `Linear team ${team}`;
  if (kind === "github") return repo ? `GitHub Issues in ${repo}` : "GitHub Issues";
  return "Beads";
}

export class SettingsView {
  // project: the focused { root, on }; main: its repository's main checkout; current: the tracker the panel lists,
  // { kind, team?, repo? }. onSaved(cx) runs once the changes are written.
  constructor(project, main, current, { onBack, onSaved }) {
    this.project = project; this.main = main; this.current = current; this.onBack = onBack; this.onSaved = onSaved;
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
    this.savedAgent = null; this.agentEntry = {}; this.otherWorkModelPicked = false;
    this.savedWorkPrompt = null; this.workPromptInput = null;
    this.selects = null;
    this.loading = true; this.saving = false; this.error = null;
    this.workModelInput = InputState.new({ placeholder: "Another model alias or full name" });
    this.workModelInput.on("change", (_e, cx) => this.typeWorkModel(this.workModelInput.value().trim(), cx));
    this.workModelInput.on("submit", (_e, cx) => this.save(cx));
  }

  load(cx) {
    this.selects = {
      tracker: new SelectMenu("settings-tracker", "Issue tracker", cx),
      merge: new SelectMenu("settings-merge", "How work gets into main", cx),
      complete: new SelectMenu("settings-complete", "When the work is complete", cx),
      close: new SelectMenu("settings-close", "When the work is complete, close the worktree?", cx),
      ...Object.fromEntries(AGENT_QUESTIONS.map(({ key, title }) => [key, new SelectMenu(`settings-${key}`, title, cx)])),
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
        this.savedAgent = agent;
        this.agentEntry = Object.fromEntries(Object.entries(agent).map(([key, { entry }]) => [key, entry]));
        if (isTypedWorkModel(this.agentEntry.workModel)) this.workModelInput.set_value(this.agentEntry.workModel);
        this.savedWorkPrompt = workPrompt.entry;
        this.workPromptInput = TextareaState.new({ placeholder: workPrompt.topLevel ?? "No prompt", value: workPrompt.entry ?? "", rows: WORK_PROMPT_ROWS });
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
      pollSeconds: String(repository.topLevelPollSeconds ?? DEFAULT_POLL_SECONDS),
      spaceName: "<issueId>",
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
    const savedPullRequestComplete = this.saved?.merge === "pull-request" ? this.saved.complete : DEFAULT_COMPLETE;
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

  // The entry's value for `key`, or null to remove it. workModel's Other keeps the entry until a model is typed;
  // a listed model clears the typed one.
  chooseAgent(key, value, cx) {
    if (key === "workModel") {
      this.otherWorkModelPicked = value === OTHER_WORK_MODEL;
      if (!this.otherWorkModelPicked && isTypedWorkModel(this.workModelInput.value().trim())) this.workModelInput.set_value("");
    }
    if (value !== OTHER_WORK_MODEL) this.agentEntry = { ...this.agentEntry, [key]: value };
    this.error = null;
    cx.notify();
  }

  // Emptying the field of a typed model removes workModel from the entry.
  typeWorkModel(text, cx) {
    if (text) this.agentEntry = { ...this.agentEntry, workModel: text };
    else if (isTypedWorkModel(this.agentEntry.workModel)) this.agentEntry = { ...this.agentEntry, workModel: null };
    this.error = null;
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

  agentChanges() {
    return Object.fromEntries(Object.keys(AGENT_DEFAULTS)
      .filter((key) => this.savedAgent && (this.agentEntry[key] ?? null) !== this.savedAgent[key].entry)
      .map((key) => [key, this.agentEntry[key] ?? null]));
  }

  // The typed prompt, trimmed, or null when the textarea is empty, so the top level's prompt applies.
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
    Object.assign(this, { saving: true, error: null });
    cx.spawn(async (cx) => {
      try {
        if (trackerChoice) await saveTrackerChoice(this.main, trackerChoice);
        if (mergeChoice) await saveMergeSettings(this.main, mergeChoice);
        if (closeChoice) await saveCloseSetting(this.main, closeChoice);
        if (nameChanged) await saveNameSetting(this.main, name);
        if (Object.keys(repositoryChanges).length > 0) await saveRepositorySettings(this.main, repositoryChanges);
        if (Object.keys(agentChanges).length > 0) await saveAgentSettings(this.main, agentChanges);
        if (workPromptChanged) await saveWorkPrompt(this.main, workPrompt);
        this.onSaved(cx);
      } catch (e) { this.error = `Could not save: ${e.message ?? e}`; }
      finally { this.saving = false; cx.notify(); }
    });
    cx.notify();
  }

  fields() {
    return settingsFields({
      trackerChoice: this.tracker.choice, trackerReady: this.trackerReady, merge: this.merge,
      workModel: this.agentEntry.workModel, otherWorkModelPicked: this.otherWorkModelPicked,
    });
  }

  render(t, { onCollapse }) {
    const content = v_flex().id("issues-settings").flex_1().min_h(0).overflow_y_scrollbar().p(14).gap(12);
    return v_flex().size_full().min_h(0).child(this.bar(t, onCollapse)).child(this.loading
      ? content.child(div().text_size(12).text_color(t.dim).child("Loading…"))
      : this.form(content, t));
  }

  bar(t, onCollapse) {
    return h_flex().h(42).flex_none().px(10).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().id("settings-back").flex_none().h(26).px(8).flex().items_center().rounded(7)
        .text_color(this.saving ? t.dim : t.muted)
        .when(!this.saving, (b) => b.cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => this.onBack(cx)))
        .child("‹ Back"))
      .child(div().flex_1())
      .child(div().px(4).text_size(12).text_color(t.dim).child("Settings"))
      .child(collapseButton(onCollapse, t));
  }

  form(content, t) {
    const fields = this.fields();
    return content
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
      .when(Boolean(this.savedAgent), (e) => e.children(AGENT_QUESTIONS.map((question) => this.agentQuestion(question, fields, t))))
      .when(Boolean(this.workPromptInput), (e) => e.child(this.question("Work prompt", WORK_PROMPT_SENTENCE, t,
        (controls) => controls.child(this.textareaField(this.workPromptInput, t)))))
      .when(Boolean(this.error), (e) => e.child(div().whitespace_normal().text_size(12).text_color(t.ansi1).child(this.error ?? "")))
      .child(h_flex().gap(8).items_center()
        .child(button("settings-save", this.saving ? "Saving…" : "Save", (cx) => this.save(cx), t, { primary: true, enabled: this.canSave() })));
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

  question(title, sentence, t, addControls) {
    return addControls(v_flex().flex_none().gap(8).pt(4).child(div().font_semibold().child(title)))
      .when(Boolean(sentence), (e) => e.child(div().whitespace_normal().text_size(12).text_color(t.muted).child(sentence ?? "")));
  }

  note(text, t) {
    return div().whitespace_normal().text_size(12).text_color(t.dim).child(text);
  }

  // A typed setting; the poll interval says below its field why it can't be saved.
  repositoryQuestion({ key, title, sentence }, t) {
    const problem = key === "pollSeconds" ? this.pollSecondsProblem() : null;
    return this.question(title, sentence, t, (controls) => controls
      .child(this.textField(this.repositoryInputs[key], t))
      .when(Boolean(problem), (e) => e.child(div().whitespace_normal().text_size(12).text_color(t.ansi1).child(problem ?? ""))));
  }

  // A select of the setting's values led by the one that removes it from the entry, labeled with what then applies;
  // workModel's ends with Other, which shows the typed model.
  agentQuestion({ key, title, sentence, choices }, fields, t) {
    const { topLevel } = this.savedAgent[key];
    const clearLabel = topLevel != null ? `Top level (${topLevel})` : `Default (${AGENT_DEFAULTS[key]})`;
    const isWorkModel = key === "workModel";
    const options = [{ id: CLEAR_CHOICE, label: clearLabel }, ...choices.map((id) => ({ id, label: id })), ...(isWorkModel ? [OTHER_WORK_MODEL_OPTION] : [])];
    const chosen = isWorkModel ? workModelChoice(this.agentEntry.workModel, this.otherWorkModelPicked) : this.agentEntry[key] ?? CLEAR_CHOICE;
    return this.question(title, sentence, t, (controls) => controls
      .child(this.selects[key].render(t, { options, value: chosen, enabled: !this.saving,
        onChoose: (id, cx) => this.chooseAgent(key, id === CLEAR_CHOICE ? null : id, cx) }))
      .when(isWorkModel && fields.workModelInput, (e) => e.child(this.textField(this.workModelInput, t))));
  }

  textField(state, t) {
    return Input.new(state).min_w(0).max_w(280).h(26).px(8).items_center()
      .rounded(7).border(1).border_color(t.input).bg(t.surface).text_size(12).text_color(t.foreground);
  }

  textareaField(state, t) {
    return Textarea.new(state).w_full().min_w(0).px(8).py(6)
      .rounded(7).border(1).border_color(t.input).bg(t.surface).text_size(12).text_color(t.foreground);
  }
}
