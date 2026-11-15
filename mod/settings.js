// The focused repository's settings, which the gear in the panel's header opens in place of the list, with Back
// at the top left as the setup view (setup.js) has: how its work gets into main, and, for a pull request, when
// the work is complete, its merge and complete in issues.json. It opens on the settings in effect, defaults
// applied, as `issues setting` prints them. Save writes only those two keys (saveMergeSettings in setting.js)
// and goes back to the list; a failed save shows its error and stays.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { button, collapseButton } from "./detail.js";
import { MERGE_CHOICES } from "./setup.js";
import { mergeSettings, saveMergeSettings } from "./trackers/setting.js";

const COMPLETE_CHOICES = [
  { id: "pull-request-open", label: "Once the pull request is open", detail: "Once the branch is pushed with an open pull request, while it waits for review." },
  { id: "merged", label: "Once it merges", detail: "Once the branch is in main." },
];
const COMPLETE_SENTENCE = "When a session can finish and the issue's worktree is safe to close.";
const COMPLETE_WITHOUT_PULL_REQUEST = "Once it merges: without a pull request, the work is complete once its branch is in main.";
const DEFAULT_COMPLETE = "pull-request-open";

export class MergeSettingsView {
  // project: the focused { root, on }; main: its repository's main checkout. onSaved(cx) runs once they're written.
  constructor(project, main, { onBack, onSaved }) {
    this.project = project; this.main = main; this.onBack = onBack; this.onSaved = onSaved;
    this.saved = null; this.merge = null; this.complete = null;
    this.loading = true; this.saving = false; this.error = null;
  }

  load(cx) {
    cx.spawn(async (cx) => {
      try {
        this.saved = await mergeSettings(this.project);
        Object.assign(this, this.saved);
      } catch (e) { this.error = String(e.message ?? e); }
      finally { this.loading = false; cx.notify(); }
    });
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

  changed() {
    return Boolean(this.merge) && (this.merge !== this.saved?.merge || this.complete !== this.saved?.complete);
  }

  save(cx) {
    if (this.saving || !this.changed()) return;
    const choice = { merge: this.merge, complete: this.merge === "pull-request" ? this.complete : null };
    Object.assign(this, { saving: true, error: null });
    cx.spawn(async (cx) => {
      try {
        await saveMergeSettings(this.main, choice);
        this.onSaved(cx);
      } catch (e) { this.error = `Could not save: ${e.message ?? e}`; }
      finally { this.saving = false; cx.notify(); }
    });
    cx.notify();
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
    const pullRequest = this.merge === "pull-request";
    return this.question(content, "How does work get into main?", null, t)
      .child(this.options("merge", MERGE_CHOICES, this.merge, (id, cx) => this.chooseMerge(id, cx), t))
      .child(this.question(v_flex().flex_none().gap(12).pt(4), "When is the work complete?", COMPLETE_SENTENCE, t)
        .when(pullRequest, (e) => e.child(this.options("complete", COMPLETE_CHOICES, this.complete, (id, cx) => this.chooseComplete(id, cx), t)))
        .when(!pullRequest && Boolean(this.merge), (e) => e.child(div().whitespace_normal().text_size(12).text_color(t.foreground).child(COMPLETE_WITHOUT_PULL_REQUEST))))
      .when(Boolean(this.error), (e) => e.child(div().whitespace_normal().text_size(12).text_color(t.ansi1).child(this.error ?? "")))
      .child(h_flex().gap(8).items_center()
        .child(button("settings-save", this.saving ? "Saving…" : "Save", (cx) => this.save(cx), t, { primary: true, enabled: !this.saving && this.changed() })));
  }

  question(content, title, sentence, t) {
    return content.child(div().font_semibold().child(title))
      .when(Boolean(sentence), (e) => e.child(div().whitespace_normal().text_size(12).text_color(t.muted).child(sentence ?? "")));
  }

  // Each choice with what it means; the chosen one is solid.
  options(kind, choices, chosen, onChoose, t) {
    return v_flex().flex_none().gap(12).children(choices.map(({ id, label, detail }) => v_flex().flex_none().gap(4)
      .child(h_flex().child(button(`settings-${kind}-${id}`, label, (cx) => onChoose(id, cx), t, { primary: id === chosen, enabled: !this.saving })))
      .child(div().whitespace_normal().text_size(12).text_color(t.dim).child(detail))));
  }
}
