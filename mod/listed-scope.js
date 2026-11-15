// Names the list the panel shows as one line of text, for the collapsed strip's expand button: the tracker's
// name for a tracker with a single list, or the listed scope after its team, then a selected milestone,
// joined by " > ", e.g. "Web > Checkout redesign > Milestone 1". Also names the tracker in the panel's
// header, by its repository where it has one.
import { findScope } from "./trackers/linear.js";

const UNKNOWN_TRACKER_NAME = "Expand Issues";

export function listedScopeName(tracker, scopeId) {
  if (!tracker) return UNKNOWN_TRACKER_NAME;
  if (!tracker.scopes) return tracker.name || UNKNOWN_TRACKER_NAME;
  const { scope, project, milestone } = findScope(tracker.scopes, scopeId) ?? { scope: tracker.scopes[0] };
  const list = project ?? scope;
  return [list.team, list.label, milestone?.label].filter(Boolean).join(" > ");
}

// What the header shows after "Issues >": the tracker's repository where it has one, otherwise its name.
export const trackerTitle = (tracker) => tracker.repo ?? tracker.name;
