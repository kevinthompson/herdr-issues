// A dropdown for one field of an issue (status or priority). The issue view opens it as a popup of
// this same mod with props { menu: field, root, on, id, current, statuses }; picking an option saves it.
// The panel's scope dropdown is a popup too, with props { menu: "scope", scopes, current, key }.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, openOverlay, closeOverlay, theme, notify, shared, setShared } from "herdr";
import { trackerFor } from "./trackers/index.js";
import { announceIssueChange } from "./changes.js";
import { queueStatusCommit } from "./status-commits.js";
import { STATUSES, STATUS_LABELS, PRIORITIES } from "./issue.js";

const ROW = 28, PADDING = 5, WIDTH = 170;

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

function optionList(options, current, busy, onPick) {
  const t = theme();
  return v_flex().id("issue-field-menu").size_full().p(PADDING).bg(t.popover).text_color(t.foreground).text_size(12.5)
    .children(options.map((option) => h_flex().id(`option-${option.value}`).h(ROW).px(9).gap(9).flex_none().items_center()
      .rounded(6).cursor_pointer().hover((s) => s.bg(t.selected)).on_click((_e, cx) => onPick(option, cx))
      .child(div().flex_1().truncate().child(option.label))
      .child(div().flex_none().text_color(t.muted).child(busy === option.value ? "…" : option.value === current ? "✓" : ""))));
}

// The scope each repository lists, by its main checkout: { "<path>": "<scope id>" }. Shared, so every
// copy of the panel lists the same issues and the choice outlives a reload.
const SCOPES = "issues.scopes";
const selections = () => /** @type {Record<string, string>} */ (shared(SCOPES) ?? {});
export const selectedScope = (key) => selections()[key];

const SCOPE_MENU_WIDTH = 220;

export function openScopeMenu(scopes, current, key) {
  openOverlay({
    mod: "issues", kind: "popup", at: "pointer", width: SCOPE_MENU_WIDTH, height: scopes.length * ROW + PADDING * 2,
    props: { menu: "scope", scopes, current, key },
  });
}

export class ScopeMenu {
  render() {
    const { scopes, current, key, overlay } = props();
    const options = scopes.map((scope) => ({ value: scope.id, label: scope.label }));
    return optionList(options, current, null, (option) => {
      setShared(SCOPES, { ...selections(), [key]: option.value });
      closeOverlay(overlay);
    });
  }
}

export class FieldMenu {
  pick(option, cx) {
    const { menu: field, root, on, id, current, overlay } = props();
    if (this.busy) return;
    if (option.value === current) return closeOverlay(overlay);
    this.busy = option.value; cx.notify();
    cx.spawn(async (cx) => {
      try {
        const tracker = await trackerFor({ root, on }), issue = await tracker?.get(id);
        if (!issue) throw new Error(`${id} was not found`);
        await tracker.update(issue, { [field]: option.value });
        if (field === "status" && tracker.commitStatuses) queueStatusCommit(root, issue, option.value);
        announceIssueChange();
      } catch (e) {
        notify({ title: `Could not change ${field}`, body: String(e.message ?? e), level: "error" });
      }
      closeOverlay(overlay);
      cx.notify();
    });
  }

  render() {
    const { menu: field, current, statuses } = props();
    return optionList(optionsFor(field, statuses), current, this.busy, (option, cx) => this.pick(option, cx));
  }
}
