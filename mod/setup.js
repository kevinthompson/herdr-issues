// The panel's view for a repository whose issues it can't list. With no tracker, it shows a blank state whose
// Set Up Issues button walks through one question per page, with Back at the top left and the step and Cancel,
// which drops the answers and returns to the blank state, at the top right, as an open issue's view has its way
// back: the tracker, GitHub Issues, Linear or Beads, which it checks (tracker-choice.js); Linear's team; how work
// gets into main; for a pull request, when the work is complete; and a review of the choices, which points to the
// gear's settings (settings.js) for the rest. Only Save on the
// review writes the repository's entry in issues.json (setting.js), and the panel lists the issues. How work lands
// proposes the repository's current or default settings. A configured tracker that fails to load with a
// SetupProblem (trackers/problems.js) shows the problem and its fix, with Check again and a way to choose a
// different tracker. A Linear API key that is missing, unreadable or refused, at either point, comes with a
// masked field that saves a key Linear accepts.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { settings } from "herdr";
import { button, collapseButton } from "./detail.js";
import { mergeSettings, resolveMergeSettings, saveSetupChoices } from "./trackers/setting.js";
import { TrackerChoice, TRACKERS, markdown } from "./tracker-choice.js";

const TEAM_PICKS = "issues.setupTeams";
const ANSWER_LABEL_PX = 80;
const CONFIG_HINT = "For saved Linear views, or GitHub issues from a repository other than origin's, run `/issues:config` in Claude instead.";
const GEAR_HINT = "Change this repository's other settings later with the gear in the panel's header.";
export const MERGE_CHOICES = [
  { id: "auto", label: "Merge automatically", detail: "The branch merges into main on this computer as soon as its work is done." },
  { id: "review", label: "Merge after I review", detail: "The branch merges into main on this computer once you approve it." },
  { id: "pull-request", label: "Open a pull request", detail: "The branch lands in main through a pull request." },
];
const COMPLETE_CHOICES = [
  { id: "pull-request-open", label: "Once the pull request is open", detail: "The session can finish and the worktree close as soon as the pull request is open." },
  { id: "pull-request-passing", label: "Once its checks pass", detail: "The session waits for the pull request's checks to pass, then can finish while it waits for review." },
  { id: "merged", label: "Once it merges", detail: "The work stays open until the pull request merges into main." },
];

// A plain sentence for a folder no tracker can serve because it's on another machine.
export function untrackableView(sentence, t) {
  return v_flex().p(14).child(div().whitespace_normal().text_color(t.dim).child(sentence));
}

const BLANK_STATE_ICON_PX = 40;

// Centered in place of the list: an icon, why there are no issues, the button that fixes it, and how to put
// the panel away instead.
function blankState({ id, sentence, label, enabled = true, error = null, onClick }, t) {
  return v_flex().flex_1().min_h(0).p(24).gap(12).items_center().justify_center()
    .child(svg("mods/issues/icons/file-text.svg").size(BLANK_STATE_ICON_PX).text_color(t.dim))
    .child(div().whitespace_normal().text_center().text_color(t.muted).child(sentence))
    .child(button(id, label, onClick, t, { primary: true, enabled }))
    .when(Boolean(error), (e) => e.child(div().whitespace_normal().text_center().text_size(12).text_color(t.ansi1).child(error ?? "")))
    .child(collapseHint(t));
}

// The chord sits in a monospace chip because the UI font draws a capital I like a lowercase l, and ⌘⇧L changes
// the Herdr layout instead.
function collapseHint(t) {
  const keyChip = div().flex_none().px(4).rounded(4).bg(t.raised).text_color(t.foreground)
    .font_family(settings().font_family).child("⌘⇧I");
  return h_flex().flex_wrap().justify_center().items_center().gap_x(4).text_size(12).text_color(t.dim)
    .child(div().child("Press"))
    .child(keyChip)
    .child(div().whitespace_normal().text_center().child("to collapse this panel."));
}

// For a folder outside a git repository, with a button that makes it one.
export function notARepositoryView({ initializing, error, onInitialize }, t) {
  return blankState({
    id: "initialize-repository", sentence: "Issues currently only works in git repositories.",
    label: initializing ? "Initializing…" : "Initialize Repository", enabled: !initializing, error, onClick: onInitialize,
  }, t);
}

const answerLabel = (choices, id) => choices.find((choice) => choice.id === id)?.label ?? "";

export class TrackerSetup {
  // main: the repository's main checkout. onSaved(cx) runs once its entry is written.
  constructor(main, onSaved) {
    this.main = main; this.onSaved = onSaved;
    this.failure = null; this.choosingAnother = false; this.settingUp = false;
    this.step = "tracker"; this.saving = false; this.saveProblem = null;
    // The proposed merge and complete once the tracker is ready, and the answers to them.
    this.merge = null; this.complete = null; this.proposed = null;
    this.tracker = new TrackerChoice(main, {
      picks: TEAM_PICKS,
      alongside: () => this.proposeLanding(),
      onReady: (proposed, cx) => { this.proposed = proposed; this.goTo(this.tracker.choice === "linear" ? "team" : "merge", cx); },
      onTeam: (cx) => { if (this.step === "team") this.goTo("merge", cx); },
    });
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
    return ["tracker", ...(this.tracker.choice === "linear" ? ["team"] : []), "merge", ...(merge === "pull-request" ? ["complete"] : []), "review"];
  }

  // Drops every answer and returns to the blank state; a check still running is ignored once it finishes.
  cancel(cx) {
    this.forgetAnswers();
    this.settingUp = false;
    cx.notify();
  }

  forgetAnswers() {
    Object.assign(this, { step: "tracker", choosingAnother: false, saveProblem: null, merge: null, complete: null, proposed: null });
    this.tracker.reset();
  }

  goTo(step, cx) {
    Object.assign(this, { step, saveProblem: null });
    this.tracker.problem = null;
    cx.notify();
  }

  // The previous step, or, choosing another tracker for one that fails to load, the failure.
  back(cx) {
    const steps = this.steps(), index = steps.indexOf(this.step);
    if (index > 0) this.goTo(steps[index - 1], cx);
    else { this.choosingAnother = false; cx.notify(); }
  }

  // An entry that fails to load proposes the defaults instead of its own settings.
  async proposeLanding() {
    const proposed = await mergeSettings({ root: this.main, on: null }).catch(() => resolveMergeSettings(this.main, null));
    return proposed.merge === "pull-request" ? proposed : { ...proposed, complete: "pull-request-open" };
  }

  takePickedTeam(cx) {
    this.tracker.takePickedTeam(cx);
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
    const { choice, team } = this.tracker;
    const setting = {
      tracker: choice, ...(choice === "linear" && { team }),
      merge: this.merge, ...(this.merge === "pull-request" && { complete: this.complete }),
    };
    Object.assign(this, { saving: true, saveProblem: null });
    cx.spawn(async (cx) => {
      try {
        await saveSetupChoices(this.main, setting);
        this.forgetAnswers();
        this.onSaved(cx);
      } catch (e) { this.saveProblem = e; }
      finally { this.saving = false; cx.notify(); }
    });
    cx.notify();
  }

  // header: the panel's header, which a failure shows under; the steps draw their own bar in its place.
  render(t, { onRetry, header, onCollapse }) {
    this.onCollapse = onCollapse;
    const content = v_flex().id("issues-setup").flex_1().min_h(0).overflow_y_scrollbar().p(14).gap(12);
    if (this.failure && !this.choosingAnother) {
      return v_flex().size_full().min_h(0).child(header).child(content
        .child(div().font_semibold().child("Issues can't load"))
        .child(this.tracker.problemView("setup-failure", this.failure, onRetry, t,
          button("setup-choose-another", "Choose a different tracker", (cx) => { this.choosingAnother = true; cx.notify(); }, t)))
        .child(markdown("setup-hint", CONFIG_HINT, t.dim)));
    }
    if (!this.failure && !this.settingUp) {
      return v_flex().size_full().min_h(0).child(header).child(blankState({
        id: "setup-start", sentence: "Issues isn't set up for this repository.", label: "Set Up Issues",
        onClick: (cx) => { this.settingUp = true; cx.notify(); },
      }, t));
    }
    const page = { tracker: this.trackerPage, team: this.teamPage, merge: this.mergePage, complete: this.completePage, review: this.reviewPage }[this.step];
    return v_flex().size_full().min_h(0).child(this.stepBar(t)).child(page.call(this, content, t));
  }

  // Back at the top left, as an open issue has its way back, and where the step falls at the top right.
  stepBar(t) {
    const steps = this.steps(), index = steps.indexOf(this.step);
    const canGoBack = index > 0 || Boolean(this.failure), busy = this.tracker.checking || this.saving;
    return h_flex().h(42).flex_none().px(10).gap(8).items_center().border_b(1).border_color(t.border)
      .when(canGoBack, (e) => e.child(div().id("setup-back").flex_none().h(26).px(8).flex().items_center().rounded(7)
        .text_color(busy ? t.dim : t.muted)
        .when(!busy, (b) => b.cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => this.back(cx)))
        .child("‹ Back")))
      .when(!canGoBack, (e) => e.child(div().px(8).font_semibold().child("Set up issues")))
      .child(div().flex_1())
      .child(div().px(4).text_size(12).text_color(t.dim).child(`Step ${index + 1} of ${steps.length}`))
      .when(!this.failure, (e) => e.child(button("setup-cancel", "Cancel", (cx) => this.cancel(cx), t)))
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
    const tracker = this.tracker;
    const sentence = this.failure ? "Choose a different issue tracker for this repository." : "This repository has no issue tracker yet. Choose where its issues live.";
    const page = this.question(content, "Where do this repository's issues live?", sentence, t)
      .child(this.options("tracker", TRACKERS, { chosen: tracker.checking ? null : tracker.choice, onChoose: (id, cx) => tracker.choose(id, cx), enabled: !tracker.checking }, t));
    return tracker.withCheckStatus(page, "setup-problem", t)
      .child(markdown("setup-hint", CONFIG_HINT, t.dim));
  }

  teamPage(content, t) {
    return this.question(content, "Which Linear team?", "The panel lists this team's issues.", t)
      .child(this.tracker.teamDropdown("setup-team", t))
      .when(Boolean(this.tracker.team), (e) => e.child(h_flex().child(button("setup-team-next", "Next", (cx) => this.goTo("merge", cx), t, { primary: true }))));
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
      ["Tracker", answerLabel(TRACKERS, this.tracker.choice)],
      ...(this.tracker.choice === "linear" ? [["Team", this.tracker.teamLabel()]] : []),
      ["Work lands", answerLabel(MERGE_CHOICES, this.merge)],
      ...(this.merge === "pull-request" ? [["Complete", answerLabel(COMPLETE_CHOICES, this.complete)]] : []),
    ];
    return this.question(content, "Review your setup", "Save writes these choices for this repository. Go back to change one.", t)
      .child(v_flex().flex_none().gap(6).children(answers.map(([name, value]) => h_flex().gap(8).text_size(12)
        .child(div().w(ANSWER_LABEL_PX).flex_none().text_color(t.dim).child(name))
        .child(div().flex_1().whitespace_normal().text_color(t.foreground).child(value)))))
      .when(this.saving, (e) => e.child(div().text_size(12).text_color(t.dim).child("Saving…")))
      .when(!this.saving && Boolean(this.saveProblem), (e) => e.child(this.tracker.problemView("setup-problem", this.saveProblem ?? {}, (cx) => this.save(cx), t)))
      .when(!this.saving && !this.saveProblem, (e) => e.child(h_flex().child(button("setup-save", "Save", (cx) => this.save(cx), t, { primary: true }))))
      .child(div().whitespace_normal().text_size(12).text_color(t.dim).child(GEAR_HINT));
  }
}
