#!/usr/bin/env node
// UserPromptSubmit hook: in a Herdr terminal, tells Claude which issues the Herdr
// issues panel lists for the session's repository, as the panel publishes them in
// ~/.config/herdr-app/data/issues/scope, and which issue the panel has open in the
// session's checkout, as it publishes it in data/issues/open.json. It speaks only when one of
// them differs from what it last told this session.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

const git = (cwd, ...args) => {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

function scopeText(published) {
  const { scope, tracker, team } = published;
  const project = scope.project
    ? `the project "${scope.project.name}"${scope.project.url ? ` (${scope.project.url})` : ""}`
    : null;
  const what =
    {
      milestone: () => `the milestone "${scope.milestone?.name}" of ${project}`,
      project: () => project,
      mine: () => "the open issues assigned to me, across every team",
      team: () => `the ${team} team's open issues outside its Triage state`,
      triage: () => `the ${team} team's issues in its Triage state`,
    }[scope.kind]?.() ?? `the saved view "${scope.label}"`;
  const trackerName = tracker ? tracker[0].toUpperCase() + tracker.slice(1) : "";
  const teamClause = team && scope.kind !== "mine" ? `, team ${team}` : "";
  // A scope published before the panel added its ID can't be named, so the list of scopes stands in.
  const listCommand = scope.id
    ? `\`issues list ${scope.id}\` prints its open issues`
    : "`issues scopes` names the panel's lists and `issues list <scope>` prints one's open issues";
  return (
    `The Herdr issues panel for this repository lists ${what} in ${trackerName}${teamClause}. ` +
    "Open means not completed, canceled, a duplicate or in a state named Merged. " +
    `${listCommand}, exactly as the panel lists them. ` +
    "When I refer to the issues, the project or the milestone without naming one, or ask to start the next issues, I mean this scope."
  );
}

function publishedScope(scopeFolder, repo) {
  let files;
  try {
    files = readdirSync(scopeFolder)
      .filter((file) => file.endsWith(".json"))
      .sort();
  } catch {
    return "";
  }
  for (const file of files) {
    const published = readJson(join(scopeFolder, file));
    if (published?.repo === repo && published.scope) return scopeText(published);
  }
  return "";
}

function openIssueText(openPath, checkout) {
  const open = readJson(openPath);
  if (open?.root !== checkout) return "";
  return (
    `The Herdr issues panel has ${open.id} open: "${open.title}"${open.link ? ` (${open.link})` : ""}. ` +
    `When I say "this issue" without naming one, I mean ${open.id}.`
  );
}

// Prints the text when it differs from what this session was last told under the name, and remembers it.
function announce(stateFolder, session, name, text, closedText = "") {
  const stateFile = join(stateFolder, `${session}.${name}`);
  let previous = null;
  try {
    previous = readFileSync(stateFile, "utf8");
  } catch {}
  if (previous === text) return;
  if (text) console.log(text);
  else if (previous && closedText) console.log(closedText);
  writeFileSync(stateFile, text);
}

function main() {
  if (!process.env.HC_TERMINAL_ID) return;

  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }
  const { session_id: session, cwd } = input ?? {};
  if (!session || !cwd) return;

  const common = git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const checkout = common && git(cwd, "rev-parse", "--show-toplevel");
  if (!checkout) return;
  const repo = dirname(common);
  const appHome = process.env.HERDR_APP_HOME || join(homedir(), ".config/herdr-app");

  const scope = publishedScope(join(appHome, "data/issues/scope"), repo);
  const openIssue = openIssueText(join(appHome, "data/issues/open.json"), checkout);

  const stateFolder = join(process.env.TMPDIR || tmpdir(), "claude-herdr-issues-scope");
  mkdirSync(stateFolder, { recursive: true });
  announce(stateFolder, session, "scope", scope);
  announce(
    stateFolder,
    session,
    "open",
    openIssue,
    'The Herdr issues panel no longer has an issue open, so "this issue" no longer refers to one from it.',
  );
}

main();
