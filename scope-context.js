// Tells Claude sessions which issues the panel lists for a repository, and which issue it has open. Each
// repository's scope is a JSON file in the app's data folder, keyed by its main checkout, which a Claude hook
// (hooks/herdr-issues-scope.sh) adds to the context of sessions working in it:
// { repo, tracker, team, scope: { kind, label, project: { name, url }, milestone: { name } } }.
// The open issue is the shared value "issues.open", which Herdr keeps in shared.json for the same hook:
// { root, id, title, link }, root being the checkout the panel shows.
import { appHome, exec, readTextFile, writeTextFile, shared, setShared } from "herdr";
import { fileKey } from "./file-key.js";
import { findScope } from "./trackers/linear.js";

const folder = () => `${appHome()}/data/issues/scope`;

function describe(tracker, scopeId) {
  const { scope, project, milestone } = findScope(tracker.scopes, scopeId) ?? { scope: tracker.scopes[0] };
  const kind = milestone ? "milestone" : project ? "project" : scope.id.startsWith("view:") ? "view" : scope.id;
  return {
    kind,
    label: scope.label,
    project: project ? { name: project.label, url: project.url } : null,
    milestone: milestone ? { name: milestone.label } : null,
  };
}

// Writes only a scope that changed. Repositories whose tracker has a single list publish nothing.
export async function publishScope(repo, tracker, scopeId) {
  if (!tracker?.scopes) return;
  const text = JSON.stringify({ repo, tracker: tracker.kind, team: tracker.team ?? null, scope: describe(tracker, scopeId) }, null, 2);
  const path = `${folder()}/${fileKey(repo)}.json`, previous = await readTextFile(path).catch(() => null);
  if (previous === text) return;
  await exec("mkdir", ["-p", folder()]);
  await writeTextFile(path, text, previous);
}

const OPEN_ISSUE_KEY = "issues.open";

// Publishes the issue the panel shows, or null when it shows the list.
export function publishOpenIssue(root, issue) {
  const open = root && issue ? { root, id: issue.id, title: issue.title, link: issue.url ?? issue.path ?? null } : null;
  if (JSON.stringify(shared(OPEN_ISSUE_KEY) ?? null) !== JSON.stringify(open)) setShared(OPEN_ISSUE_KEY, open);
}
