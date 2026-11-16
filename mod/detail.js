// One issue, drawn inside the panel in place of the list: a way back, its status and priority
// (each a dropdown), its labels (with a dropdown that adds and removes them), its other details and its Markdown body, which Edit swaps for an editor. Merge shows
// when the issue's finished branch can merge into main from here (merge.js).
// Task-list items in the body are checkboxes that check off in place.
import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextView, Editor } from "gpui-base";
import { optionLabel } from "./menu.js";
import { bodySegments } from "./tasks.js";
import { dueStatus, statusIcon } from "./issue.js";
import { DUE_COLORS, fieldBar, isLightTheme } from "./colors.js";
import { collapseButton, headerBar } from "./header.js";
import { rowBeneathHeader } from "./filter-row.js";
import { actionButton, textActionButton, ACTION_GAP_PX } from "./action-button.js";

/** @import { Context, Color, NativeElement } from "gpui-kit" */
/** @import { EditorState } from "gpui-base" */
/** @import { Theme } from "./menu.js" */
/** @import { Issue, PullRequest } from "./trackers/index.js" */

/** @typedef {{ line: number, indent: number, checked: boolean, text: string, markdown?: undefined }} TaskSegment */
/** @typedef {{ markdown: string }} MarkdownSegment */
/** @typedef {MarkdownSegment | TaskSegment} BodySegment */

/**
 * What the issue view draws: the issue, the state around it and the handlers its controls run.
 * @typedef {object} DetailView
 * @property {Issue} issue
 * @property {string[]} blocking
 * @property {NativeElement | null} [assignee]
 * @property {boolean} writable
 * @property {boolean} prioritized
 * @property {boolean} labelsEditable
 * @property {boolean} mergeable
 * @property {boolean} merging
 * @property {boolean} opening
 * @property {boolean} loading
 * @property {boolean} saving
 * @property {boolean} finishable
 * @property {boolean} startable
 * @property {boolean} inSpace
 * @property {boolean} inActiveSpace
 * @property {EditorState | null} [editor]
 * @property {string | null} [error]
 * @property {NativeElement | null} [failedEditAlert]
 * @property {NativeElement} refreshButton
 * @property {NativeElement | null} [settingsButton]
 * @property {(id: string) => boolean} hasIssue
 * @property {(id: string, cx: Context) => void} onOpen
 * @property {(url: string, cx: Context) => void} onLink
 * @property {(text: string) => string} linkFiles
 * @property {(field: "status" | "priority", cx: Context) => void} onMenu
 * @property {(cx: Context) => void} onLabelsMenu
 * @property {(cx: Context) => void} onBack
 * @property {(cx: Context) => void} onCollapse
 * @property {(cx: Context) => void} onStart
 * @property {(cx: Context) => void} onContinue
 * @property {(cx: Context) => void} onMerge
 * @property {(cx: Context) => void} onEdit
 * @property {(cx: Context) => void} onSave
 * @property {(cx: Context) => void} onCancel
 * @property {(line: number, cx: Context) => void} onToggleTask
 */

const STATUS_ICON_PX = 14;

/**
 * The status dropdown is colored only by its status's icon.
 * @param {"status" | "priority"} field
 * @param {string} label
 * @param {Pick<DetailView, "issue" | "writable" | "onMenu">} view
 * @param {Theme} t
 */
function dropdown(field, label, { issue, writable, onMenu }, t) {
  const icon = field === "status" ? statusIcon(issue.status) : null;
  return h_flex()
    .gap(6)
    .items_center()
    .text_size(11)
    .child(div().text_color(t.dim).child(label))
    .child(
      h_flex()
        .id(`field-${field}`)
        .h(24)
        .px(8)
        .gap(6)
        .items_center()
        .rounded(6)
        .border_1()
        .border_color(t.border)
        .text_color(t.foreground)
        .bg(t.raised)
        .when(writable, (e) =>
          e
            .cursor_pointer()
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => onMenu(field, cx)),
        )
        .when(Boolean(icon), (e) =>
          e.child(
            image(icon ?? "")
              .flex_none()
              .size(STATUS_ICON_PX),
          ),
        )
        .child(optionLabel(field, issue[field]))
        .when(writable, (e) => e.child(div().text_color(t.dim).child("▾"))),
    );
}

/**
 * Issue IDs, each a link that opens that issue when the panel has it, separated by commas. Links
 * stop the pointer events a list row would otherwise take as an open.
 * @param {string} key
 * @param {string[]} ids
 * @param {Pick<DetailView, "hasIssue" | "onOpen">} handlers
 * @param {Theme} t
 * @param {Color} color
 */
export function issueLinks(key, ids, { hasIssue, onOpen }, t, color) {
  return h_flex()
    .flex_none()
    .flex_wrap()
    .gap_x(4)
    .items_center()
    .children(
      ids.map((id, index) => {
        const label = index < ids.length - 1 ? `${id},` : id;
        if (!hasIssue(id)) return div().flex_none().whitespace_nowrap().child(label);
        return div()
          .id(`${key}-${id}`)
          .flex_none()
          .whitespace_nowrap()
          .cursor_pointer()
          .text_color(color)
          .hover((s) => s.underline())
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_mouse_up("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => {
            cx.stop_propagation();
            onOpen(id, cx);
          })
          .child(label);
      }),
    );
}

const FACT_ROW_PX = 18,
  FACT_ICON_PX = 12;

/**
 * One of the issue's facts on a line of its own: its name dimmed, then its value.
 * @param {string} label
 * @param {NativeElement} value
 * @param {Theme} t
 */
function fact(label, value, t) {
  return h_flex()
    .min_h(FACT_ROW_PX)
    .gap(4)
    .items_center()
    .child(div().flex_none().text_color(t.dim).child(label))
    .child(value);
}

/**
 * A fact named by an icon, which names it in words on hover. The icon sits on the first line of a
 * value that wraps or lists several things.
 * @param {string} icon
 * @param {string} name
 * @param {NativeElement | string} value
 * @param {Theme} t
 */
function iconFact(icon, name, value, t) {
  return h_flex()
    .gap(10)
    .items_start()
    .child(
      div()
        .id(`fact-${icon}`)
        .flex_none()
        .h(FACT_ROW_PX)
        .flex()
        .items_center()
        .tooltip(name)
        .child(svg(`mods/issues/icons/${icon}.svg`).size(FACT_ICON_PX).text_color(t.dim)),
    )
    .child(div().flex_1().min_w(0).min_h(FACT_ROW_PX).flex().items_center().child(value));
}

/**
 * @param {string} key
 * @param {string} icon
 * @param {string} name
 * @param {string[]} ids
 * @param {Pick<DetailView, "hasIssue" | "onOpen">} view
 * @param {Theme} t
 */
const linkedFact = (key, icon, name, ids, view, t) =>
  iconFact(icon, name, fact(`${name}:`, issueLinks(key, ids, view, t, t.accent), t), t);

/**
 * A label as Linear draws it: a dot in the label's color before its name, when the tracker knows the color.
 * @param {string} label
 * @param {Color | string | undefined} color
 * @param {Theme} t
 */
function labelChip(label, color, t) {
  return h_flex()
    .flex_none()
    .px(5)
    .gap(4)
    .items_center()
    .rounded(4)
    .border_1()
    .border_color(t.border)
    .text_color(t.muted)
    .when(Boolean(color), (e) =>
      e.child(
        div()
          .flex_none()
          .size(6)
          .rounded(3)
          .bg(/** @type {Color} */ (color)),
      ),
    )
    .child(label);
}

/**
 * @param {Pick<Issue, "labels" | "labelColors">} issue
 * @param {Theme} t
 */
export const labelChips = ({ labels, labelColors }, t) =>
  labels.map((label) => labelChip(label, labelColors?.[label], t));

/**
 * The issue's labels, then, where they can change, a button opening the dropdown that adds and removes them.
 * @param {Pick<DetailView, "issue" | "labelsEditable" | "onLabelsMenu">} view
 * @param {Theme} t
 */
function labelsRow({ issue, labelsEditable, onLabelsMenu }, t) {
  return h_flex()
    .pt(4)
    .flex_wrap()
    .gap(4)
    .items_center()
    .children(labelChips(issue, t))
    .when(labelsEditable, (e) =>
      e.child(
        h_flex()
          .id("field-labels")
          .flex_none()
          .px(5)
          .gap(4)
          .items_center()
          .rounded(4)
          .border_1()
          .border_color(t.border)
          .text_color(t.dim)
          .cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => onLabelsMenu(cx))
          .child(issue.labels.length ? "Edit labels" : "Add label")
          .child("▾"),
      ),
    );
}

/**
 * `blocking`: the IDs of issues that list this one in their blocked_by.
 * @param {DetailView} view
 * @param {Theme} t
 */
function facts(view, t) {
  const {
      issue: { blockedBy, branch, pullRequests: attached },
      blocking,
      assignee,
    } = view,
    due = dueStatus(view.issue);
  return v_flex()
    .gap(2)
    .text_size(11)
    .text_color(t.muted)
    .when(Boolean(assignee), (e) => e.child(iconFact("user", "Assignee", assignee, t)))
    .when(Boolean(due), (e) =>
      e.child(iconFact("calendar", "Due", div().text_color(t[DUE_COLORS[due.urgency]]).child(due.text), t)),
    )
    .when(blockedBy.length > 0, (e) => e.child(linkedFact("detail-blocker", "ban", "Blocked by", blockedBy, view, t)))
    .when(blocking.length > 0, (e) =>
      e.child(linkedFact("detail-blocking", "circle-arrow-right", "Blocking", blocking, view, t)),
    )
    .when(Boolean(branch), (e) => e.child(iconFact("git-branch", "Branch", div().min_w(0).truncate().child(branch), t)))
    .when(attached?.length > 0, (e) =>
      e.child(
        iconFact("pull-request", attached.length > 1 ? "Pull requests" : "Pull request", pullRequests(view, t), t),
      ),
    )
    .when(view.issue.labels.length > 0 || view.labelsEditable, (e) => e.child(labelsRow(view, t)));
}

/** @type {Record<string, [string, string]>} */
const PULL_REQUEST_STATUSES = {
  draft: ["Draft", "dim"],
  open: ["Open", "ansi2"],
  inReview: ["In review", "ansi2"],
  approved: ["Approved", "ansi2"],
  merged: ["Merged", "ansi5"],
  closed: ["Closed", "ansi1"],
};

/**
 * A pull request's status, then its number and title, which open it in the browser when clicked.
 * @param {string} issueId
 * @param {PullRequest} pullRequest
 * @param {DetailView["onLink"]} onLink
 * @param {Theme} t
 */
function pullRequestLine(issueId, pullRequest, onLink, t) {
  const [status, color] = PULL_REQUEST_STATUSES[pullRequest.status] ?? [pullRequest.status, "dim"];
  const reference = pullRequest.number ? `${pullRequest.repo ?? ""}#${pullRequest.number}` : "";
  return h_flex()
    .flex_1()
    .min_w(0)
    .gap(6)
    .items_start()
    .child(div().flex_none().text_color(t[color]).child(status))
    .child(
      h_flex()
        .id(`pull-request-${issueId}-${pullRequest.url}`)
        .flex_1()
        .min_w(0)
        .gap(6)
        .items_start()
        .cursor_pointer()
        .on_click((_e, cx) => onLink(pullRequest.url, cx))
        .child(div().flex_none().text_color(t.accent).child(reference))
        .child(div().flex_1().min_w(0).truncate().child(pullRequest.title)),
    );
}

/**
 * The issue's one pull request, or a bulleted list of several.
 * @param {Pick<DetailView, "issue" | "onLink">} view
 * @param {Theme} t
 */
function pullRequests({ issue: { id, pullRequests }, onLink }, t) {
  if (pullRequests.length === 1) return pullRequestLine(id, pullRequests[0], onLink, t);
  return v_flex()
    .flex_1()
    .min_w(0)
    .gap(2)
    .children(
      pullRequests.map((pullRequest) =>
        h_flex()
          .min_w(0)
          .min_h(FACT_ROW_PX)
          .gap(6)
          .items_start()
          .child(div().flex_none().text_color(t.dim).child("•"))
          .child(pullRequestLine(id, pullRequest, onLink, t)),
      ),
    );
}

// An icon has its own color, so a button whose label is an icon redraws it in the hover color.
/** @type {string | null} */
let hoveredButton = null;

/**
 * A light theme's raised fill barely differs from the panel, so a button there is outlined too.
 * @param {NativeElement} element
 * @param {Theme} t
 */
const outlinedInLightTheme = (element, t) => element.when(isLightTheme(t), (e) => e.border_1().border_color(t.border));

/**
 * Buttons stop the pointer events a list row would otherwise take as an open. A label may be a
 * function of the button's text color, for an icon.
 * @param {string} id
 * @param {string | ((color: Color) => NativeElement)} label
 * @param {(cx: Context) => void} onClick
 * @param {Theme} t
 * @param {{ primary?: boolean, enabled?: boolean, tooltip?: string | null, primaryOnHover?: boolean }} [options]
 */
export function button(
  id,
  label,
  onClick,
  t,
  { primary = false, enabled = true, tooltip = null, primaryOnHover = false } = {},
) {
  const solidOnHover = primaryOnHover && !primary;
  /** @type {(style: NativeElement) => NativeElement} */
  const hoverStyle = solidOnHover ? (s) => s.bg(t.solid).text_color(t.solid_foreground) : (s) => s.opacity(0.85);
  const textColor = !enabled
    ? t.dim
    : primary || (solidOnHover && hoveredButton === id)
      ? t.solid_foreground
      : t.foreground;
  return div()
    .id(id)
    .flex_none()
    .h(26)
    .px(10)
    .flex()
    .items_center()
    .rounded(7)
    .text_size(12)
    .when(tooltip, (e) => e.tooltip(tooltip))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_mouse_up("left", (_e, cx) => cx.stop_propagation())
    .bg(enabled && primary ? t.solid : t.raised)
    .text_color(textColor)
    .when(!(enabled && primary), (e) => outlinedInLightTheme(e, t))
    .when(enabled, (e) =>
      e
        .cursor_pointer()
        .hover(hoverStyle)
        .on_click((_e, cx) => onClick(cx)),
    )
    .when(enabled && typeof label === "function", (e) =>
      e.on_hover((hovered, cx) => {
        if (hovered) hoveredButton = id;
        else if (hoveredButton === id) hoveredButton = null;
        cx.notify();
      }),
    )
    .child(typeof label === "function" ? label(textColor) : label);
}

/**
 * Continue for an issue in progress, otherwise Start, which is disabled until work can start. An issue
 * whose worktree a space already shows switches to that space instead, and the button stands out to say so,
 * unless that space is the active one. The list's compact button shows the issue's branch for both, so it
 * fits beside a title. Each is disabled while the issue's worktree is opening, and says so while loading.
 * @param {string} key
 * @param {Pick<DetailView, "finishable" | "startable" | "inSpace" | "inActiveSpace" | "opening" | "loading" | "onStart" | "onContinue">} state
 * @param {Theme} t
 * @param {{ primary?: boolean, compact?: boolean }} [options]
 */
export function workButton(
  key,
  { finishable, startable, inSpace, inActiveSpace, opening, loading, onStart, onContinue },
  t,
  { primary = true, compact = false } = {},
) {
  if (inSpace) {
    const tooltip = inActiveSpace ? "Already in this issue's space" : "Switch to this issue's worktree space";
    return button(`${key}-space`, compact ? "↗" : "Go to space", onContinue, t, {
      primary: true,
      enabled: !opening && !inActiveSpace,
      tooltip,
    });
  }
  const style = { primary, primaryOnHover: compact, enabled: !opening };
  /** @param {Color} color */
  const branchIcon = (color) => svg("mods/issues/icons/git-branch-plus.svg").size(14).text_color(color);
  if (finishable) {
    const label = loading ? (compact ? "…" : "Opening…") : compact ? branchIcon : "Continue";
    return button(`${key}-continue`, label, onContinue, t, {
      ...style,
      tooltip: compact ? (loading ? "Opening this issue's worktree…" : "Continue work") : null,
    });
  }
  const label = loading ? (compact ? "…" : "Starting…") : compact ? branchIcon : "Start";
  return button(`${key}-start`, label, onStart, t, {
    ...style,
    enabled: startable && !opening,
    tooltip: compact ? (loading ? "Starting work…" : "Start work") : null,
  });
}

/**
 * A button's label that is an icon, redrawn in the button's text color.
 * @param {string} name
 * @returns {(color: Color) => NativeElement}
 */
export const icon = (name) => (color) => svg(`mods/issues/icons/${name}.svg`).size(14).text_color(color);

/**
 * Continue for an issue in progress, otherwise Start, or Go to space when a space already shows the
 * worktree: the issue view's filled primary action.
 * @param {DetailView} view
 * @param {Theme} t
 */
function workActions({ finishable, startable, inSpace, inActiveSpace, opening, onStart, onContinue }, t) {
  if (inSpace)
    return actionButton(
      {
        id: "issue-space",
        icon: "circle-arrow-right",
        tooltip: inActiveSpace ? "Already in this issue's space" : "Switch to this issue's worktree space",
        onClick: onContinue,
        primary: true,
        enabled: !inActiveSpace,
        busy: opening,
      },
      t,
    );
  if (finishable)
    return actionButton(
      {
        id: "issue-continue",
        icon: "git-branch-plus",
        tooltip: "Continue work",
        onClick: onContinue,
        primary: true,
        busy: opening,
      },
      t,
    );
  return actionButton(
    {
      id: "issue-start",
      icon: "git-branch-plus",
      tooltip: "Start work",
      onClick: onStart,
      primary: true,
      enabled: startable,
      busy: opening,
    },
    t,
  );
}

/**
 * Merges the issue's finished branch into main, for a repository that merges locally.
 * @param {Pick<DetailView, "issue" | "merging" | "opening" | "onMerge">} view
 * @param {Theme} t
 */
function mergeButton({ issue, merging, opening, onMerge }, t) {
  return actionButton(
    {
      id: "issue-merge",
      icon: "git-merge",
      tooltip: `Merge ${issue.branch} into main, mark ${issue.id} done and remove its worktree`,
      onClick: onMerge,
      enabled: !opening,
      busy: merging,
    },
    t,
  );
}

/**
 * @param {DetailView} view
 * @param {Theme} t
 */
function editActions({ issue, writable, editor, saving, onEdit, onSave, onCancel }, t) {
  if (!writable) return div();
  if (!editor)
    return actionButton(
      { id: "issue-edit", icon: "pencil", tooltip: "Edit", onClick: onEdit, enabled: issue.body !== null },
      t,
    );
  return h_flex()
    .flex_none()
    .gap(ACTION_GAP_PX)
    .child(textActionButton({ id: "issue-cancel", label: "Cancel", onClick: onCancel, enabled: !saving }, t))
    .child(
      textActionButton(
        { id: "issue-save", label: saving ? "Saving…" : "Save", onClick: onSave, primary: true, enabled: !saving },
        t,
      ),
    );
}

const TASK_INDENT_PX = 9;
const AFTER_TASKS_PX = 14;

/**
 * @param {TaskSegment} task
 * @param {DetailView} view
 * @param {Theme} t
 */
function taskItem(task, { issue, writable, onToggleTask, onLink, linkFiles }, t) {
  const box = div()
    .id(`task-${issue.id}-${task.line}`)
    .flex_none()
    .mt(3)
    .size(14)
    .rounded(4)
    .border_1()
    .flex()
    .items_center()
    .justify_center()
    .text_size(10)
    .border_color(task.checked ? t.accent : t.input)
    .when(task.checked, (e) => e.bg(t.accent).text_color(t.accent_foreground).child("✓"))
    .when(writable, (e) =>
      e
        .cursor_pointer()
        .hover((s) => s.opacity(0.8))
        .on_click((_e, cx) => onToggleTask(task.line, cx)),
    );
  return h_flex()
    .flex_none()
    .gap(8)
    .items_start()
    .pl(task.indent * TASK_INDENT_PX)
    .child(box)
    .child(
      TextView.markdown(`task-text-${issue.id}-${task.line}`, linkFiles(task.text))
        .selectable()
        .flex_1()
        .min_w(0)
        .on_link_click(onLink)
        .text_color(task.checked ? t.muted : t.foreground),
    );
}

/**
 * @param {DetailView} view
 * @param {Theme} t
 */
function body(view, t) {
  const { issue, editor, onLink, linkFiles } = view;
  if (editor) return Editor.new(editor).size_full();
  if (issue.body === null) return div().text_color(t.dim).child("Loading…");
  return v_flex()
    .id(`issue-body-${issue.id}`)
    .size_full()
    .overflow_y_scrollbar()
    .gap(4)
    .children(
      /** @type {BodySegment[]} */ (bodySegments(issue.body)).map((segment, index, segments) =>
        segment.markdown !== undefined
          ? TextView.markdown(`issue-body-${issue.id}-${index}`, linkFiles(segment.markdown))
              .selectable()
              .flex_none()
              .on_link_click(onLink)
              .when(index > 0 && segments[index - 1].markdown === undefined, (e) => e.mt(AFTER_TASKS_PX))
          : taskItem(/** @type {TaskSegment} */ (segment), view, t),
      ),
    );
}

/**
 * @param {Pick<DetailView, "failedEditAlert" | "refreshButton" | "settingsButton" | "onCollapse">} view
 * @param {Theme} t
 */
export const detailHeader = (view, t) =>
  headerBar(
    {
      icon: "issues",
      title: "Issues",
      secondary: "Detail",
      trailing: [view.failedEditAlert, view.refreshButton, view.settingsButton, collapseButton(view.onCollapse, t)],
    },
    t,
  );

/**
 * @param {DetailView} view
 * @param {Theme} t
 */
export function issueDetail(view, t) {
  const { issue, error, onBack } = view;
  return v_flex()
    .id("issue-detail")
    .size_full()
    .min_h(0)
    .child(detailHeader(view, t))
    .child(
      rowBeneathHeader(t)
        .gap(ACTION_GAP_PX)
        .child(actionButton({ id: "issue-back", icon: "chevron-left", tooltip: "Back to issues", onClick: onBack }, t))
        .child(div().flex_1().min_w(0))
        .child(editActions(view, t))
        .when(!view.editor && view.mergeable, (e) => e.child(mergeButton(view, t)))
        .when(!view.editor, (e) => e.child(workActions(view, t))),
    )
    .when(Boolean(error), (e) =>
      e.child(
        div()
          .flex_none()
          .px(14)
          .py(6)
          .text_size(11)
          .text_color(t.ansi1)
          .whitespace_normal()
          .child(error ?? ""),
      ),
    )
    .child(
      v_flex()
        .flex_none()
        .px(14)
        .py(10)
        .gap(8)
        .border_b(1)
        .border_color(t.border)
        .child(
          v_flex()
            .gap(2)
            .child(div().truncate().text_size(11).text_color(t.accent).child(issue.id))
            .child(div().whitespace_normal().text_size(16).font_semibold().child(issue.title)),
        )
        .child(facts(view, t)),
    )
    .child(
      h_flex()
        .flex_none()
        .flex_wrap()
        .px(14)
        .py(8)
        .gap(14)
        .items_center()
        .border_b(1)
        .border_color(t.border)
        .bg(/** @type {Color} */ (fieldBar(t)))
        .child(dropdown("status", "Status", view, t))
        .when(view.prioritized, (e) => e.child(dropdown("priority", "Priority", view, t))),
    )
    .child(div().flex_1().min_h(0).px(14).py(10).child(body(view, t)));
}
