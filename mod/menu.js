// A dropdown for one field of an issue (status or priority). The issue view opens it as a popup of
// this same mod with props { menu: field, root, on, id, current, statuses }; picking an option hands the
// edit to the panel, which shows it at once and saves it. The issue's labels dropdown is a popup too, with props
// { menu: "labels", root, on, id, groups, current }, listing the applied labels above a divider and the rest below,
// where picking a label checks or unchecks it.
// The panel's scope, milestone and label dropdowns, and the settings view's scope, are popups too, with props { menu: "scope", scopes, current, key, store }:
// scopes are { id, label, group?, subgroup? }, and headings name each group and subgroup where it starts:
// a group's in capitals on a tinted band between dividers that span the menu, and a subgroup's dimmed,
// so neither looks like an option to pick.
import { div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, openOverlay, closeOverlay, theme, shared, setShared } from "herdr";
import { requestFieldEdit } from "./edits.js";
import { labelGroups } from "./label-order.js";
import { STATUSES, STATUS_LABELS, PRIORITIES, statusIcon } from "./issue.js";

const ROW = 28,
  PADDING = 5,
  WIDTH = 170,
  TEXT_INSET = 9,
  DIVIDER_GAP = 4,
  ICON_PX = 16,
  ICON_GAP = 6,
  CHECK_GAP = 9;
// The theme's text color at this opacity, so the band follows light and dark themes.
const HEADING_TINT_ALPHA = "0a";
const headingTint = (t) => (/^#[0-9a-f]{6}$/i.test(t.foreground) ? t.foreground + HEADING_TINT_ALPHA : "transparent");

const OPTIONS = {
  status: STATUSES.map((value) => ({ value, label: STATUS_LABELS[value], icon: statusIcon(value) })),
  priority: [1, 2, 3, 4, 0].map((value) => ({ value, label: PRIORITIES[value] })),
};

export function optionLabel(field, value) {
  return OPTIONS[field].find((option) => option.value === value)?.label ?? String(value);
}

// The tracker's statuses, in the menu's order.
const optionsFor = (field, statuses) =>
  field === "status" && statuses ? OPTIONS.status.filter((option) => statuses.includes(option.value)) : OPTIONS[field];

export function openMenu(field, issue, project, statuses) {
  openOverlay({
    mod: "issues",
    kind: "popup",
    at: "pointer",
    width: WIDTH,
    height: optionsFor(field, statuses).length * ROW + PADDING * 2,
    props: { menu: field, ...project, id: issue.id, current: issue[field], statuses },
  });
}

function optionList(options, isChecked, onPick) {
  const t = theme();
  return v_flex()
    .id("issue-field-menu")
    .size_full()
    .overflow_y_scroll()
    .py(PADDING)
    .bg(t.popover)
    .text_color(t.foreground)
    .text_size(12.5)
    .children(
      options.map((option, index) =>
        option.divider
          ? div().id(`divider-${index}`).flex_none().my(DIVIDER_GAP).border_t(1).border_color(t.border)
          : option.heading
            ? div()
                .id(`heading-${option.heading}`)
                .h(ROW)
                .px(PADDING + TEXT_INSET)
                .flex_none()
                .flex()
                .items_center()
                .mb(DIVIDER_GAP)
                .bg(headingTint(t))
                .border_b(1)
                .border_color(t.border)
                .when(index > 0, (e) => e.mt(DIVIDER_GAP).border_t(1))
                .text_size(10.5)
                .font_semibold()
                .text_color(t.muted)
                .child(option.heading.toUpperCase())
            : option.subheading
              ? div()
                  .id(`subheading-${option.subheading}`)
                  .h(ROW)
                  .px(PADDING + TEXT_INSET)
                  .flex_none()
                  .flex()
                  .items_end()
                  .pb(4)
                  .text_size(11)
                  .text_color(t.dim)
                  .child(option.subheading)
              : h_flex()
                  .id(`option-${option.value}`)
                  .h(ROW)
                  .mx(PADDING)
                  .px(TEXT_INSET)
                  .gap(ICON_GAP)
                  .flex_none()
                  .items_center()
                  .rounded(6)
                  .cursor_pointer()
                  .hover((s) => s.bg(t.selected))
                  .on_click((_e, cx) => onPick(option, cx))
                  .when(Boolean(option.icon), (e) => e.child(image(option.icon).flex_none().size(ICON_PX)))
                  .child(div().flex_1().truncate().child(option.label))
                  .child(
                    div()
                      .flex_none()
                      .ml(CHECK_GAP - ICON_GAP)
                      .text_color(t.muted)
                      .child(isChecked(option.value) ? "✓" : ""),
                  ),
      ),
    );
}

// The scope each repository lists, and the label it narrows the list to, by its main checkout:
// { "<path>": "<scope id or label>" }. Shared, so every copy of the panel lists the same issues and the
// choice outlives a reload.
const SCOPES = "issues.scopes",
  LABELS = "issues.labels";
const selections = (store) => /** @type {Record<string, string>} */ (shared(store) ?? {});
export const selectedScope = (key) => selections(SCOPES)[key];
export const selectedLabel = (key) => selections(LABELS)[key] || null;

const SCOPE_MENU_WIDTH = 280;
const SCOPE_MENU_MAX_HEIGHT = 440;

// The scopes as menu options, with a heading before each group and a subheading before each subgroup.
function scopeOptions(scopes) {
  return scopes.flatMap((scope, index) => {
    const previous = scopes[index - 1];
    const startsGroup = scope.group && scope.group !== previous?.group;
    const startsSubgroup = scope.subgroup && (startsGroup || scope.subgroup !== previous?.subgroup);
    return [
      ...(startsGroup ? [{ heading: scope.group }] : []),
      ...(startsSubgroup ? [{ subheading: scope.subgroup }] : []),
      { value: scope.id, label: scope.label },
    ];
  });
}

const DIVIDER_HEIGHT = DIVIDER_GAP * 2 + 1;
const menuHeight = (options) =>
  options.reduce(
    (height, option, index) =>
      height + (option.divider ? DIVIDER_HEIGHT : ROW + (option.heading ? DIVIDER_GAP * (index > 0 ? 2 : 1) : 0)),
    PADDING * 2,
  );

export function openScopeMenu(scopes, current, key, store = SCOPES) {
  const listed = scopes.map(({ id, label, group, subgroup }) => ({ id, label, group, subgroup }));
  openOverlay({
    mod: "issues",
    kind: "popup",
    at: "pointer",
    width: SCOPE_MENU_WIDTH,
    height: Math.min(menuHeight(scopeOptions(listed)), SCOPE_MENU_MAX_HEIGHT),
    props: { menu: "scope", scopes: listed, current, key, store },
  });
}

const ALL_LABELS = "";
// "All labels", then each label by name.
export function openLabelMenu(labels, current, key) {
  const options = [{ id: ALL_LABELS, label: "All labels" }, ...labels.map((label) => ({ id: label, label }))];
  openScopeMenu(options, current ?? ALL_LABELS, key, LABELS);
}

export class ScopeMenu {
  render() {
    const { scopes, current, key, store, overlay } = props();
    return optionList(
      scopeOptions(scopes),
      (value) => value === current,
      (option) => {
        setShared(store, { ...selections(store), [key]: option.value });
        closeOverlay(overlay);
      },
    );
  }
}

export class FieldMenu {
  pick(option) {
    const { menu: field, root, on, id, current, overlay } = props();
    if (option.value !== current)
      requestFieldEdit({ root, on: on ?? null, issueId: id, field, value: option.value, previous: current });
    closeOverlay(overlay);
  }

  render() {
    const { menu: field, current, statuses } = props();
    return optionList(
      optionsFor(field, statuses),
      (value) => value === current,
      (option) => this.pick(option),
    );
  }
}

const LABELS_MENU_WIDTH = 240;
const LABELS_MENU_MAX_HEIGHT = 360;

// The issue's labels, checked, then a divider when both groups have labels, then the tracker's others.
function issueLabelOptions({ applied, others }) {
  const toOption = (label) => ({ value: label, label });
  return [
    ...applied.map(toOption),
    ...(applied.length && others.length ? [{ divider: true }] : []),
    ...others.map(toOption),
  ];
}

// The tracker's labels are `names`.
export function openIssueLabelsMenu(issue, project, names) {
  const groups = labelGroups(names, issue.labels);
  openOverlay({
    mod: "issues",
    kind: "popup",
    at: "pointer",
    width: LABELS_MENU_WIDTH,
    height: Math.min(menuHeight(issueLabelOptions(groups)), LABELS_MENU_MAX_HEIGHT),
    props: { menu: "labels", ...project, id: issue.id, groups, current: issue.labels },
  });
}

// Checking a label adds it and unchecking one removes it, at once, leaving the issue's other labels alone.
export class LabelMenu {
  render() {
    const { groups, current, root, on, id, overlay } = props();
    return optionList(
      issueLabelOptions(groups),
      (label) => current.includes(label),
      (option) => {
        const checked = current.includes(option.value);
        requestFieldEdit({
          root,
          on: on ?? null,
          issueId: id,
          field: "labels",
          add: checked ? [] : [option.value],
          remove: checked ? [option.value] : [],
        });
        closeOverlay(overlay);
      },
    );
  }
}
