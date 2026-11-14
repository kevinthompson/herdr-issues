// Field edits shown at once and saved in the background. The field menu is a popup that closes as soon as
// an option is picked, so it hands the edit to the panel through shared state, and every copy of the panel
// shows it until the save lands. An edit whose save failed stays, marked failed, until it's dismissed.
// { [id]: { root, on, issueId, field, value, previous, failed?: string } }
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
