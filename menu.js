// A dropdown for one field of an issue (status or priority). The issue view opens it as a popup of
// this same mod with props { menu: field, root, on, id, current, statuses }; picking an option hands the
// edit to the panel, which shows it at once and saves it.
// The panel's scope and milestone dropdowns are popups too, with props { menu: "scope", scopes, current, key }:
// scopes are { id, label, group?, subgroup? }, and headings name each group and subgroup where it starts.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, openOverlay, closeOverlay, theme, shared, setShared } from "herdr";
import { requestFieldEdit } from "./edits.js";
import { STATUSES, STATUS_LABELS, PRIORITIES } from "./issue.js";

const ROW = 28, PADDING = 5, WIDTH = 170;
// Group headings in a menu, filled like the issue list's status headings but in a neutral gray;
// subgroup headings are dimmed text under them.
const HEADING_HEIGHT = 22, HEADING_FILL = "#e2e2e230";

const OPTIONS = {
  status: STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
  priority: [1, 2, 3, 4, 0].map((value) => ({ value, label: PRIORITIES[value] })),
};

export function optionLabel(field, value) {
  return OPTIONS[field].find((option) => option.value === value)?.label ?? String(value);
}

// The tracker's statuses, in the menu's order.
const optionsFor = (field, statuses) => (field === "status" && statuses ? OPTIONS.status.filter((option) => statuses.includes(option.value)) : OPTIONS[field]);

export function openMenu(field, issue, project, statuses) {
  openOverlay({
    mod: "issues", kind: "popup", at: "pointer", width: WIDTH, height: optionsFor(field, statuses).length * ROW + PADDING * 2,
    props: { menu: field, ...project, id: issue.id, current: issue[field], statuses },
  });
}

function optionList(options, current, onPick) {
  const t = theme();
  return v_flex().id("issue-field-menu").size_full().overflow_y_scroll().p(PADDING).bg(t.popover).text_color(t.foreground).text_size(12.5)
    .children(options.map((option) => option.heading
      ? h_flex().id(`heading-${option.heading}`).h(ROW).flex_none().items_center()
        .child(div().w_full().h(HEADING_HEIGHT).px(9).flex().items_center().rounded(6).bg(HEADING_FILL)
          .text_size(11).font_semibold().text_color(t.foreground).child(option.heading))
      : option.subheading
      ? div().id(`subheading-${option.subheading}`).h(ROW).px(9).flex_none().flex().items_end().pb(4)
        .text_size(11).text_color(t.dim).child(option.subheading)
      : h_flex().id(`option-${option.value}`).h(ROW).px(9).gap(9).flex_none().items_center()
      .rounded(6).cursor_pointer().hover((s) => s.bg(t.selected)).on_click((_e, cx) => onPick(option, cx))
      .child(div().flex_1().truncate().child(option.label))
      .child(div().flex_none().text_color(t.muted).child(option.value === current ? "✓" : ""))));
}

// The scope each repository lists, by its main checkout: { "<path>": "<scope id>" }. Shared, so every
// copy of the panel lists the same issues and the choice outlives a reload.
const SCOPES = "issues.scopes";
const selections = () => /** @type {Record<string, string>} */ (shared(SCOPES) ?? {});
export const selectedScope = (key) => selections()[key];

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

export function openScopeMenu(scopes, current, key) {
  const listed = scopes.map(({ id, label, group, subgroup }) => ({ id, label, group, subgroup }));
  openOverlay({
    mod: "issues", kind: "popup", at: "pointer", width: SCOPE_MENU_WIDTH,
    height: Math.min(scopeOptions(listed).length * ROW + PADDING * 2, SCOPE_MENU_MAX_HEIGHT),
    props: { menu: "scope", scopes: listed, current, key },
  });
}

export class ScopeMenu {
  render() {
    const { scopes, current, key, overlay } = props();
    return optionList(scopeOptions(scopes), current, (option) => {
      setShared(SCOPES, { ...selections(), [key]: option.value });
      closeOverlay(overlay);
    });
  }
}

export class FieldMenu {
  pick(option) {
    const { menu: field, root, on, id, current, overlay } = props();
    if (option.value !== current) requestFieldEdit({ root, on: on ?? null, issueId: id, field, value: option.value, previous: current });
    closeOverlay(overlay);
  }

  render() {
    const { menu: field, current, statuses } = props();
    return optionList(optionsFor(field, statuses), current, (option) => this.pick(option));
  }
}
