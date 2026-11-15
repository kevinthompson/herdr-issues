import assert from "node:assert/strict";
import { test } from "node:test";
import { showFieldEdit, trackerFields } from "../mod/edits.js";

const labelsEdit = (add, remove, failed) => ({ issueId: "1", field: "labels", add, remove, ...(failed && { failed }) });

test("a labels edit shows only its own labels added and removed, however often it's shown", () => {
  const issue = { labels: ["bug", "ui"] };
  for (let shown = 0; shown < 2; shown++) {
    showFieldEdit(issue, labelsEdit(["docs"], []));
    showFieldEdit(issue, labelsEdit([], ["bug"]));
  }
  assert.deepEqual(issue.labels, ["ui", "docs"]);
});

test("a failed labels edit shows the labels as they were", () => {
  const issue = { labels: ["ui", "docs"] };
  showFieldEdit(issue, labelsEdit(["docs"], ["bug"], "Could not change the labels"));
  assert.deepEqual(issue.labels, ["ui", "bug"]);
});

test("a labels edit saves as the labels to add and remove", () => {
  assert.deepEqual(trackerFields(labelsEdit(["docs"], ["bug"])), { addLabels: ["docs"], removeLabels: ["bug"] });
  assert.deepEqual(trackerFields({ field: "status", value: "done" }), { status: "done" });
});

test("a failed field edit puts the field back only while it still shows the edit", () => {
  const issue = { status: "done" };
  showFieldEdit(issue, { field: "status", value: "done", previous: "todo", failed: "Could not" });
  assert.equal(issue.status, "todo");
  issue.status = "in-review";
  showFieldEdit(issue, { field: "status", value: "done", previous: "todo", failed: "Could not" });
  assert.equal(issue.status, "in-review");
});
