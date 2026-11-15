// Changes an issue through its tracker for `issues status` and `issues start`, then tells every panel, so a
// status set from a Claude session shows at once without the hook that watches gh, bd and Linear's MCP calls.
// Each throws a ChangeRefusal, having changed nothing, for a read-only tracker, an unknown issue or a status the
// tracker can't set.
import { announceIssueChange } from "../mod/changes.js";

export class ChangeRefusal extends Error {}

async function changeIssue(tracker, id, change) {
  if (!tracker.writable) throw new ChangeRefusal(`${tracker.name} issues can't be changed here`);
  const issue = await tracker.get(id);
  if (!issue) throw new ChangeRefusal(`${id}: not found`);
  await change(issue);
  await announceIssueChange();
  return issue;
}

export async function setIssueStatus(tracker, id, status) {
  if (tracker.statuses && !tracker.statuses.includes(status)) {
    throw new ChangeRefusal(`${tracker.name} issues can't be set to ${status}; they can be set to ${tracker.statuses.join(", ")}`);
  }
  return changeIssue(tracker, id, (issue) => tracker.update(issue, { status }));
}

export const startIssue = (tracker, id) => changeIssue(tracker, id, (issue) => tracker.start(issue));
