// Status changes picked in the status menu, waiting to be committed together once they pause:
// { changedAt, issues: [{ root, id, file, status }] }. Shared, because the menu is a popup that closes
// long before the wait ends, so the panel commits them.
import { shared, setShared } from "herdr";
import { trackerFor } from "./trackers/index.js";

const PENDING = "issues.pendingStatusCommits";

export const pendingStatusCommits = () => /** @type {{ changedAt: number, issues: any[] } | null} */ (shared(PENDING) ?? null);

export function queueStatusCommit(root, issue, status) {
  const others = (pendingStatusCommits()?.issues ?? []).filter((each) => each.root !== root || each.id !== issue.id);
  setShared(PENDING, { changedAt: Date.now(), issues: [...others, { root, id: issue.id, file: issue.file, status }] });
}

export function takePendingStatusCommits() {
  const issues = pendingStatusCommits()?.issues ?? [];
  if (issues.length) setShared(PENDING, null);
  return issues;
}

// One commit per project.
export async function commitStatuses(issues) {
  const byRoot = new Map();
  for (const issue of issues) byRoot.set(issue.root, [...(byRoot.get(issue.root) ?? []), issue]);
  for (const [root, rootIssues] of byRoot) await (await trackerFor({ root }))?.commitStatuses?.(rootIssues);
}
