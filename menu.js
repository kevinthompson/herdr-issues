// A dropdown for one field of an issue (status or priority). The issue view opens it as a popup of
// this same mod with props { menu: field, root, on, id, current }; picking an option saves it.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, openOverlay, closeOverlay, theme, notify } from "herdr";
import { trackerFor } from "./trackers/index.js";
import { STATUSES, STATUS_LABELS, PRIORITIES } from "./issue.js";

const ROW = 28, PADDING = 5, WIDTH = 170;

const OPTIONS = {
  status: STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
  priority: [1, 2, 3, 4, 0].map((value) => ({ value, label: PRIORITIES[value] })),
};

export function optionLabel(field, value) {
  return OPTIONS[field].find((option) => option.value === value)?.label ?? String(value);
}

export function openMenu(field, issue, project) {
  openOverlay({
    mod: "issues", kind: "popup", at: "pointer", width: WIDTH, height: OPTIONS[field].length * ROW + PADDING * 2,
    props: { menu: field, ...project, id: issue.id, current: issue[field] },
  });
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
      } catch (e) {
        notify({ title: `Could not change ${field}`, body: String(e.message ?? e), level: "error" });
      }
      closeOverlay(overlay);
      cx.notify();
    });
  }

  render() {
    const t = theme(), { menu: field, current } = props();
    return v_flex().id("issue-field-menu").size_full().p(PADDING).bg(t.popover).text_color(t.foreground).text_size(12.5)
      .children(OPTIONS[field].map((option) => h_flex().id(`option-${option.value}`).h(ROW).px(9).gap(9).flex_none().items_center()
        .rounded(6).cursor_pointer().hover((s) => s.bg(t.selected)).on_click((_e, cx) => this.pick(option, cx))
        .child(div().flex_1().child(option.label))
        .child(div().flex_none().text_color(t.muted).child(this.busy === option.value ? "…" : option.value === current ? "✓" : ""))));
  }
}
