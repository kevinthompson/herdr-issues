// The panel's view for a repository whose issues it can't list. With no tracker, it shows a blank state whose
// Set Up Issues button walks through its steps a page each. Under the header, whose Cancel icon button drops the
// answers and returns to the blank state from where the settings gear goes once setup is saved, the settings
// view's row holds Back, the step, and a segment per step filled up to the current one. Each page opens with its
// question as a heading, then sections of cards laid out as the settings view's (setting-row.js): the trackers,
// GitHub Issues, Linear or Beads, a radio row each that chooses it and shows its check (tracker-choice.js), and the
// problem the check finds inside it; Linear's team; on one
// page, the approval settings as the settings view's rows with its labels, each a dropdown (select.js) with the
// chosen option's detail, where waiting for a pull request's checks or pushing main after a merge follows
// onApproval as a dependent field; and a review of the answers, which points to the gear's settings (settings.js)
// for the rest. Only Save on the review writes the repository's entry in issues.json (setting.js), and the panel
// lists the issues. Each repository's setup is kept while the panel shows another repository, and resumes on its
// step with its answers until it's saved, for as long as the panel runs. Approval proposes the repository's
// current or default settings. A configured tracker that fails to load with a SetupProblem (trackers/problems.js)
// shows the problem and its fix, with Check again and a way to choose a different tracker. A Linear API key that
// is missing, unreadable or refused, at either point, comes with a masked field that saves a key Linear accepts.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { settings } from "herdr";
import { actionButton } from "./action-button.js";
import { mixColors, rowHover } from "./colors.js";
import { button } from "./detail.js";
import { rowBeneathHeader, ROW_PADDING_X_PX } from "./filter-row.js";
import { collapseButton, headerBar, iconButton } from "./header.js";
import { CARD_RADIUS_PX, SECTION_INSET_PX } from "./section.js";
import { cardSection, padRow, settingRow, CONTROL_COLUMN_MAX_PX } from "./setting-row.js";
import { yesNoChoiceId, yesNoValue } from "./settings-fields.js";
import { SETTING_LABELS } from "./settings-form.js";
import { approvalSettings, resolveApprovalSettings, saveSetupChoices } from "./trackers/setting.js";
import { SelectMenu } from "./select.js";
import { TrackerChoice, TRACKERS } from "./tracker-choice.js";
import { TEXT_LG_PX, TEXT_MD_PX, TEXT_SM_PX, TEXT_XL_LINE_HEIGHT, TEXT_XL_PX, TEXT_XS_PX } from "./type-scale.js";

/** @import { Color, Context, NativeElement } from "gpui-kit" */
/** @import { Theme } from "./menu.js" */
/** @import { SelectOption } from "./select.js" */
/** @import { SetupProblem } from "./trackers/problems.js" */

/** @typedef {"approval" | "onApproval" | "waitForChecks" | "pushAfterMerge"} ApprovalKey */
/** @typedef {{ title: string, sentence: string | null, choices: SelectOption[] }} ApprovalQuestion */
/** @typedef {{ approval: string, onApproval: string, waitForChecks: string | null, pushAfterMerge: string | null }} ProposedApproval */

const TEAM_PICKS = "issues.setupTeams";
const STEP_SEGMENT_WIDTH_PX = 20;
const STEP_SEGMENT_HEIGHT_PX = 4;
const STEP_SEGMENT_GAP_PX = 4;
// A step not yet reached: the panel's color moved toward its muted text, so it shows in light and dark themes.
/** @param {Theme} t */
const unreachedSegmentFill = (t) => mixColors(t.surface, t.muted, 0.4) ?? t.border;
// The settings view's (settings.js) spacing, so setup's pages line up with it.
const PAGE_PADDING_TOP_PX = 16;
const SECTION_GAP_PX = 32;
// The tracker's name in the settings view's Tracker section (repository-settings.js).
const TRACKER_LABEL = "Issue source";
/** @type {Record<string, string>} */
const TRACKER_DESCRIPTIONS = {
  github: "Issues in the repository's GitHub repository, read and written with gh.",
  linear: "Issues in one of your Linear teams, read and written with a Linear API key.",
  beads: "Issues in a Beads database kept in the repository, read and written with bd.",
};
// A tracker's label line, which its radio indicator centers on.
const TRACKER_LABEL_LINE_HEIGHT_PX = 22;
const RADIO_PX = 16;
const RADIO_DOT_PX = 6;
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
  pushAfterMerge: {
    title: "Push main after merging?",
    sentence: "Once the branch merges into main on this computer, main can be pushed to the remote it tracks.",
    choices: [
      { id: "no", label: "Don't push", detail: "Main stays on this computer until you push it." },
      { id: "yes", label: "Push main", detail: "Main is pushed to its remote after each merge." },
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

// Centered in place of the list: an icon, why there are no issues, as a heading above a sentence or as the
// sentence alone, the button that fixes it when there is one, and how to put the panel away instead.
/**
 * @param {{ heading?: string, sentence: string | NativeElement, action?: { id: string, label: string, enabled?: boolean, onClick: (cx: Context) => void }, error?: string | null }} props
 * @param {Theme} t
 */
function blankState({ heading, sentence, action, error = null }, t) {
  return v_flex()
    .flex_1()
    .min_h(0)
    .p(24)
    .gap(12)
    .items_center()
    .justify_center()
    .child(svg("mods/issues/icons/file-text.svg").size(BLANK_STATE_ICON_PX).text_color(t.dim))
    .child(
      v_flex()
        .items_center()
        .gap(6)
        .when(Boolean(heading), (e) =>
          e.child(
            div()
              .whitespace_normal()
              .text_center()
              .text_size(TEXT_LG_PX)
              .font_semibold()
              .text_color(t.foreground)
              .child(heading ?? ""),
          ),
        )
        .child(
          typeof sentence === "string"
            ? div().whitespace_normal().text_center().text_size(TEXT_SM_PX).text_color(t.muted).child(sentence)
            : sentence,
        ),
    )
    .children(
      action
        ? [button(action.id, action.label, action.onClick, t, { primary: true, enabled: action.enabled ?? true })]
        : [],
    )
    .when(Boolean(error), (e) =>
      e.child(
        div()
          .whitespace_normal()
          .text_center()
          .text_size(TEXT_XS_PX)
          .text_color(t.ansi1)
          .child(error ?? ""),
      ),
    )
    .child(collapseHint(t));
}

/**
 * Text set as code in a sentence: a key chord or a command.
 * @param {string} text
 * @param {Theme} t
 */
const codeChip = (text, t) =>
  div()
    .flex_none()
    .px(4)
    .rounded(4)
    .bg(t.raised)
    .text_color(t.foreground)
    .text_size(11)
    .font_family(/** @type {string} */ (settings().font_family))
    .child(text);

// The chord sits in a monospace chip because the UI font draws a capital I like a lowercase l, and ⌘⇧L changes
// the Herdr layout instead.
/**
 * @param {Theme} t
 */
function collapseHint(t) {
  return h_flex()
    .flex_wrap()
    .justify_center()
    .items_center()
    .gap_x(4)
    .text_size(TEXT_XS_PX)
    .text_color(t.dim)
    .child(div().child("Press"))
    .child(codeChip("CMD + Shift + I", t))
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
      sentence: "Issues currently only works in git repositories.",
      action: {
        id: "initialize-repository",
        label: initializing ? "Initializing…" : "Initialize Repository",
        enabled: !initializing,
        onClick: onInitialize,
      },
      error,
    },
    t,
  );
}

// For a loaded scope with no issues, pointing at the skills that write them.
/** @param {Theme} t */
export function emptyListView(t) {
  const line = () => h_flex().flex_wrap().justify_center().items_center().gap_x(4);
  return blankState(
    {
      sentence: v_flex()
        .items_center()
        .gap(4)
        .text_color(t.muted)
        .child(
          line()
            .child(div().child("Run"))
            .child(codeChip("/issues:plan", t))
            .child(div().child("or"))
            .child(codeChip("/issues:create", t))
            .child(div().child("in Claude Code")),
        )
        .child(div().whitespace_normal().text_center().child("to begin making issues.")),
    },
    t,
  );
}

// A radio button's circle: outlined, or filled with the accent color around a dot of the panel's color when chosen.
/**
 * @param {string} id
 * @param {boolean} chosen
 * @param {Theme} t
 */
const radioIndicator = (id, chosen, t) =>
  h_flex()
    .id(id)
    .flex_none()
    .size(RADIO_PX)
    .items_center()
    .justify_center()
    .rounded_full()
    .border_1()
    .border_color(chosen ? t.accent : t.muted)
    .when(chosen, (e) => e.bg(t.accent).child(div().size(RADIO_DOT_PX).rounded_full().bg(t.surface)));

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
    // The proposed approval settings and pushAfterMerge once the tracker is ready, and the answers to them, with
    // waitForChecks and pushAfterMerge as their selects' ids (settings-fields.js).
    /** @type {Partial<Record<ApprovalKey, string>>} */
    this.answers = {};
    /** @type {ProposedApproval | null} */
    this.proposed = null;
    // The tracker whose check last passed, which the tracker step's Next goes on with after Back.
    /** @type {string | null} */
    this.readyTracker = null;
    /** @type {Record<ApprovalKey, SelectMenu> | null} */
    this.selects = null;
    this.tracker = new TrackerChoice(main, {
      picks: TEAM_PICKS,
      alongside: () => this.proposeApproval(),
      onReady: (proposed, cx) => this.ready(proposed, cx),
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

  /**
   * @returns {string[]}
   */
  steps() {
    return ["tracker", ...(this.tracker.choice === "linear" ? ["team"] : []), "approval", "review"];
  }

  // The approval questions the approval step asks: onApproval's current value decides whether waiting for checks
  // or pushing after merging follows it.
  /**
   * @returns {ApprovalKey[]}
   */
  approvalKeys() {
    const onApproval = this.approvalValue("onApproval");
    return [
      "approval",
      "onApproval",
      ...(onApproval === "pull-request" ? /** @type {ApprovalKey[]} */ (["waitForChecks"]) : []),
      ...(onApproval === "merge" ? /** @type {ApprovalKey[]} */ (["pushAfterMerge"]) : []),
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
    Object.assign(this, {
      step: "tracker",
      choosingAnother: false,
      saveProblem: null,
      answers: {},
      proposed: null,
      readyTracker: null,
    });
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
    return {
      ...proposed,
      waitForChecks: yesNoChoiceId(proposed.waitForChecks),
      pushAfterMerge: yesNoChoiceId(proposed.pushAfterMerge),
    };
  }

  /**
   * @param {Context} cx
   */
  takePickedTeam(cx) {
    this.tracker.takePickedTeam(cx);
  }

  // The chosen tracker checked out: the approval questions' selects, made once since they need a cx, and the step
  // after the tracker.
  /**
   * @param {ProposedApproval} proposed
   * @param {Context} cx
   */
  ready(proposed, cx) {
    this.proposed = proposed;
    this.readyTracker = this.tracker.choice;
    this.selects ??= /** @type {Record<ApprovalKey, SelectMenu>} */ (
      Object.fromEntries(
        Object.entries(APPROVAL_QUESTIONS).map(([key, { title }]) => [key, new SelectMenu(`setup-${key}`, title, cx)]),
      )
    );
    this.goTo(this.stepAfterTracker(), cx);
  }

  stepAfterTracker() {
    return this.tracker.choice === "linear" ? "team" : "approval";
  }

  // The select's value for an approval question: the earlier answer, or else the proposed one.
  /**
   * @param {ApprovalKey} key
   */
  approvalValue(key) {
    return this.answers[key] ?? this.proposed?.[key] ?? APPROVAL_QUESTIONS[key].choices[0].id;
  }

  // Answers an approval question without leaving the step, so the questions shown follow onApproval.
  /**
   * @param {ApprovalKey} key
   * @param {string} id
   * @param {Context} cx
   */
  chooseApproval(key, id, cx) {
    this.answers = { ...this.answers, [key]: id };
    cx.notify();
  }

  // Records the shown approval questions' values, dropping an answer to a question no longer shown, and goes on
  // to the review.
  /**
   * @param {Context} cx
   */
  nextApproval(cx) {
    this.answers = Object.fromEntries(this.approvalKeys().map((key) => [key, this.approvalValue(key)]));
    this.goTo("review", cx);
  }

  /**
   * @param {Context} cx
   */
  save(cx) {
    const { choice, team } = this.tracker;
    const { approval, onApproval, waitForChecks, pushAfterMerge } = this.answers;
    const setting = {
      tracker: choice,
      ...(choice === "linear" && { team }),
      approval,
      onApproval,
      ...(onApproval === "pull-request" && { waitForChecks: yesNoValue(waitForChecks) }),
      ...(onApproval === "merge" && { pushAfterMerge: yesNoValue(pushAfterMerge) }),
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
    const content = v_flex()
      .id("issues-setup")
      .flex_1()
      .min_h(0)
      .overflow_y_scrollbar()
      .p(ROW_PADDING_X_PX)
      .pt(PAGE_PADDING_TOP_PX)
      .gap(SECTION_GAP_PX);
    if (this.failure && !this.choosingAnother) {
      const chooseAnother = button(
        "setup-choose-another",
        "Choose a different tracker",
        (cx) => {
          this.choosingAnother = true;
          cx.notify();
        },
        t,
      );
      return v_flex()
        .size_full()
        .min_h(0)
        .child(header)
        .child(
          content
            .child(this.pageHeading("Issues can't load", null, t))
            .child(
              this.inset().child(this.tracker.problemView("setup-failure", this.failure, onRetry, t, chooseAnother)),
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
              heading: "Issues isn't set up for this repository",
              sentence: "Choose an issue tracker and how finished work is approved.",
              action: {
                id: "setup-start",
                label: "Set Up Issues",
                onClick: (cx) => {
                  this.settingUp = true;
                  cx.notify();
                },
              },
            },
            t,
          ),
        );
    }
    const page = /** @type {Record<string, (content: NativeElement, t: Theme) => NativeElement>} */ ({
      tracker: this.trackerPage,
      team: this.teamPage,
      approval: this.approvalPage,
      review: this.reviewPage,
    })[this.step];
    return v_flex()
      .size_full()
      .min_h(0)
      .child(this.stepBar(t))
      .child(page.call(this, content, t));
  }

  // The panel's header, then a row with the way back at the left and where the step falls beside it.
  /**
   * @param {Theme} t
   */
  stepBar(t) {
    const { backShown, backEnabled, stepText, segments } = this.stepBarState();
    return v_flex()
      .w_full()
      .flex_none()
      .child(
        headerBar(
          {
            icon: "issues",
            title: "Issues",
            secondary: "Setup",
            trailing: [
              this.failure
                ? null
                : iconButton(
                    { id: "setup-cancel", icon: "x", tooltip: "Cancel setup", onClick: (cx) => this.cancel(cx) },
                    t,
                  ),
              collapseButton(this.onCollapse, t),
            ],
          },
          t,
        ),
      )
      .child(
        rowBeneathHeader(t)
          .gap(8)
          .when(backShown, (e) =>
            e.child(
              actionButton(
                {
                  id: "setup-back",
                  icon: "chevron-left",
                  tooltip: "Back",
                  onClick: (cx) => this.back(cx),
                  enabled: backEnabled,
                },
                t,
              ),
            ),
          )
          .child(div().flex_1().text_size(TEXT_SM_PX).text_color(t.muted).child(stepText))
          .child(
            h_flex()
              .flex_none()
              .gap(STEP_SEGMENT_GAP_PX)
              .children(
                segments.map((reached, index) =>
                  div()
                    .id(`setup-step-segment-${index}`)
                    .w(STEP_SEGMENT_WIDTH_PX)
                    .h(STEP_SEGMENT_HEIGHT_PX)
                    .rounded(STEP_SEGMENT_HEIGHT_PX / 2)
                    .bg(/** @type {Color} */ (reached ? t.accent : unreachedSegmentFill(t))),
                ),
              ),
          ),
      );
  }

  // Back shows when a step has a previous one or a failure is showing, and does nothing while checking or saving.
  // Each step's segment is reached once the person is on that step or a later one.
  stepBarState() {
    const steps = this.steps(),
      index = steps.indexOf(this.step);
    return {
      backShown: index > 0 || Boolean(this.failure),
      backEnabled: !(this.tracker.checking || this.saving),
      stepText: `Step ${index + 1} of ${steps.length}`,
      segments: steps.map((_, segment) => segment <= index),
    };
  }

  // A page's question as its heading with a sentence under it, inset like the section headings below it.
  /**
   * @param {string} title
   * @param {string | null} sentence
   * @param {Theme} t
   */
  pageHeading(title, sentence, t) {
    return v_flex()
      .flex_none()
      .px(SECTION_INSET_PX)
      .gap(4)
      .child(
        div()
          .whitespace_normal()
          .text_size(TEXT_XL_PX)
          .line_height(TEXT_XL_LINE_HEIGHT)
          .font_semibold()
          .text_color(t.foreground)
          .child(title),
      )
      .when(Boolean(sentence), (e) =>
        e.child(
          div()
            .whitespace_normal()
            .text_size(TEXT_SM_PX)
            .text_color(t.muted)
            .child(sentence ?? ""),
        ),
      );
  }

  // Loose text and buttons under a page's cards, inset like its heading.
  inset() {
    return v_flex().flex_none().px(SECTION_INSET_PX).gap(8);
  }

  // The page's button that moves on, at its bottom right.
  /**
   * @param {string} id
   * @param {string} label
   * @param {(cx: Context) => void} onClick
   * @param {Theme} t
   */
  nextButton(id, label, onClick, t) {
    return h_flex()
      .flex_none()
      .justify_end()
      .child(button(id, label, onClick, t, { primary: true }));
  }

  // A tracker's row in the tracker card: a radio indicator beside its label, its description, and for the answer
  // its check's status. An unchosen row chooses its tracker when pressed; the chosen one leaves presses to its
  // status's buttons and key field.
  /**
   * @param {{ id: string, label: string }} tracker
   * @param {{ chosen: boolean, enabled: boolean, first: boolean }} state
   * @param {Theme} t
   */
  trackerRow({ id, label }, { chosen, enabled, first }, t) {
    const details = v_flex()
      .flex_1()
      .min_w(0)
      .gap(4)
      .child(
        div()
          .text_size(TEXT_MD_PX)
          .line_height(TRACKER_LABEL_LINE_HEIGHT_PX)
          .font_semibold()
          .text_color(t.foreground)
          .child(label),
      )
      .child(div().whitespace_normal().text_size(TEXT_XS_PX).text_color(t.muted).child(TRACKER_DESCRIPTIONS[id]));
    const row = h_flex()
      .id(`setup-tracker-${id}`)
      .items_start()
      .gap(10)
      .child(
        h_flex()
          .flex_none()
          .h(TRACKER_LABEL_LINE_HEIGHT_PX)
          .items_center()
          .child(radioIndicator(`setup-tracker-${id}-radio`, chosen, t)),
      )
      .child(chosen ? this.tracker.withCheckStatus(details, "setup-problem", t) : details)
      .when(first, (e) => e.rounded_t(CARD_RADIUS_PX - 1))
      .when(chosen, (e) => e.bg(/** @type {Color} */ (rowHover(t))))
      .when(enabled && !chosen, (e) =>
        e
          .cursor_pointer()
          .hover((s) => s.bg(/** @type {Color} */ (rowHover(t))))
          .on_click((_e, cx) => this.tracker.choose(id, cx)),
      );
    return padRow(row, t);
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
    const chosen = tracker.choice;
    const status = tracker.checking || Boolean(tracker.problem);
    return content
      .child(this.pageHeading("Where do this repository's issues live?", sentence, t))
      .child(
        cardSection(
          "Tracker",
          TRACKERS.map((each, index) =>
            this.trackerRow(each, { chosen: each.id === chosen, enabled: !tracker.checking, first: index === 0 }, t),
          ),
          t,
        ),
      )
      .when(!status && Boolean(chosen) && this.readyTracker === chosen, (e) =>
        e.child(this.nextButton("setup-tracker-next", "Next", (cx) => this.goTo(this.stepAfterTracker(), cx), t)),
      );
  }

  /**
   * @param {NativeElement} content
   * @param {Theme} t
   */
  teamPage(content, t) {
    return content
      .child(this.pageHeading("Which Linear team?", "The panel lists this team's issues.", t))
      .child(cardSection("Team", [padRow(v_flex().child(this.tracker.teamDropdown("setup-team", t)), t)], t))
      .when(Boolean(this.tracker.team), (e) =>
        e.child(this.nextButton("setup-team-next", "Next", (cx) => this.goTo("approval", cx), t)),
      );
  }

  // The approval questions as the settings view's rows, each with its select and the chosen option's detail, then
  // one Next.
  /**
   * @param {NativeElement} content
   * @param {Theme} t
   */
  approvalPage(content, t) {
    return content
      .child(this.pageHeading(APPROVAL_QUESTIONS.approval.title, APPROVAL_QUESTIONS.approval.sentence, t))
      .child(
        cardSection(
          "Approval",
          this.approvalKeys().map((key) => this.approvalRow(key, t)),
          t,
        ),
      )
      .child(this.nextButton("setup-approval-next", "Next", (cx) => this.nextApproval(cx), t));
  }

  /**
   * @param {ApprovalKey} key
   * @param {Theme} t
   */
  approvalRow(key, t) {
    const { choices } = APPROVAL_QUESTIONS[key];
    const select = /** @type {Record<ApprovalKey, SelectMenu>} */ (this.selects)[key];
    const value = this.approvalValue(key);
    const detail = choices.find(({ id }) => id === value)?.detail ?? "";
    return settingRow(SETTING_LABELS[key], t, (controls) =>
      controls
        .child(select.render(t, { options: choices, value, onChoose: (id, cx) => this.chooseApproval(key, id, cx) }))
        .child(div().whitespace_normal().text_size(TEXT_XS_PX).text_color(t.dim).child(detail)),
    );
  }

  // An answer's row on the review: the setting's name and the chosen value.
  /**
   * @param {string} name
   * @param {string} value
   * @param {Theme} t
   */
  answerRow(name, value, t) {
    return padRow(
      h_flex()
        .items_start()
        .gap(12)
        .text_size(TEXT_SM_PX)
        .child(div().flex_1().min_w(0).text_color(t.muted).child(name))
        .child(
          div()
            .flex_none()
            .max_w(CONTROL_COLUMN_MAX_PX)
            .whitespace_normal()
            .font_semibold()
            .text_color(t.foreground)
            .child(value),
        ),
      t,
    );
  }

  /**
   * @param {NativeElement} content
   * @param {Theme} t
   */
  reviewPage(content, t) {
    const approvalAnswer = (/** @type {ApprovalKey} */ key) =>
      this.answerRow(SETTING_LABELS[key].title, answerLabel(APPROVAL_QUESTIONS[key].choices, this.answers[key]), t);
    const { onApproval } = this.answers;
    const trackerRows = [
      this.answerRow(TRACKER_LABEL, answerLabel(TRACKERS, this.tracker.choice), t),
      ...(this.tracker.choice === "linear" ? [this.answerRow("Team", this.tracker.teamLabel(), t)] : []),
    ];
    const approvalRows = [
      approvalAnswer("approval"),
      approvalAnswer("onApproval"),
      ...(onApproval === "pull-request" ? [approvalAnswer("waitForChecks")] : []),
      ...(onApproval === "merge" ? [approvalAnswer("pushAfterMerge")] : []),
    ];
    const hint = div().flex_1().min_w(0).whitespace_normal().text_size(TEXT_XS_PX).text_color(t.muted).child(GEAR_HINT);
    return content
      .child(
        this.pageHeading(
          "Review your setup",
          "Save writes these choices for this repository. Go back to change one.",
          t,
        ),
      )
      .child(cardSection("Tracker", trackerRows, t))
      .child(cardSection("Approval", approvalRows, t))
      .when(this.saving, (e) =>
        e.child(this.inset().child(div().text_size(TEXT_XS_PX).text_color(t.dim).child("Saving…")).child(hint)),
      )
      .when(!this.saving && Boolean(this.saveProblem), (e) =>
        e.child(
          this.inset()
            .child(
              this.tracker.problemView(
                "setup-problem",
                this.saveProblem ?? /** @type {SetupProblem} */ ({}),
                (cx) => this.save(cx),
                t,
              ),
            )
            .child(hint),
        ),
      )
      .when(!this.saving && !this.saveProblem, (e) =>
        e.child(
          h_flex()
            .flex_none()
            .px(SECTION_INSET_PX)
            .gap(16)
            .items_center()
            .child(hint)
            .child(button("setup-save", "Save", (cx) => this.save(cx), t, { primary: true })),
        ),
      );
  }
}

// Each repository's setup by its main checkout, kept while the panel shows other repositories so the person
// resumes where they left off. Saving forgets it, so a later setup of the repository starts fresh.
export class KeptSetups {
  // onSaved(cx) runs once any repository's setup is saved.
  /**
   * @param {(cx: Context) => void} onSaved
   */
  constructor(onSaved) {
    this.onSaved = onSaved;
    /** @type {Map<string, TrackerSetup>} */
    this.byMain = new Map();
  }

  /**
   * @param {string} main
   * @returns {TrackerSetup}
   */
  forRepository(main) {
    const kept = this.byMain.get(main);
    if (kept) return kept;
    const setup = new TrackerSetup(main, (cx) => {
      if (this.byMain.get(main) === setup) this.byMain.delete(main);
      this.onSaved(cx);
    });
    this.byMain.set(main, setup);
    return setup;
  }
}
