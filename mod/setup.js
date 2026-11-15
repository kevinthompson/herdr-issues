// The panel's view for a repository whose issues it can't list. With no tracker, it walks through one question
// per page, with Back at the top left and the step at the top right, as an open issue's view has its way back:
// the tracker, GitHub Issues, Linear or Beads, which it checks (gh installed and logged in with origin on GitHub, a
// Linear API key that works, or bd installed with a database in the main checkout, which it offers to make);
// Linear's team; how work gets into main; for a pull request, when the work is
// complete; and a review of the choices. Only Save on the review writes the repository's entry in issues.json
// (setting.js), and the panel lists the issues. How work lands proposes the repository's current or default
// settings. A configured tracker that fails to load with a SetupProblem (trackers/problems.js) shows the
// problem and its fix, with Check again and a way to choose a different tracker. A Linear API key that is
// missing, unreadable or refused, at either point, comes with a masked field that saves a key Linear accepts
// (linear.js), and a link to the page where Linear creates one. Linear's team dropdown is a
// scope menu popup (menu.js), whose pick comes back through shared state.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextView, Input, InputState } from "gpui-base";
import { exec, shared, setShared } from "herdr";
import { button, collapseButton } from "./detail.js";
import { openScopeMenu } from "./menu.js";
import { mergeSettings, resolveMergeSettings, saveSetupChoices } from "./trackers/setting.js";
import { linearClient, saveLinearKey } from "./trackers/linear.js";
import { checkGitHubLogin } from "./trackers/github.js";
import { checkBeads, initializeBeads } from "./trackers/beads.js";
import { forgetLookups } from "./lookups.js";
import { originNotOnGitHub, BEADS_NOT_INITIALIZED, LINEAR_KEY_PROBLEM, LINEAR_KEY_PAGE } from "./trackers/problems.js";

const TEAM_PICKS = "issues.setupTeams";
const TEAMS = "query { teams(first: 250) { nodes { key name } } }";
const TRACKERS = [{ id: "github", label: "GitHub Issues" }, { id: "linear", label: "Linear" }, { id: "beads", label: "Beads" }];
const TEAM_DROPDOWN_MAX_PX = 280;
const ANSWER_LABEL_PX = 80;
const CONFIG_HINT = "For saved Linear views, changing how work lands later, and other options the panel doesn't offer, run `/issues:config` in Claude instead.";
const MERGE_CHOICES = [
  { id: "auto", label: "Merge automatically", detail: "The branch merges into main on this computer as soon as its work is done." },
  { id: "review", label: "Merge after I review", detail: "The branch merges into main on this computer once you approve it." },
  { id: "pull-request", label: "Open a pull request", detail: "The branch lands in main through a pull request." },
];
const COMPLETE_CHOICES = [
  { id: "pull-request-open", label: "Once the pull request is open", detail: "The session can finish and the worktree close while the pull request waits for review." },
  { id: "merged", label: "Once it merges", detail: "The work stays open until the pull request merges into main." },
];

// What each tracker checks before setup moves on; Linear's check answers with the teams the key can see.
const READINESS_CHECKS = { github: checkGitHub, linear: linearTeams, beads: checkBeads };

async function checkGitHub(main) {
  await checkGitHubLogin();
  const origin = await exec("git", ["remote", "get-url", "origin"], { cwd: main }).catch(() => null);
  if (origin?.code !== 0 || !/github\.com[:/]/.test(origin.stdout)) throw originNotOnGitHub();
}

// The teams the API key can see, by name.
async function linearTeams() {
  const linear = await linearClient();
  const { teams } = await linear(TEAMS);
  return [...teams.nodes].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

const markdown = (id, text, color) => TextView.markdown(id, text).flex_none().text_size(12).text_color(color);

// A plain sentence for a folder no tracker can serve because it's on another machine.
export function untrackableView(sentence, t) {
  return v_flex().p(14).child(div().whitespace_normal().text_color(t.dim).child(sentence));
}

const NOT_A_REPOSITORY_ICON_PX = 40;

// Centered in place of the list for a folder outside a git repository, with a button that makes it one.
export function notARepositoryView({ initializing, error, onInitialize }, t) {
  return v_flex().flex_1().min_h(0).p(24).gap(12).items_center().justify_center()
    .child(svg("mods/issues/icons/file-text.svg").size(NOT_A_REPOSITORY_ICON_PX).text_color(t.dim))
    .child(div().whitespace_normal().text_center().text_color(t.muted).child("Issues currently only works in git repositories."))
    .child(button("initialize-repository", initializing ? "Initializing…" : "Initialize Repository", onInitialize, t, { primary: true, enabled: !initializing }))
    .when(Boolean(error), (e) => e.child(div().whitespace_normal().text_center().text_size(12).text_color(t.ansi1).child(error ?? "")))
    .child(div().whitespace_normal().text_center().text_size(12).text_color(t.dim).child("Press ⌘⇧I to collapse this panel."));
}

const answerLabel = (choices, id) => choices.find((choice) => choice.id === id)?.label ?? "";

export class TrackerSetup {
  // main: the repository's main checkout. onSaved(cx) runs once its entry is written.
  constructor(main, onSaved) {
    this.main = main; this.onSaved = onSaved;
    this.failure = null; this.choosingAnother = false;
    this.step = "tracker"; this.checking = false; this.problem = null;
    // The answers so far, and the proposed merge and complete once the tracker is ready.
    this.choice = null; this.teams = null; this.team = null; this.merge = null; this.complete = null; this.proposed = null;
    // The Linear API key being entered, which is never kept once saved.
    this.keyInput = InputState.new({ placeholder: "lin_api_…" });
    this.keyInput.set_masked(true);
    this.keyText = ""; this.savingKey = false; this.keyError = null;
    this.keyInput.on("change", (_e, cx) => { this.keyText = this.keyInput.value(); this.keyError = null; cx.notify(); });
    this.keyInput.on("submit", (_e, cx) => this.saveKey(cx));
  }

  // The configured tracker's SetupProblem, or null when the repository has no tracker.
  showFailure(failure) {
    this.failure = failure;
    if (!failure) this.choosingAnother = false;
  }

  // The steps for the answers so far; before how work lands is chosen, the proposed choice decides whether
  // completion is asked.
  steps() {
    const merge = this.merge ?? this.proposed?.merge ?? "pull-request";
    return ["tracker", ...(this.choice === "linear" ? ["team"] : []), "merge", ...(merge === "pull-request" ? ["complete"] : []), "review"];
  }

  goTo(step, cx) {
    Object.assign(this, { step, problem: null });
    cx.notify();
  }

  // The previous step, or, choosing another tracker for one that fails to load, the failure.
  back(cx) {
    const steps = this.steps(), index = steps.indexOf(this.step);
    if (index > 0) this.goTo(steps[index - 1], cx);
    else { this.choosingAnother = false; cx.notify(); }
  }

  choose(choice, cx) {
    if (choice !== this.choice) this.team = null;
    this.choice = choice;
    this.check(cx);
  }

  // Checks the chosen tracker, then moves on to Linear's team or how work lands.
  check(cx) {
    const choice = this.choice;
    Object.assign(this, { checking: true, problem: null });
    forgetLookups();
    cx.spawn(async (cx) => {
      try {
        const [teams, proposed] = await Promise.all([READINESS_CHECKS[choice](this.main), this.proposeLanding()]);
        if (this.choice !== choice) return;
        Object.assign(this, { teams: teams ?? null, proposed, step: choice === "linear" ? "team" : "merge" });
      } catch (e) { if (this.choice === choice) this.problem = e; }
      finally { if (this.choice === choice) this.checking = false; cx.notify(); }
    });
    cx.notify();
  }

  // Makes the Beads database the check found missing, then checks again.
  makeBeadsDatabase(cx) {
    const choice = this.choice;
    Object.assign(this, { checking: true, problem: null });
    cx.spawn(async (cx) => {
      try {
        await initializeBeads(this.main);
        if (this.choice === choice) this.check(cx);
      } catch (e) {
        if (this.choice === choice) Object.assign(this, { problem: e, checking: false });
        cx.notify();
      }
    });
    cx.notify();
  }

  // An entry that fails to load proposes the defaults instead of its own settings.
  async proposeLanding() {
    const proposed = await mergeSettings({ root: this.main, on: null }).catch(() => resolveMergeSettings(this.main, null));
    return proposed.merge === "pull-request" ? proposed : { ...proposed, complete: "pull-request-open" };
  }

  chooseMerge(merge, cx) {
    this.merge = merge;
    if (merge !== "pull-request") this.complete = null;
    this.goTo(merge === "pull-request" ? "complete" : "review", cx);
  }

  chooseComplete(complete, cx) {
    this.complete = complete;
    this.goTo("review", cx);
  }

  save(cx) {
    const setting = {
      tracker: this.choice, ...(this.choice === "linear" && { team: this.team }),
      merge: this.merge, ...(this.merge === "pull-request" && { complete: this.complete }),
    };
    Object.assign(this, { checking: true, problem: null });
    cx.spawn(async (cx) => {
      try {
        await saveSetupChoices(this.main, setting);
        Object.assign(this, { step: "tracker", choosingAnother: false, choice: null, teams: null, team: null, merge: null, complete: null, proposed: null });
        this.onSaved(cx);
      } catch (e) { this.problem = e; }
      finally { this.checking = false; cx.notify(); }
    });
    cx.notify();
  }

  // Saves the entered key, then checks again as `onKeySaved` says: the chosen tracker's check, or the failure's.
  saveKey(cx) {
    const apiKey = this.keyText.trim();
    if (!apiKey || this.savingKey) return;
    Object.assign(this, { savingKey: true, keyError: null });
    cx.spawn(async (cx) => {
      try {
        await saveLinearKey(apiKey);
        this.keyInput.set_value("");
        this.keyText = "";
        this.onKeySaved?.(cx);
      } catch (e) { this.keyError = String(e.message ?? e); }
      finally { this.savingKey = false; cx.notify(); }
    });
    cx.notify();
  }

  keyForm(id, t) {
    return v_flex().flex_none().gap(6)
      .child(div().text_size(12).font_semibold().child("Linear API key"))
      .child(h_flex().gap(6).items_center()
        .child(Input.new(this.keyInput).flex_1().min_w(0).h(26).px(8).items_center().rounded(7).border(1).border_color(t.input)
          .bg(t.surface).text_size(12).text_color(t.foreground))
        .child(button(`${id}-save-key`, this.savingKey ? "Saving…" : "Save key", (cx) => this.saveKey(cx), t,
          { primary: true, enabled: !this.savingKey && Boolean(this.keyText.trim()) })))
      .child(div().id(`${id}-key-page`).flex_none().text_size(12).text_color(t.accent).cursor_pointer().hover((s) => s.underline())
        .on_click((_e, cx) => cx.open_url(LINEAR_KEY_PAGE))
        .child("Create a personal API key in Linear ↗"))
      .when(Boolean(this.keyError), (e) => e.child(div().whitespace_normal().text_size(12).text_color(t.ansi1).child(this.keyError ?? "")));
  }

  openTeamMenu() {
    const scopes = this.teams.map(({ key, name }) => ({ id: key, label: `${name} (${key})` }));
    openScopeMenu(scopes, this.team, this.main, TEAM_PICKS);
  }

  // Takes the team picked in the dropdown, which hands it over through shared state, and moves on.
  takePickedTeam(cx) {
    const picks = shared(TEAM_PICKS) ?? {}, team = picks[this.main];
    if (!team) return;
    const { [this.main]: _taken, ...others } = picks;
    setShared(TEAM_PICKS, others);
    this.team = team;
    if (this.step === "team") this.goTo("merge", cx);
  }

  teamLabel() {
    const team = this.teams?.find(({ key }) => key === this.team);
    return team ? `${team.name} (${team.key})` : this.team ?? "";
  }

  // A Linear key problem asks for the key, and saving one runs onCheckAgain.
  problemView(id, problem, onCheckAgain, t, extra = null) {
    const asksForKey = problem.code === LINEAR_KEY_PROBLEM;
    if (asksForKey) this.onKeySaved = onCheckAgain;
    return v_flex().flex_none().gap(8)
      .child(div().whitespace_normal().text_size(12).text_color(t.ansi1).child(problem.message))
      .when(asksForKey, (e) => e.child(this.keyForm(id, t)))
      .when(Boolean(problem.fix), (e) => e.child(markdown(`${id}-fix`, problem.fix ?? "", t.foreground).on_link_click((url, cx) => cx.open_url(url))))
      .child(h_flex().gap(6).child(button(`${id}-check`, "Check again", onCheckAgain, t, { primary: true })).when(Boolean(extra), (e) => e.child(extra)));
  }

  // header: the panel's header, which a failure shows under; the steps draw their own bar in its place.
  render(t, { onRetry, header, onCollapse }) {
    this.onCollapse = onCollapse;
    const content = v_flex().id("issues-setup").flex_1().min_h(0).overflow_y_scrollbar().p(14).gap(12);
    if (this.failure && !this.choosingAnother) {
      return v_flex().size_full().min_h(0).child(header).child(content
        .child(div().font_semibold().child("Issues can't load"))
        .child(this.problemView("setup-failure", this.failure, onRetry, t,
          button("setup-choose-another", "Choose a different tracker", (cx) => { this.choosingAnother = true; cx.notify(); }, t)))
        .child(markdown("setup-hint", CONFIG_HINT, t.dim)));
    }
    const page = { tracker: this.trackerPage, team: this.teamPage, merge: this.mergePage, complete: this.completePage, review: this.reviewPage }[this.step];
    return v_flex().size_full().min_h(0).child(this.stepBar(t)).child(page.call(this, content, t));
  }

  // Back at the top left, as an open issue has its way back, and where the step falls at the top right.
  stepBar(t) {
    const steps = this.steps(), index = steps.indexOf(this.step);
    const canGoBack = index > 0 || Boolean(this.failure);
    return h_flex().h(42).flex_none().px(10).gap(8).items_center().border_b(1).border_color(t.border)
      .when(canGoBack, (e) => e.child(div().id("setup-back").flex_none().h(26).px(8).flex().items_center().rounded(7)
        .text_color(this.checking ? t.dim : t.muted)
        .when(!this.checking, (b) => b.cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => this.back(cx)))
        .child("‹ Back")))
      .when(!canGoBack, (e) => e.child(div().px(8).font_semibold().child("Set up issues")))
      .child(div().flex_1())
      .child(div().px(4).text_size(12).text_color(t.dim).child(`Step ${index + 1} of ${steps.length}`))
      .child(collapseButton(this.onCollapse, t));
  }

  // A page's question, a sentence under it, and its options, each with what it means. The current answer is
  // solid, and the proposed one says so.
  question(content, title, sentence, t) {
    return content.child(div().font_semibold().child(title))
      .when(Boolean(sentence), (e) => e.child(div().whitespace_normal().text_size(12).text_color(t.muted).child(sentence)));
  }

  options(kind, choices, { chosen, proposed, onChoose, enabled = true }, t) {
    return v_flex().flex_none().gap(12).children(choices.map(({ id, label, detail }) => v_flex().flex_none().gap(4)
      .child(h_flex().gap(8).items_center()
        .child(button(`setup-${kind}-${id}`, label, (cx) => onChoose(id, cx), t, { primary: id === chosen, enabled }))
        .when(id === proposed, (e) => e.child(div().text_size(11).text_color(t.dim).child("Proposed"))))
      .when(Boolean(detail), (e) => e.child(div().whitespace_normal().text_size(12).text_color(t.dim).child(detail ?? "")))));
  }

  trackerPage(content, t) {
    const sentence = this.failure ? "Choose a different issue tracker for this repository." : "This repository has no issue tracker yet. Choose where its issues live.";
    return this.question(content, "Where do this repository's issues live?", sentence, t)
      .child(this.options("tracker", TRACKERS, { chosen: this.checking ? null : this.choice, onChoose: (id, cx) => this.choose(id, cx), enabled: !this.checking }, t))
      .when(this.checking, (e) => e.child(div().text_size(12).text_color(t.dim).child("Checking…")))
      .when(!this.checking && Boolean(this.problem), (e) => e.child(this.problemView("setup-problem", this.problem ?? {}, (cx) => this.check(cx), t,
        this.problem?.code === BEADS_NOT_INITIALIZED ? button("setup-beads-init", "Run bd init", (cx) => this.makeBeadsDatabase(cx), t) : null)))
      .child(markdown("setup-hint", CONFIG_HINT, t.dim));
  }

  teamPage(content, t) {
    const page = this.question(content, "Which Linear team?", "The panel lists this team's issues.", t);
    if (!this.teams?.length) return page.child(div().text_size(12).text_color(t.dim).child("The Linear API key can't see any teams."));
    return page
      .child(h_flex().id("setup-team").flex_none().max_w(TEAM_DROPDOWN_MAX_PX).h(26).px(10).gap(6).items_center().rounded(7).border_1().border_color(t.border)
        .bg(t.raised).text_size(12).cursor_pointer().hover((s) => s.bg(t.hover))
        .on_click(() => this.openTeamMenu())
        .child(div().flex_1().truncate().child(this.team ? this.teamLabel() : "Choose a team"))
        .child(div().flex_none().text_color(t.dim).child("▾")))
      .when(Boolean(this.team), (e) => e.child(h_flex().child(button("setup-team-next", "Next", (cx) => this.goTo("merge", cx), t, { primary: true }))));
  }

  mergePage(content, t) {
    return this.question(content, "How does work get into main?", null, t)
      .child(this.options("merge", MERGE_CHOICES, { chosen: this.merge, proposed: this.proposed?.merge, onChoose: (id, cx) => this.chooseMerge(id, cx) }, t));
  }

  completePage(content, t) {
    return this.question(content, "When is the work complete?", "When a session can finish and the issue's worktree is safe to close.", t)
      .child(this.options("complete", COMPLETE_CHOICES, { chosen: this.complete, proposed: this.proposed?.complete, onChoose: (id, cx) => this.chooseComplete(id, cx) }, t));
  }

  reviewPage(content, t) {
    const answers = [
      ["Tracker", answerLabel(TRACKERS, this.choice)],
      ...(this.choice === "linear" ? [["Team", this.teamLabel()]] : []),
      ["Work lands", answerLabel(MERGE_CHOICES, this.merge)],
      ...(this.merge === "pull-request" ? [["Complete", answerLabel(COMPLETE_CHOICES, this.complete)]] : []),
    ];
    return this.question(content, "Review your setup", "Save writes these choices for this repository. Go back to change one.", t)
      .child(v_flex().flex_none().gap(6).children(answers.map(([name, value]) => h_flex().gap(8).text_size(12)
        .child(div().w(ANSWER_LABEL_PX).flex_none().text_color(t.dim).child(name))
        .child(div().flex_1().whitespace_normal().text_color(t.foreground).child(value)))))
      .when(this.checking, (e) => e.child(div().text_size(12).text_color(t.dim).child("Saving…")))
      .when(!this.checking && Boolean(this.problem), (e) => e.child(this.problemView("setup-problem", this.problem ?? {}, (cx) => this.save(cx), t)))
      .when(!this.checking && !this.problem, (e) => e.child(h_flex().child(button("setup-save", "Save", (cx) => this.save(cx), t, { primary: true }))));
  }
}
