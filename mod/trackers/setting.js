// Each repository's choice of tracker, in ~/.config/herdr-app/issues.json, which /issues:config writes. Repositories
// are keyed by their main checkout's path, ~ for the home folder, so worktrees share their repository's choice:
// { "pollSeconds": 120,                                             how often every panel polls its tracker
//   "updateCheckHours": 6,                                          how often the panel checks for its own update
//   "repos": {
//     "~/Code/web":      { "tracker": "linear", "team": "WEB",      a Linear team, with saved views as extra lists
//                          "views": { "<name>": "https://linear.app/…/view/…" } },
//     "~/Code/app":      { "tracker": "github", "repo": "owner/name",   its GitHub issues; repo defaults to origin's
//                          "spaceName": "<repo><issueId>",            names issue spaces (space-name.js), here app#41
//                          "merge": "pull-request", "complete": "merged", "close": "auto",
//                          "worktreeSetup": "npm install", "pollSeconds": 30 },
//     "~/Code/notes":    { "tracker": "beads" } } }                   the Beads database in its .beads folder
// pollSeconds, at the top level and in any entry, is how often the panel asks the tracker for its list, a whole number
// of seconds of at least 10; an entry's overrides the top level's, and pollSettings resolves it, 60 without either.
// updateCheckHours, at the top level only, is how often the panel fetches its own checkout's origin to offer an
// update (update.js), a whole number of hours of at least 1; updateSettings resolves it, 6 without it.
// spaceName, merge, complete and worktreeSetup are optional in any entry. In spaceName, <issueId> is the issue's ID
// and <repo> the repository's name without its owner; without it, an issue's space is named after its ID. merge is
// how an issue's branch gets into main, and complete is when its work counts as complete; mergeSettings says what
// each value means and resolves their defaults. worktreeSetup is a shell command `issues worktree` runs in each new
// checkout (cli/worktree.js). close, also optional in any entry, is what a finished /issues:work session does about
// its worktree: manual tells the person to close it with cmd+shift+w, ask asks whether to close it now, and auto
// closes it, the last two with `issues close`; closeSettings resolves it, ask without it.
// name, also optional in any entry, names the space `issues worktree` and the worktree dialog open on the main
// checkout, which the sidebar nests worktree spaces under; nameSettings resolves it, the repository's name without
// its owner without it or when it's blank.
// workModel and workEffort, at the top level and in any entry, an entry's winning, are the model and effort of the
// Claude sessions Start, Continue and `issues worktree --claude` open to work an issue: workModel is inherit (the
// person's own Claude Code model), a model alias such as sonnet, or a model's full name; workEffort is default
// (left unset), low, medium, high, xhigh or max; inherit and default without either. workSettings resolves them.
// Any model or effort the mod or its skills choose is a setting like these, with a default. Keys it doesn't know,
// such as retired settings, are ignored and kept when an entry is saved.
// The file holds no secrets, so it can be shared between machines; Linear's API key stays in the macOS Keychain.
// Without an entry, a repository uses Linear. Only this computer's repositories have entries. The panel's setup
// view (setup.js) writes an entry too, with saveSetupChoices, and its settings view (settings.js) changes an entry's
// tracker with saveTrackerChoice, its merge and complete with saveMergeSettings, its close with saveCloseSetting, its
// name with saveNameSetting, its pollSeconds, spaceName and worktreeSetup with saveRepositorySettings, and its model
// and effort settings with saveAgentSettings.
import { appHome, home, readTextFile, writeTextFile } from "herdr";
import { mainCheckout } from "../location.js";
import { cachedLookup, forgetLookups } from "../lookups.js";
import { githubRepository } from "./github.js";
import { badMergeSetting, badSetting, settingsUnreadable } from "./problems.js";

export const settingsPath = () => `${appHome()}/issues.json`;
const TRACKERS = ["linear", "github", "beads"];
const MERGES = ["auto", "review", "pull-request"];
const COMPLETES = ["merged", "pull-request-open", "pull-request-passing"];
export const PULL_REQUEST_COMPLETES =["pull-request-open", "pull-request-passing"];
export const CLOSES = ["manual", "ask", "auto"];
export const DEFAULT_CLOSE = "ask";
export const DEFAULT_POLL_SECONDS = 60;
const MIN_POLL_SECONDS = 10;
export const DEFAULT_UPDATE_CHECK_HOURS = 6;
const MIN_UPDATE_CHECK_HOURS = 1;
export const EFFORTS = ["default", "low", "medium", "high", "xhigh", "max"];
export const SUGGESTED_WORK_MODELS = ["inherit", "sonnet", "opus", "haiku"];
export const DEFAULT_WORK_MODEL = "inherit";
export const DEFAULT_WORK_EFFORT = "default";
const expandHome = (path) => (path.startsWith("~/") ? `${home()}${path.slice(1)}` : path);
const abbreviateHome = (path) => (path.startsWith(`${home()}/`) ? `~${path.slice(home().length)}` : path);

function parseSettings(text) {
  try { return JSON.parse(text); } catch (e) { throw settingsUnreadable(`issues.json isn't valid JSON: ${e.message ?? e}`); }
}

const cachedSettings = cachedLookup();
const readSettings = () => cachedSettings("issues.json", async () => {
  const text = await readTextFile(settingsPath()).catch(() => null);
  return text === null ? null : parseSettings(text);
});

function checkPollSeconds(value, where) {
  if (value == null || (Number.isInteger(value) && value >= MIN_POLL_SECONDS)) return;
  throw badSetting(`${where} needs a pollSeconds that's a whole number of seconds, ${MIN_POLL_SECONDS} or more`);
}

function checkUpdateCheckHours(value) {
  if (value == null || (Number.isInteger(value) && value >= MIN_UPDATE_CHECK_HOURS)) return;
  throw badSetting(`issues.json needs an updateCheckHours that's a whole number of hours, ${MIN_UPDATE_CHECK_HOURS} or more`);
}

function checkChoice(value, name, choices, where) {
  if (value != null && !choices.includes(value)) throw badSetting(`${where} needs a ${name} of ${choices.join(", ")}`);
}

const isModelName = (model) => typeof model === "string" && /^\S+$/.test(model);

function checkWorkSettings(settings, where) {
  const model = settings?.workModel;
  if (model != null && !isModelName(model)) {
    throw badSetting(`${where} needs a workModel of inherit, a model alias such as sonnet, or a model's full name`);
  }
  checkChoice(settings?.workEffort, "workEffort", EFFORTS, where);
}

const readCheckedSettings = async () => {
  const settings = await readSettings();
  checkPollSeconds(settings?.pollSeconds, "issues.json");
  checkUpdateCheckHours(settings?.updateCheckHours);
  checkWorkSettings(settings, "issues.json");
  return settings;
};

// The repository's entry, or null when it has none.
export async function trackerSetting({ root, on }) {
  if (on != null) return null;
  const settings = await readCheckedSettings();
  if (settings === null) return null;
  const main = await mainCheckout(root, on);
  const [key, setting] = Object.entries(settings?.repos ?? {}).find(([path]) => expandHome(path) === main) ?? [];
  if (!setting) return null;
  if (!TRACKERS.includes(setting.tracker)) throw badSetting(`issues.json's ${key} needs a tracker: ${TRACKERS.join(", ")}`);
  if (setting.tracker === "linear" && !setting.team) throw badSetting(`issues.json's ${key} needs the Linear team's key`);
  if (setting.spaceName != null && typeof setting.spaceName !== "string") throw badSetting(`issues.json's ${key} has a spaceName that isn't text`);
  checkPollSeconds(setting.pollSeconds, `issues.json's ${key}`);
  checkWorkSettings(setting, `issues.json's ${key}`);
  if (setting.worktreeSetup != null && typeof setting.worktreeSetup !== "string") throw badSetting(`issues.json's ${key} has a worktreeSetup that isn't text`);
  if (setting.name != null && typeof setting.name !== "string") throw badSetting(`issues.json's ${key} has a name that isn't text`);
  checkChoice(setting.close, "close", CLOSES, `issues.json's ${key}`);
  if (setting.merge != null && !MERGES.includes(setting.merge)) throw badMergeSetting(`issues.json's ${key} needs a merge of ${MERGES.join(", ")}`);
  if (setting.complete != null && !COMPLETES.includes(setting.complete)) throw badMergeSetting(`issues.json's ${key} needs a complete of ${COMPLETES.join(", ")}`);
  if (PULL_REQUEST_COMPLETES.includes(setting.complete) && setting.merge && setting.merge !== "pull-request") {
    throw badMergeSetting(`issues.json's ${key} merges with ${setting.merge}, so its complete can only be merged`);
  }
  return setting;
}

// How often the panel asks the repository's tracker for its list: its entry's pollSeconds, else the top level's,
// else 60.
export async function pollSettings(project) {
  const setting = await trackerSetting(project), settings = await readCheckedSettings();
  return { pollSeconds: setting?.pollSeconds ?? settings?.pollSeconds ?? DEFAULT_POLL_SECONDS };
}

// How often the panel checks for its own update: the top level's updateCheckHours, else 6. It takes a project,
// as the other settings do, but no repository's entry changes it.
export async function updateSettings() {
  const settings = await readCheckedSettings();
  return { updateCheckHours: settings?.updateCheckHours ?? DEFAULT_UPDATE_CHECK_HOURS };
}

// The model and effort of the Claude sessions that work the repository's issues: the entry's workModel and
// workEffort, else the top level's, else inherit and default.
export async function workSettings(project) {
  const setting = await trackerSetting(project), settings = await readCheckedSettings();
  return {
    workModel: setting?.workModel ?? settings?.workModel ?? DEFAULT_WORK_MODEL,
    workEffort: setting?.workEffort ?? settings?.workEffort ?? DEFAULT_WORK_EFFORT,
  };
}

export const AGENT_DEFAULTS = { workModel: DEFAULT_WORK_MODEL, workEffort: DEFAULT_WORK_EFFORT };

// The agent settings, each as { value, source, entry, topLevel }: the value workSettings resolves, where it comes from ("repository", "top level" or "default"), and the repository's entry's and the
// top level's own values, null where unset.
export async function agentSettings(project) {
  const setting = await trackerSetting(project), settings = await readCheckedSettings();
  return Object.fromEntries(Object.entries(AGENT_DEFAULTS).map(([key, fallback]) => {
    const entry = setting?.[key] ?? null, topLevel = settings?.[key] ?? null;
    const source = entry != null ? "repository" : topLevel != null ? "top level" : "default";
    return [key, { value: entry ?? topLevel ?? fallback, source, entry, topLevel }];
  }));
}

const hasGitHubOrigin =(main) => githubRepository(main, {}).then(() => true, () => false);

// How the repository's issue branches get into main, and when an issue's work counts as complete: when a session
// can stop and a worktree is safe to remove. merge is "auto" (merged locally at once), "review" (merged locally
// once the person approves) or "pull-request"; without the setting, a pull request when origin is on GitHub,
// else review. complete is "merged" (once the branch is in main), "pull-request-open" (once it's pushed with an
// open pull request) or "pull-request-passing" (once that pull request's checks pass); only a pull request allows
// the last two, and "pull-request-open" is its default.
export async function mergeSettings(project) {
  return resolveMergeSettings(await mainCheckout(project.root, project.on), await trackerSetting(project));
}

// mergeSettings for the repository whose main checkout is `main`, from `setting`, its entry or null.
export async function resolveMergeSettings(main, setting) {
  const merge = setting?.merge ?? (await hasGitHubOrigin(main) ? "pull-request" : "review");
  const complete = merge === "pull-request" ? setting?.complete ?? "pull-request-open" : "merged";
  return { merge, complete };
}

// What a finished issue session does about its worktree: the entry's close, else ask.
export async function closeSettings(project) {
  return { close: (await trackerSetting(project))?.close ?? DEFAULT_CLOSE };
}

// The repository's name without its owner: the GitHub repository's for GitHub, else the main checkout's folder's.
export async function repositoryName(main, setting) {
  if (setting?.tracker === "github") return (await githubRepository(main, setting)).split("/").pop();
  return main.split("/").pop();
}

// What the space on the repository's main checkout is named: { name, entry, defaultName }, where entry is the
// entry's own name, null when unset or blank, and defaultName the repository's name, which applies without it.
export async function nameSettings(project) {
  return resolveNameSettings(await mainCheckout(project.root, project.on), await trackerSetting(project));
}

// nameSettings for the repository whose main checkout is `main`, from `setting`, its entry or null. A GitHub
// repository whose name can't be read, such as one without origin, falls back on the main checkout's folder's.
export async function resolveNameSettings(main, setting) {
  const entry = setting?.name?.trim() || null;
  const defaultName = await repositoryName(main, setting).catch(() => repositoryName(main, null));
  return { name: entry ?? defaultName, entry, defaultName };
}

const SETUP_KEYS =["tracker", "team", "repo", "merge", "complete"];

// Writes `change(entry)` as the entry of the repository whose main checkout is `main`, in the place of any entry
// it has under either spelling of its path, and keeps every other repository's entry. `entry` is null without one.
async function changeEntry(main, change) {
  const previous = await readTextFile(settingsPath()).catch(() => null);
  const settings = previous === null ? {} : parseSettings(previous);
  const entries = Object.entries(settings.repos ?? {}), key = abbreviateHome(main);
  const existing = entries.findIndex(([path]) => expandHome(path) === main);
  const changed = change(existing === -1 ? null : entries[existing][1]);
  const others = entries.filter(([path]) => expandHome(path) !== main);
  others.splice(existing === -1 ? others.length : existing, 0, [key, changed]);
  const text = `${JSON.stringify({ ...settings, repos: Object.fromEntries(others) }, null, 2)}\n`;
  await writeTextFile(settingsPath(), text, previous);
  forgetLookups();
}

// Makes `setting`, a tracker with its team or repo and how work lands (merge, and complete for a pull request),
// the choices of the repository whose main checkout is `main`. It replaces those keys in the repository's entry
// but keeps that entry's other keys.
export async function saveSetupChoices(main, setting) {
  await changeEntry(main, (entry) => {
    const kept = Object.fromEntries(Object.entries(entry ?? {}).filter(([name]) => !SETUP_KEYS.includes(name)));
    return { ...setting, ...kept };
  });
}

const TRACKER_KEYS = ["tracker", "team", "repo"];

// Makes `tracker` the issue source of the repository whose main checkout is `main`: Linear with its `team`, GitHub
// Issues with an optional `repo`, or Beads. It replaces only those three keys, so a key the new tracker doesn't
// take, such as Linear's team when switching to Beads, goes, and keeps the entry's other keys.
export async function saveTrackerChoice(main, { tracker, team = null, repo = null }) {
  if (!TRACKERS.includes(tracker)) throw badSetting(`tracker must be one of ${TRACKERS.join(", ")}`);
  if (tracker === "linear" && !team) throw badSetting("Linear needs a team's key");
  const chosen = { tracker, ...(tracker === "linear" && { team }), ...(tracker === "github" && repo && { repo }) };
  await changeEntry(main, (entry) => {
    const kept = Object.fromEntries(Object.entries(entry ?? {}).filter(([name]) => !TRACKER_KEYS.includes(name)));
    return { ...chosen, ...kept };
  });
}

function checkMergeChoice(merge, complete) {
  if (!MERGES.includes(merge)) throw badMergeSetting(`merge must be one of ${MERGES.join(", ")}`);
  if (complete != null && !COMPLETES.includes(complete)) throw badMergeSetting(`complete must be one of ${COMPLETES.join(", ")}`);
  if (PULL_REQUEST_COMPLETES.includes(complete) && merge !== "pull-request") {
    throw badMergeSetting(`Work that merges with ${merge} is complete only once merged`);
  }
}

// Sets how the repository whose main checkout is `main` lands its work: `merge`, and `complete`, which null
// removes so its default applies. It changes only those two keys of the repository's existing entry, and
// writes nothing for a combination trackerSetting would refuse or a repository without an entry.
export async function saveMergeSettings(main, { merge, complete = null }) {
  checkMergeChoice(merge, complete);
  await changeEntry(main, (entry) => {
    if (!entry) throw badSetting("This repository has no entry in issues.json, so choose its tracker first");
    const changed = { ...entry, merge, complete };
    if (complete == null) delete changed.complete;
    return changed;
  });
}

// Sets what a finished session of the repository whose main checkout is `main` does about its worktree. It changes
// only close in the repository's existing entry, and writes nothing for a value trackerSetting would refuse or a
// repository without an entry.
export async function saveCloseSetting(main, close) {
  if (!CLOSES.includes(close)) throw badSetting(`close must be one of ${CLOSES.join(", ")}`);
  await changeEntry(main, (entry) => {
    if (!entry) throw badSetting("This repository has no entry in issues.json, so choose its tracker first");
    return { ...entry, close };
  });
}

// Sets the name of the space on the main checkout `main`. A blank or null name removes the key, so the
// repository's name applies. It changes only name in the repository's existing entry, and writes nothing for a
// repository without an entry.
export async function saveNameSetting(main, name) {
  const trimmed = name?.trim() || null;
  await changeEntry(main, (entry) => {
    if (!entry) throw badSetting("This repository has no entry in issues.json, so choose its tracker first");
    const changed = { ...entry, name: trimmed };
    if (!trimmed) delete changed.name;
    return changed;
  });
}

export const REPOSITORY_KEYS = ["pollSeconds", "spaceName", "worktreeSetup"];

// The entry's own pollSeconds, spaceName and worktreeSetup, null where unset or blank, and topLevelPollSeconds,
// the top level's pollSeconds, which applies without the entry's, null where unset.
export async function repositorySettings(project) {
  const setting = await trackerSetting(project), settings = await readCheckedSettings();
  return {
    pollSeconds: setting?.pollSeconds ?? null,
    spaceName: setting?.spaceName?.trim() || null,
    worktreeSetup: setting?.worktreeSetup?.trim() || null,
    topLevelPollSeconds: settings?.pollSeconds ?? null,
  };
}

// The pollSeconds typed as `text`: null when it's blank, else the number. It throws for anything trackerSetting
// would refuse.
export function parsePollSeconds(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const seconds = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  if (!(seconds >= MIN_POLL_SECONDS)) throw badSetting(`The poll interval must be a whole number of seconds, ${MIN_POLL_SECONDS} or more`);
  return seconds;
}

function checkRepositoryChanges(changes) {
  for (const [key, value] of Object.entries(changes)) {
    if (!REPOSITORY_KEYS.includes(key)) throw badSetting(`${key} isn't a poll, space name or worktree setup setting`);
    if (value == null) continue;
    if (key === "pollSeconds") checkPollSeconds(value, "This repository");
    else if (typeof value !== "string") throw badSetting(`${key} must be text`);
  }
}

// Sets the settings in `changes`, { pollSeconds, spaceName, worktreeSetup } or any of them, in the existing entry of
// the repository whose main checkout is `main`. A null or blank value removes the key, so the top level's
// pollSeconds or the default applies. It changes no other key, and writes nothing for a value trackerSetting
// would refuse or a repository without an entry.
export async function saveRepositorySettings(main, changes) {
  checkRepositoryChanges(changes);
  const cleaned = Object.fromEntries(Object.entries(changes).map(([key, value]) =>
    [key, typeof value === "string" ? value.trim() || null : value ?? null]));
  await changeEntry(main, (entry) => {
    if (!entry) throw badSetting("This repository has no entry in issues.json, so choose its tracker first");
    const changed = { ...entry, ...cleaned };
    for (const [key, value] of Object.entries(cleaned)) if (value == null) delete changed[key];
    return changed;
  });
}

function checkAgentChanges(changes) {
  for (const [key, value] of Object.entries(changes)) {
    if (!(key in AGENT_DEFAULTS)) throw badSetting(`${key} isn't a model or effort setting`);
    if (value == null) continue;
    if (key === "workModel") {
      if (!isModelName(value)) throw badSetting("workModel must be inherit, a model alias such as sonnet, or a model's full name");
      continue;
    }
    if (!EFFORTS.includes(value)) throw badSetting(`${key} must be one of ${EFFORTS.join(", ")}`);
  }
}

// Sets the model and effort settings in `changes`, { workModel, workEffort } or either of them, in the existing entry of the repository whose main checkout is `main`. A null value removes the key, so the
// top level's value or the default applies. It changes no other key, and writes nothing for a value
// trackerSetting would refuse or a repository without an entry.
export async function saveAgentSettings(main, changes) {
  checkAgentChanges(changes);
  await changeEntry(main, (entry) => {
    if (!entry) throw badSetting("This repository has no entry in issues.json, so choose its tracker first");
    const changed = { ...entry, ...changes };
    for (const [key, value] of Object.entries(changes)) if (value == null) delete changed[key];
    return changed;
  });
}
