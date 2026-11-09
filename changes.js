// A stamp bumped whenever something outside the panel, such as a field menu or a merged pull request,
// changes an issue. Shared, so every copy of the panel refreshes instead of waiting for its next poll.
import { shared, setShared } from "herdr";

const CHANGED_AT = "issues.changedAt";

export const issuesChangedAt = () => shared(CHANGED_AT) ?? 0;
export const announceIssueChange = () => setShared(CHANGED_AT, Date.now());
