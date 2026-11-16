// Field edits shown at once and saved in the background. The field menu is a popup that closes as soon as
// an option is picked, so it hands the edit to the panel through shared state, and every copy of the panel
// shows it until the save finishes. An edit whose save failed stays, marked failed, until it's dismissed.
// { [id]: { root, on, issueId, field, value, previous, failed?: string } }, or for labels,
// { [id]: { root, on, issueId, field: "labels", add, remove, failed?: string } }
import { shared, setShared } from "herdr";

const EDITS = "issues.edits";

export const fieldEdits = () => /** @type {Record<string, any>} */ (shared(EDITS) ?? {});

export function requestFieldEdit(edit) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  setShared(EDITS, { ...fieldEdits(), [id]: edit });
}

export function markEditFailed(id, message) {
  const edits = fieldEdits();
  if (edits[id]) setShared(EDITS, { ...edits, [id]: { ...edits[id], failed: message } });
}

export function forgetEdits(ids) {
  const edits = { ...fieldEdits() };
  for (const id of ids) delete edits[id];
  setShared(EDITS, edits);
}

// Module code is shared by every copy of the panel, so this keeps two copies from saving the same edit.
const claimed = new Set();
export function claimEdit(id) {
  if (claimed.has(id)) return false;
  claimed.add(id);
  return true;
}

// Shows the edit on the issue, or once its save failed, the issue as it was. A labels edit, { field: "labels",
// add, remove }, adds and removes only those labels, so two pending label edits both show.
export function showFieldEdit(issue, edit) {
  if (edit.field === "labels") {
    const [add, remove] = edit.failed ? [edit.remove, edit.add] : [edit.add, edit.remove];
    issue.labels = [
      ...issue.labels.filter((label) => !remove.includes(label)),
      ...add.filter((label) => !issue.labels.includes(label)),
    ];
  } else if (!edit.failed) issue[edit.field] = edit.value;
  else if (issue[edit.field] === edit.value) issue[edit.field] = edit.previous;
}

// The fields tracker.update saves for the edit.
export const trackerFields = (edit) =>
  edit.field === "labels" ? { addLabels: edit.add, removeLabels: edit.remove } : { [edit.field]: edit.value };
