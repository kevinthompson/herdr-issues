// Changes an issue through its tracker for `issues status`, `issues start`, `issues edit`, `issues check` and
// `issues label`, then tells every panel, so a change made from a Claude session shows at once without the hook that
// watches gh, bd and Linear's MCP calls. Each throws a ChangeRefusal, having changed nothing, for a read-only tracker,
// an unknown issue, a status the tracker can't set, a body that changed since its caller read it or an unchecked item
// number the body doesn't have; the tracker itself refuses an unknown label.
import { createHash } from "node:crypto";
import { announceIssueChange } from "../mod/changes.js";

export class ChangeRefusal extends Error {}

// An unchecked item number, given to checkIssueItems to leave unchecked, that the body has no item for.
export class MissingItemRefusal extends ChangeRefusal {}

const UNCHANGED = Symbol("unchanged");

async function changeIssue(tracker, id, change) {
  if (!tracker.writable) throw new ChangeRefusal(`${tracker.name} issues can't be changed here`);
  const issue = await tracker.get(id);
  if (!issue) throw new ChangeRefusal(`${id}: not found`);
  if ((await change(issue)) !== UNCHANGED) await announceIssueChange();
  return issue;
}

export async function setIssueStatus(tracker, id, status) {
  if (tracker.statuses && !tracker.statuses.includes(status)) {
    throw new ChangeRefusal(
      `${tracker.name} issues can't be set to ${status}; they can be set to ${tracker.statuses.join(", ")}`,
    );
  }
  return changeIssue(tracker, id, (issue) => tracker.update(issue, { status }));
}

export const startIssue = (tracker, id) => changeIssue(tracker, id, (issue) => tracker.start(issue));

// What `issues show --json` prints as bodyHash, so `issues edit` can tell whether the body it saves over is the
// one its caller read.
export const bodyHash = (body) =>
  createHash("sha256")
    .update(body ?? "")
    .digest("hex");

// Only a body whose hash is readBodyHash is the one the caller read, so only then is the issue handed to
// tracker.update; its own guard then refuses a change made after this check.
export function editIssueBody(tracker, id, { body, readBodyHash }) {
  return changeIssue(tracker, id, async (issue) => {
    if (bodyHash(issue.body) !== readBodyHash)
      throw new ChangeRefusal(`${issue.id}: the body changed since it was read; read it again with issues show --json`);
    await tracker.update(issue, { body });
  });
}

const UNCHECKED_ITEM = /^([ \t]*[-*+][ \t]+)\[ \]([ \t].*|)$/gm;

// Checks every unchecked task-list item in the body but those numbered in keepUnchecked, counting unchecked items
// from 1 in body order, and returns the texts of the items checked and of those left. A body with nothing to check
// is left unsaved.
export async function checkIssueItems(tracker, id, { keepUnchecked = [] } = {}) {
  const items = { checked: [], left: [] };
  const issue = await changeIssue(tracker, id, async (issue) => {
    const body = issue.body ?? "";
    const uncheckedCount = body.match(UNCHECKED_ITEM)?.length ?? 0;
    const missing = keepUnchecked.find((number) => number > uncheckedCount);
    if (missing)
      throw new MissingItemRefusal(`${issue.id} has ${uncheckedCount} unchecked items, so none is number ${missing}`);
    let number = 0;
    const checkedBody = body.replace(UNCHECKED_ITEM, (item, marker, text) => {
      const keep = keepUnchecked.includes(++number);
      items[keep ? "left" : "checked"].push(text.trim());
      return keep ? item : `${marker}[x]${text}`;
    });
    if (!items.checked.length) return UNCHANGED;
    await tracker.update(issue, { body: checkedBody });
  });
  return { issue, ...items };
}

export const changeIssueLabels = (tracker, id, { addLabels, removeLabels }) =>
  changeIssue(tracker, id, (issue) => tracker.update(issue, { addLabels, removeLabels }));
