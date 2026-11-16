// Tells Claude sessions which issues the panel lists for a repository, and which issue it has open. Each
// repository's scope is a JSON file in the app's data folder, keyed by its main checkout, which a Claude hook
// (claude-plugin/hooks/herdr-issues-scope.mjs) adds to the context of sessions working in it:
// { repo, tracker, team, scope: { id, kind, label, project: { name, url }, milestone: { name } } }, id being
// the scope's ID for `issues list`.
// The open issue is data/issues/open.json, which the same hook reads: { root, id, title, link }, root being
// the checkout the panel shows, or null while the panel shows its list.
import { appHome, exec, readTextFile, writeTextFile } from "herdr";
import { fileKey } from "./file-key.js";
import { findScope } from "./trackers/linear.js";
/** @import { Issue, Tracker } from "./trackers/index.js" */

const folder = () => `${appHome()}/data/issues/scope`;

/** @param {Tracker} tracker @param {string} [scopeId] */
function describe(tracker, scopeId) {
  const { scope, project, milestone } = findScope(tracker.scopes, scopeId) ?? { scope: tracker.scopes[0] };
  const kind = milestone ? "milestone" : project ? "project" : scope.id.startsWith("view:") ? "view" : scope.id;
  return {
    id: scope.id,
    kind,
    label: scope.label,
    project: project ? { name: project.label, url: project.url } : null,
    milestone: milestone ? { name: milestone.label } : null,
  };
}

// Writes only a scope that changed. Repositories whose tracker has a single list publish nothing.
/** @param {string} repo @param {Tracker | null | undefined} tracker @param {string} [scopeId] */
export async function publishScope(repo, tracker, scopeId) {
  if (!tracker?.scopes) return;
  const text = JSON.stringify(
    { repo, tracker: tracker.kind, team: tracker.team ?? null, scope: describe(tracker, scopeId) },
    null,
    2,
  );
  const path = `${folder()}/${fileKey(repo)}.json`,
    previous = await readTextFile(path).catch(/** @returns {string | null} */ () => null);
  if (previous === text) return;
  await exec("mkdir", ["-p", folder()]);
  await writeTextFile(path, text, previous);
}

/** @type {string | undefined} */
let publishedOpenIssue;

// Publishes the issue the panel shows, or null when it shows the list. Writes only an issue that changed.
/** @param {string | null} root @param {Issue | null} issue */
export async function publishOpenIssue(root, issue) {
  const text = JSON.stringify(
    root && issue ? { root, id: issue.id, title: issue.title, link: issue.url ?? null } : null,
  );
  if (text === publishedOpenIssue) return;
  publishedOpenIssue = text;
  const path = `${appHome()}/data/issues/open.json`;
  try {
    const previous = await readTextFile(path).catch(/** @returns {string | null} */ () => null);
    if (previous === text) return;
    await exec("mkdir", ["-p", `${appHome()}/data/issues`]);
    await writeTextFile(path, text, previous);
  } catch (e) {
    if (publishedOpenIssue === text) publishedOpenIssue = undefined;
    throw e;
  }
}
