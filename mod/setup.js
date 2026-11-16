// The panel's view for a repository whose issues it can't list. With no tracker, it shows a blank state whose
// Set Up Issues button walks through one question per page, with Back at the top left and the step and Cancel,
// which drops the answers and returns to the blank state, at the top right, as an open issue's view has its way
// back: the tracker, GitHub Issues, Linear or Beads, which it checks (tracker-choice.js); Linear's team; whether
// a session asks for approval of its work; how the branch then gets into main; for a pull request,
// whether the session waits for its checks; and a review of the choices, which points to the
// gear's settings (settings.js) for the rest. Only Save on the
// review writes the repository's entry in issues.json (setting.js), and the panel lists the issues. Approval
// proposes the repository's current or default settings. A configured tracker that fails to load with a
// SetupProblem (trackers/problems.js) shows the problem and its fix, with Check again and a way to choose a
// different tracker. A Linear API key that is missing, unreadable or refused, at either point, comes with a
// masked field that saves a key Linear accepts.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { settings } from "herdr";
import { button, collapseButton } from "./detail.js";
import { checksChoiceId, waitForChecksOf } from "./settings-fields.js";
import { approvalSettings, resolveApprovalSettings, saveSetupChoices } from "./trackers/setting.js";
import { TrackerChoice, TRACKERS } from "./tracker-choice.js";

/** @import { Context, NativeElement } from "gpui-kit" */
/** @import { Theme } from "./menu.js" */
/** @import { SelectOption } from "./select.js" */
/** @import { SetupProblem } from "./trackers/problems.js" */

/** @typedef {"approval" | "onApproval" | "waitForChecks"} ApprovalKey */
/** @typedef {{ title: string, sentence: string | null, choices: SelectOption[] }} ApprovalQuestion */
/** @typedef {{ approval: string, onApproval: string, waitForChecks: string | null }} ProposedApproval */

const TEAM_PICKS = "issues.setupTeams";
const ANSWER_LABEL_PX = 80;
const GEAR_HINT = "Change this repository's other settings later with the gear in the panel's header.";
// Approval, which the settings view (settings.js) asks too: the question, a sentence under it or null, and
// the choices, each with what it means.
/** @type {Record<ApprovalKey, ApprovalQuestion>} */
export const APPROVAL_QUESTIONS = {
  approval: {
    title: "How is work approved?",
    sentence: null,
    choices: [
      {
        id: "ask",
        label: "Ask me",
        detail:
          "The session shows you what changed and waits for your approval before it merges or opens a pull request.",
      },
      {
        id: "auto",
        label: "Automatically",
        detail: "The session merges or opens a pull request as soon as its work is verified.",
      },
    ],
  },
  onApproval: {
    title: "When work is approved...",
    sentence: "How the branch gets into main.",
    choices: [
      { id: "merge", label: "Merge into main", detail: "The branch merges into main on this computer." },
      {
        id: "pull-request",
        label: "Open a pull request",
        detail: "The session pushes the branch and opens a pull request.",
      },
    ],
  },
  waitForChecks: {
    title: "Wait for the pull request's checks?",
    sentence:
      "Once the pull request opens, after your approval when approval is Ask me, the session can wait for its checks. " +
      "When a check fails because of the branch, it fixes the failure, pushes and waits again; a failure the branch didn't cause " +
      "is noted on the issue. The worktree stays open while it waits, and once the checks pass the session finishes and the close setting applies.",
    choices: [
      {
        id: "no",
        label: "Don't wait",
        detail:
          "The session finishes, and the close setting applies, as soon as the pull request opens. You follow its checks and fix any failures.",
      },
      {
        id: "yes",
        label: "Wait for checks",
        detail:
          "The session and its worktree stay open until the checks pass, so failures are fixed before the worktree closes.",
      },
    ],
  },
};

// A plain sentence for a folder no tracker can serve because it's on another machine.
/**
 * @param {string} sentence
 * @param {Theme} t
 */
export function untrackableView(sentence, t) {
  return v_flex().p(14).child(div().whitespace_normal().text_color(t.dim).child(sentence));
}

const BLANK_STATE_ICON_PX = 40;

// Centered in place of the list: an icon, why there are no issues, the button that fixes it, and how to put
// the panel away instead.
/**
 * @param {{ id: string, sentence: string, label: string, enabled?: boolean, error?: string | null, onClick: (cx: Context) => void }} props
 * @param {Theme} t
 */
function blankState({ id, sentence, label, enabled = true, error = null, onClick }, t) {
  return v_flex()
    .flex_1()
    .min_h(0)
    .p(24)
    .gap(12)
    .items_center()
    .justify_center()
    .child(svg("mods/issues/icons/file-text.svg").size(BLANK_STATE_ICON_PX).text_color(t.dim))
    .child(div().whitespace_normal().text_center().text_color(t.muted).child(sentence))
    .child(button(id, label, onClick, t, { primary: true, enabled }))
    .when(Boolean(error), (e) =>
      e.child(
        div()
          .whitespace_normal()
          .text_center()
          .text_size(12)
          .text_color(t.ansi1)
          .child(error ?? ""),
      ),
    )
    .child(collapseHint(t));
}

// The chord sits in a monospace chip because the UI font draws a capital I like a lowercase l, and ⌘⇧L changes
// the Herdr layout instead.
/**
 * @param {Theme} t
 */
function collapseHint(t) {
  const keyChip = div()
    .flex_none()
    .px(4)
    .rounded(4)
    .bg(t.raised)
    .text_color(t.foreground)
    .text_size(11)
    .font_family(/** @type {string} */ (settings().font_family))
    .child("CMD + Shift + I");
  return h_flex()
    .flex_wrap()
    .justify_center()
    .items_center()
    .gap_x(4)
    .text_size(12)
    .text_color(t.dim)
    .child(div().child("Press"))
    .child(keyChip)
    .child(div().whitespace_normal().text_center().child("to collapse this panel."));
}

// For a folder outside a git repository, with a button that makes it one.
/**
 * @param {{ initializing: boolean, error: string | null, onInitialize: (cx: Context) => void }} props
 * @param {Theme} t
 */
export function notARepositoryView({ initializing, error, onInitialize }, t) {
  return blankState(
    {
      id: "initialize-repository",
      sentence: "Issues currently only works in git repositories.",
      label: initializing ? "Initializing…" : "Initialize Repository",
      enabled: !initializing,
      error,
      onClick: onInitialize,
    },
    t,
  );
}

/**
 * @param {SelectOption[]} choices
 * @param {string | null | undefined} id
 */
const answerLabel = (choices, id) => choices.find((choice) => choice.id === id)?.label ?? "";

export class TrackerSetup {
  // main: the repository's main checkout. onSaved(cx) runs once its entry is written.
  /**
   * @param {string} main
   * @param {(cx: Context) => void} onSaved
   */
  constructor(main, onSaved) {
    this.main = main;
    this.onSaved = onSaved;
    /** @type {SetupProblem | null} */
    this.failure = null;
    this.choosingAnother = false;
    this.settingUp = false;
    this.step = "tracker";
    this.saving = false;
    /** @type {SetupProblem | null} */
    this.saveProblem = null;
    // The proposed approval, onApproval and waitForChecks once the tracker is ready, and the answers to them, with
    // waitForChecks as its select's id (settings-fields.js).
    /** @type {Partial<Record<ApprovalKey, string>>} */
    this.answers = {};
    /** @type {ProposedApproval | null} */
    this.proposed = null;
    this.tracker = new TrackerChoice(main, {
      picks: TEAM_PICKS,
      alongside: () => this.proposeApproval(),
      onReady: (proposed, cx) => {
        this.proposed = proposed;
        this.goTo(this.tracker.choice === "linear" ? "team" : "approval", cx);
      },
      onTeam: (cx) => {
        if (this.step === "team") this.goTo("approval", cx);
      },
    });
  }

  // The configured tracker's SetupProblem, or null when the repository has no tracker.
  /**
   * @param {SetupProblem | null} failure
   */
  showFailure(failure) {
    this.failure = failure;
    if (!failure) this.choosingAnother = false;
  }

  // The steps for the answers so far; before onApproval is chosen, the proposed choice decides whether waiting
  // for checks is asked.
  /**
   * @returns {string[]}
   */
  steps() {
    const onApproval = this.answers.onApproval ?? this.proposed?.onApproval ?? "pull-request";
    return [
      "tracker",
      ...(this.tracker.choice === "linear" ? ["team"] : []),
      "approval",
      "onApproval",
      ...(onApproval === "pull-request" ? ["waitForChecks"] : []),
      "review",
    ];
  }

  // Drops every answer and returns to the blank state; a check still running is ignored once it finishes.
  /**
   * @param {Context} cx
   */
  cancel(cx) {
    this.forgetAnswers();
    this.settingUp = false;
    cx.notify();
  }

  forgetAnswers() {
    Object.assign(this, { step: "tracker", choosingAnother: false, saveProblem: null, answers: {}, proposed: null });
    this.tracker.reset();
  }

  /**
   * @param {string} step
   * @param {Context} cx
   */
  goTo(step, cx) {
    Object.assign(this, { step, saveProblem: null });
    this.tracker.problem = null;
    cx.notify();
  }

  // The previous step, or, choosing another tracker for one that fails to load, the failure.
  /**
   * @param {Context} cx
   */
  back(cx) {
    const steps = this.steps(),
      index = steps.indexOf(this.step);
    if (index > 0) this.goTo(steps[index - 1], cx);
    else {
      this.choosingAnother = false;
      cx.notify();
    }
  }

  // An entry that fails to load proposes the defaults instead of its own settings.
  /**
   * @returns {Promise<ProposedApproval>}
   */
  async proposeApproval() {
    const proposed = await approvalSettings({ root: this.main, on: null }).catch(() =>
      resolveApprovalSettings(this.main, null),
    );
    return { ...proposed, waitForChecks: checksChoiceId(proposed.waitForChecks) };
  }

  /**
   * @param {Context} cx
   */
  takePickedTeam(cx) {
    this.tracker.takePickedTeam(cx);
  }

  // Answers approval, onApproval or waitForChecks, and goes on to the next step.
  /**
   * @param {ApprovalKey} key
   * @param {string} id
   * @param {Context} cx
   */
  chooseApproval(key, id, cx) {
    this.answers = { ...this.answers, [key]: id };
    const steps = this.steps();
    this.goTo(steps[steps.indexOf(key) + 1], cx);
  }

  /**
   * @param {Context} cx
   */
  save(cx) {
    const { choice, team } = this.tracker;
    const { approval, onApproval, waitForChecks } = this.answers;
    const setting = {
      tracker: choice,
      ...(choice === "linear" && { team }),
      approval,
      onApproval,
      ...(onApproval === "pull-request" && { waitForChecks: waitForChecksOf(waitForChecks) }),
    };
    Object.assign(this, { saving: true, saveProblem: null });
    cx.spawn(async (cx) => {
      try {
        await saveSetupChoices(this.main, setting);
        this.forgetAnswers();
        this.onSaved(cx);
      } catch (/** @type {any} */ e) {
        this.saveProblem = e;
      } finally {
        this.saving = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  // header: the panel's header, which a failure shows under; the steps draw their own bar in its place.
  /**
   * @param {Theme} t
   * @param {{ onRetry: (cx: Context) => void, header: NativeElement, onCollapse: Parameters<typeof collapseButton>[0] }} props
   */
  render(t, { onRetry, header, onCollapse }) {
    this.onCollapse = onCollapse;
    const content = v_flex().id("issues-setup").flex_1().min_h(0).overflow_y_scrollbar().p(14).gap(12);
    if (this.failure && !this.choosingAnother) {
      return v_flex()
        .size_full()
        .min_h(0)
        .child(header)
        .child(
          content.child(div().font_semibold().child("Issues can't load")).child(
            this.tracker.problemView(
              "setup-failure",
              this.failure,
              onRetry,
              t,
              button(
                "setup-choose-another",
                "Choose a different tracker",
                (cx) => {
                  this.choosingAnother = true;
                  cx.notify();
                },
                t,
              ),
            ),
          ),
        );
    }
    if (!this.failure && !this.settingUp) {
      return v_flex()
        .size_full()
        .min_h(0)
        .child(header)
        .child(
          blankState(
            {
              id: "setup-start",
              sentence: "Issues isn't set up for this repository.",
              label: "Set Up Issues",
              onClick: (cx) => {
                this.settingUp = true;
                cx.notify();
              },
            },
            t,
          ),
        );
    }
    const page = /** @type {Record<string, ((content: NativeElement, t: Theme) => NativeElement) | undefined>} */ ({
      tracker: this.trackerPage,
      team: this.teamPage,
      review: this.reviewPage,
    })[this.step];
    const shown = page
      ? page.call(this, content, t)
      : this.approvalPage(/** @type {ApprovalKey} */ (this.step), content, t);
    return v_flex().size_full().min_h(0).child(this.stepBar(t)).child(shown);
  }

  // Back at the top left, as an open issue has its way back, and where the step falls at the top right.
  /**
   * @param {Theme} t
   */
  stepBar(t) {
    const steps = this.steps(),
      index = steps.indexOf(this.step);
    const canGoBack = index > 0 || Boolean(this.failure),
      busy = this.tracker.checking || this.saving;
    return h_flex()
      .h(42)
      .flex_none()
      .px(10)
      .gap(8)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .when(canGoBack, (e) =>
        e.child(
          div()
            .id("setup-back")
            .flex_none()
            .h(26)
            .px(8)
            .flex()
            .items_center()
            .rounded(7)
            .text_color(busy ? t.dim : t.muted)
            .when(!busy, (b) =>
              b
                .cursor_pointer()
                .hover((s) => s.bg(t.hover).text_color(t.foreground))
                .on_click((_e, cx) => this.back(cx)),
            )
            .child("‹ Back"),
        ),
      )
      .when(!canGoBack, (e) => e.child(div().px(8).font_semibold().child("Set up issues")))
      .child(div().flex_1())
      .child(
        div()
          .px(4)
          .text_size(12)
          .text_color(t.dim)
          .child(`Step ${index + 1} of ${steps.length}`),
      )
      .when(!this.failure, (e) => e.child(button("setup-cancel", "Cancel", (cx) => this.cancel(cx), t)))
      .child(collapseButton(this.onCollapse, t));
  }

  // A page's question, a sentence under it, and its options, each with what it means. The current answer is
  // solid, and the proposed one says so.
  /**
   * @param {NativeElement} content
   * @param {string} title
   * @param {string | null} sentence
   * @param {Theme} t
   */
  question(content, title, sentence, t) {
    return content
      .child(div().font_semibold().child(title))
      .when(Boolean(sentence), (e) =>
        e.child(div().whitespace_normal().text_size(12).text_color(t.muted).child(sentence)),
      );
  }

  /**
   * @param {string} kind
   * @param {SelectOption[]} choices
   * @param {{ chosen: string | null | undefined, proposed?: string | null, onChoose: (id: string, cx: Context) => void, enabled?: boolean }} props
   * @param {Theme} t
   */
  options(kind, choices, { chosen, proposed = null, onChoose, enabled = true }, t) {
    return v_flex()
      .flex_none()
      .gap(12)
      .children(
        choices.map(({ id, label, detail }) =>
          v_flex()
            .flex_none()
            .gap(4)
            .child(
              h_flex()
                .gap(8)
                .items_center()
                .child(
                  button(`setup-${kind}-${id}`, label, (cx) => onChoose(id, cx), t, {
                    primary: id === chosen,
                    enabled,
                  }),
                )
                .when(id === proposed, (e) => e.child(div().text_size(11).text_color(t.dim).child("Proposed"))),
            )
            .when(Boolean(detail), (e) =>
              e.child(
                div()
                  .whitespace_normal()
                  .text_size(12)
                  .text_color(t.dim)
                  .child(detail ?? ""),
              ),
            ),
        ),
      );
  }

  /**
   * @param {NativeElement} content
   * @param {Theme} t
   */
  trackerPage(content, t) {
    const tracker = this.tracker;
    const sentence = this.failure
      ? "Choose a different issue tracker for this repository."
      : "This repository has no issue tracker yet. Choose where its issues live.";
    const page = this.question(content, "Where do this repository's issues live?", sentence, t).child(
      this.options(
        "tracker",
        TRACKERS,
        {
          chosen: tracker.checking ? null : tracker.choice,
          onChoose: (id, cx) => tracker.choose(id, cx),
          enabled: !tracker.checking,
        },
        t,
      ),
    );
    return tracker.withCheckStatus(page, "setup-problem", t);
  }

  /**
   * @param {NativeElement} content
   * @param {Theme} t
   */
  teamPage(content, t) {
    return this.question(content, "Which Linear team?", "The panel lists this team's issues.", t)
      .child(this.tracker.teamDropdown("setup-team", t))
      .when(Boolean(this.tracker.team), (e) =>
        e.child(
          h_flex().child(button("setup-team-next", "Next", (cx) => this.goTo("approval", cx), t, { primary: true })),
        ),
      );
  }

  // The page for approval, onApproval or waitForChecks.
  /**
   * @param {ApprovalKey} key
   * @param {NativeElement} content
   * @param {Theme} t
   */
  approvalPage(key, content, t) {
    const { title, sentence, choices } = APPROVAL_QUESTIONS[key];
    return this.question(content, title, sentence, t).child(
      this.options(
        key,
        choices,
        {
          chosen: this.answers[key],
          proposed: this.proposed?.[key],
          onChoose: (id, cx) => this.chooseApproval(key, id, cx),
        },
        t,
      ),
    );
  }

  /**
   * @param {NativeElement} content
   * @param {Theme} t
   */
  reviewPage(content, t) {
    const approvalAnswer = (/** @type {ApprovalKey} */ key) =>
      answerLabel(APPROVAL_QUESTIONS[key].choices, this.answers[key]);
    /** @type {[string, string][]} */
    const answers = [
      ["Tracker", answerLabel(TRACKERS, this.tracker.choice)],
      ...(this.tracker.choice === "linear"
        ? /** @type {[string, string][]} */ ([["Team", this.tracker.teamLabel()]])
        : []),
      ["Approval", approvalAnswer("approval")],
      ["When work is approved...", approvalAnswer("onApproval")],
      ...(this.answers.onApproval === "pull-request"
        ? /** @type {[string, string][]} */ ([["Checks", approvalAnswer("waitForChecks")]])
        : []),
    ];
    return this.question(
      content,
      "Review your setup",
      "Save writes these choices for this repository. Go back to change one.",
      t,
    )
      .child(
        v_flex()
          .flex_none()
          .gap(6)
          .children(
            answers.map(([name, value]) =>
              h_flex()
                .gap(8)
                .text_size(12)
                .child(div().w(ANSWER_LABEL_PX).flex_none().text_color(t.dim).child(name))
                .child(div().flex_1().whitespace_normal().text_color(t.foreground).child(value)),
            ),
          ),
      )
      .when(this.saving, (e) => e.child(div().text_size(12).text_color(t.dim).child("Saving…")))
      .when(!this.saving && Boolean(this.saveProblem), (e) =>
        e.child(
          this.tracker.problemView(
            "setup-problem",
            this.saveProblem ?? /** @type {SetupProblem} */ ({}),
            (cx) => this.save(cx),
            t,
          ),
        ),
      )
      .when(!this.saving && !this.saveProblem, (e) =>
        e.child(h_flex().child(button("setup-save", "Save", (cx) => this.save(cx), t, { primary: true }))),
      )
      .child(div().whitespace_normal().text_size(12).text_color(t.dim).child(GEAR_HINT));
  }
}
