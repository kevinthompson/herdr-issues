// Each repository's choice of tracker, in ~/.config/herdr-app/issues.json, which /issues:config writes. Repositories
// are keyed by their main checkout's path, ~ for the home folder, so worktrees share their repository's choice:
// { "pollSeconds": 120,                                             how often every panel polls its tracker
//   "updateCheckHours": 6,                                          how often the panel checks for its own update
//   "approval": "auto", "close": "auto",                            what every repository without its own uses
//   "repos": {
//     "~/Code/web":      { "tracker": "linear", "team": "WEB",      a Linear team, with saved views as extra lists
//                          "views": { "<name>": "https://linear.app/…/view/…" } },
//     "~/Code/app":      { "tracker": "github", "repo": "owner/name",   its GitHub issues; repo defaults to origin's
//                          "spaceName": "<repo><issueId>",            names issue spaces (space-name.js), here app#41
//                          "onApproval": "pull-request", "waitForChecks": true, "close": "auto",
//                          "worktreeSetup": "npm install", "pollSeconds": 30 },
//     "~/Code/notes":    { "tracker": "beads" } } }                   the Beads database in its .beads folder
// pollSeconds, at the top level and in any entry, is how often the panel asks the tracker for its list, a whole number
// of seconds of at least 10; an entry's overrides the top level's, and pollSettings resolves it, 60 without either.
// updateCheckHours, at the top level only, is how often the panel fetches its own checkout's origin to offer an
// update (update.js), a whole number of hours of at least 1; updateSettings resolves it, 6 without it.
// spaceName, approval, onApproval, waitForChecks and close are optional at the top level and in any entry, an
// entry's winning, and are checked the same way in either; worktreeSetup is optional in any entry. In spaceName,
// <issueId> is the issue's ID and <repo> the repository's name without its owner; without it, an issue's space is
// named after its ID. approval is whether a session asks the person before its work lands, ask or auto, ask
// without it; onApproval is how the branch then reaches main, merge (locally) or pull-request, a pull request
// without it when origin is on GitHub, else merge; waitForChecks, true or false, false without it, is whether a
// session with a pull request stays until its checks pass. The retired merge and complete still apply where a
// place sets none of these: merge auto means approval auto and onApproval merge, review means ask and merge, and
// pull-request means onApproval pull-request; complete pull-request-passing means waitForChecks true, and its other
// values false. Saving any of the three removes merge and complete there; landingSettings resolves them all.
// worktreeSetup is a shell command `issues
// worktree` runs in each new checkout (cli/worktree.js). close is what a finished /issues:work session does about
// its worktree: ask asks whether to close it now, mentioning cmd+shift+w, and auto closes it, both with `issues
// close`; closeSettings resolves it, ask without it. The retired manual, which only told the person to press
// cmd+shift+w, still loads and reads as ask, but isn't saved.
// name, also optional in any entry, names the space `issues worktree` and the worktree dialog open on the main
// checkout, which the sidebar nests worktree spaces under; nameSettings resolves it, the repository's name without
// its owner without it or when it's blank.
// workModel and workEffort, at the top level and in any entry, an entry's winning, are the model and effort of the
// Claude sessions Start, Continue and `issues worktree --claude` open to work an issue: workModel is inherit (the
// person's own Claude Code model), a model alias such as sonnet, or a model's full name; workEffort is default
// (left unset), low, medium, high, xhigh or max; inherit and default without either. workPrompt, also at the top
// level and in any entry, is text appended to those sessions' system prompt with --append-system-prompt, standing
// instructions such as house rules for tests: the top level's, then the entry's after a blank line, so an entry's
// adds to the top level's; none without either, or when both are blank.
// workSettings resolves all three.
// Any model or effort the mod or its skills choose is a setting like these, with a default. Keys it doesn't know,
// such as retired settings, are ignored and kept when an entry is saved.
// The file holds no secrets, so it can be shared between machines; Linear's API key stays in the macOS Keychain.
// Without an entry, a repository uses Linear. Only this computer's repositories have entries. The panel's setup
// view (setup.js) writes an entry too, with saveSetupChoices, and its settings view (settings.js) changes an entry's
// tracker with saveTrackerChoice, its approval, onApproval and waitForChecks with saveLandingSettings, its close with saveCloseSetting, its
// name with saveNameSetting, its pollSeconds, spaceName and worktreeSetup with saveRepositorySettings, its model
// and effort settings with saveAgentSettings, and its workPrompt with saveWorkPrompt; it changes the top level
// with saveTopLevelSettings.
import { appHome, home, readTextFile, writeTextFile } from "herdr";
import { mainCheckout } from "../location.js";
import { cachedLookup, forgetLookups } from "../lookups.js";
import { githubRepository } from "./github.js";
import { badLandingSetting, badSetting, settingsUnreadable } from "./problems.js";

export const settingsPath = () => `${appHome()}/issues.json`;
const TRACKERS = ["linear", "github", "beads"];
export const APPROVALS = ["ask", "auto"];
export const DEFAULT_APPROVAL = "ask";
export const ON_APPROVALS = ["merge", "pull-request"];
export const DEFAULT_WAIT_FOR_CHECKS = false;
const RETIRED_MERGES = ["auto", "review", "pull-request"];
const RETIRED_COMPLETES = ["merged", "pull-request-open", "pull-request-passing"];
export const CLOSES = ["ask", "auto"];
export const DEFAULT_CLOSE = "ask";
const RETIRED_CLOSE = "manual";
export const closeChoice = (close) => (close === RETIRED_CLOSE ? "ask" : close ?? null);
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
  if (settings?.workPrompt != null && typeof settings.workPrompt !== "string") throw badSetting(`${where} has a workPrompt that isn't text`);
}

function checkLanding({ approval, onApproval, waitForChecks, merge, complete } = {}, where) {
  if (approval != null && !APPROVALS.includes(approval)) throw badLandingSetting(`${where} needs an approval of ${APPROVALS.join(", ")}`);
  if (onApproval != null && !ON_APPROVALS.includes(onApproval)) throw badLandingSetting(`${where} needs an onApproval of ${ON_APPROVALS.join(", ")}`);
  if (waitForChecks != null && typeof waitForChecks !== "boolean") throw badLandingSetting(`${where} needs a waitForChecks of true or false`);
  if (merge != null && !RETIRED_MERGES.includes(merge)) throw badLandingSetting(`${where} needs a merge of ${RETIRED_MERGES.join(", ")}`);
  if (complete != null && !RETIRED_COMPLETES.includes(complete)) throw badLandingSetting(`${where} needs a complete of ${RETIRED_COMPLETES.join(", ")}`);
}

// The settings both the top level and an entry take, checked the same way in either.
function checkSharedSettings(settings, where) {
  checkPollSeconds(settings?.pollSeconds, where);
  checkWorkSettings(settings, where);
  if (settings?.spaceName != null && typeof settings.spaceName !== "string") throw badSetting(`${where} has a spaceName that isn't text`);
  checkChoice(closeChoice(settings?.close), "close", CLOSES, where);
  checkLanding(settings ?? {}, where);
}

function checkTopLevel(settings) {
  checkSharedSettings(settings, "issues.json");
  checkUpdateCheckHours(settings?.updateCheckHours);
}

const readCheckedSettings = async () => {
  const settings = await readSettings();
  checkTopLevel(settings);
  return settings;
};

// issues.json's top level, which applies to every repository without its own value, or {} without the file.
export const topLevelSettings = async () => (await readCheckedSettings()) ?? {};

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
  checkSharedSettings(setting, `issues.json's ${key}`);
  if (setting.worktreeSetup != null && typeof setting.worktreeSetup !== "string") throw badSetting(`issues.json's ${key} has a worktreeSetup that isn't text`);
  if (setting.name != null && typeof setting.name !== "string") throw badSetting(`issues.json's ${key} has a name that isn't text`);
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

// The model, effort and appended system prompt of the Claude sessions that work the repository's issues: the
// entry's workModel and workEffort, else the top level's, else inherit and default; and the top level's workPrompt
// followed by the entry's, a blank line apart, either alone, or no prompt (""). A blank workPrompt counts as unset.
export async function workSettings(project) {
  const setting = await trackerSetting(project), settings = await readCheckedSettings();
  return {
    workModel: setting?.workModel ?? settings?.workModel ?? DEFAULT_WORK_MODEL,
    workEffort: setting?.workEffort ?? settings?.workEffort ?? DEFAULT_WORK_EFFORT,
    workPrompt: [settings?.workPrompt?.trim(), setting?.workPrompt?.trim()].filter(Boolean).join("\n\n"),
  };
}

// The repository entry's own workPrompt and the top level's, each null where unset or blank.
export async function workPromptSettings(project) {
  const setting = await trackerSetting(project), settings = await readCheckedSettings();
  return { entry: setting?.workPrompt?.trim() || null, topLevel: settings?.workPrompt?.trim() || null };
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

const RETIRED_MERGE_MEANINGS = {
  auto: { approval: "auto", onApproval: "merge" },
  review: { approval: "ask", onApproval: "merge" },
  "pull-request": { onApproval: "pull-request" },
};

// The approval, onApproval and waitForChecks that `source`, an entry or the top level, sets itself, each null
// where unset: its own key, else what its retired merge or complete means.
export function ownLanding(source) {
  const retired = RETIRED_MERGE_MEANINGS[source?.merge] ?? {};
  const retiredWait = source?.complete != null ? source.complete === "pull-request-passing" : null;
  return {
    approval: source?.approval ?? retired.approval ?? null,
    onApproval: source?.onApproval ?? retired.onApproval ?? null,
    waitForChecks: source?.waitForChecks ?? retiredWait,
  };
}

// How the repository's issue branches land in main: approval, whether a session asks the person first ("ask")
// or goes straight on ("auto"); onApproval, how the branch reaches main once approved ("merge" locally or
// "pull-request"); and waitForChecks, whether a session with a pull request stays until its checks pass. Each is
// the entry's, else the top level's, else its default, where each place's retired merge and complete stand in for
// keys it doesn't set.
export async function landingSettings(project) {
  const setting = await trackerSetting(project);
  return resolveLandingSettings(await mainCheckout(project.root, project.on), setting, await topLevelSettings());
}

// landingSettings for the repository whose main checkout is `main`, from `setting`, its entry or null, and
// `topLevel`, issues.json's top level or null.
export async function resolveLandingSettings(main, setting, topLevel = null) {
  const entry = ownLanding(setting), top = ownLanding(topLevel);
  return {
    approval: entry.approval ?? top.approval ?? DEFAULT_APPROVAL,
    onApproval: entry.onApproval ?? top.onApproval ?? await defaultOnApproval(main),
    waitForChecks: entry.waitForChecks ?? top.waitForChecks ?? DEFAULT_WAIT_FOR_CHECKS,
  };
}

const defaultOnApproval = async (main) => (await hasGitHubOrigin(main) ? "pull-request" : "merge");

// What a finished issue session does about its worktree: the entry's close, else the top level's, else ask.
export async function closeSettings(project) {
  const setting = await trackerSetting(project), settings = await topLevelSettings();
  return { close: closeChoice(setting?.close) ?? closeChoice(settings.close) ?? DEFAULT_CLOSE };
}

export const LANDING_KEYS = ["approval", "onApproval", "waitForChecks"];
const RETIRED_LANDING_KEYS = ["merge", "complete"];

// Where the repository's approval, onApproval, waitForChecks and close come from: { entry, topLevel,
// defaultOnApproval }, the entry's and the top level's own values (ownLanding), null where unset, and the
// onApproval that applies without either.
export async function landingSources(project) {
  const setting = await trackerSetting(project), settings = await topLevelSettings();
  const own = (source) => ({ ...ownLanding(source), close: closeChoice(source?.close) });
  const main = await mainCheckout(project.root, project.on);
  return { entry: own(setting), topLevel: own(settings), defaultOnApproval: await defaultOnApproval(main) };
}

// The template that names the repository's issue spaces (space-name.js): the entry's spaceName, else the top
// level's, null without either or when it's blank.
export async function spaceNameTemplate(project) {
  const setting = await trackerSetting(project), settings = await topLevelSettings();
  return setting?.spaceName?.trim() || settings.spaceName?.trim() || null;
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

const SETUP_KEYS = ["tracker", "team", "repo", ...LANDING_KEYS, ...RETIRED_LANDING_KEYS];

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

// Makes `setting`, a tracker with its team or repo and how work lands (approval, onApproval, and waitForChecks
// for a pull request), the choices of the repository whose main checkout is `main`. It replaces those keys and the
// retired merge and complete in the repository's entry but keeps that entry's other keys.
export async function saveSetupChoices(main, setting) {
  checkLanding(setting, "This repository");
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

// The entry with each of `values` set, and removed where it's null.
function withValues(entry, values) {
  const changed = { ...entry, ...values };
  for (const [key, value] of Object.entries(values)) if (value == null) delete changed[key];
  return changed;
}

// Sets how the repository whose main checkout is `main` lands its work: `approval`, `onApproval` and
// `waitForChecks`, each of which null removes so the global value or its default applies. It also removes the
// retired merge and complete, which those three replace, so pass all three. It changes only those keys of the
// repository's existing entry, and writes nothing for a value trackerSetting would refuse or a repository without
// an entry.
export async function saveLandingSettings(main, { approval = null, onApproval = null, waitForChecks = null }) {
  const values = { approval, onApproval, waitForChecks };
  checkLanding(values, "This repository");
  await changeEntry(main, (entry) => {
    if (!entry) throw badSetting("This repository has no entry in issues.json, so choose its tracker first");
    return withValues(entry, { ...values, merge: null, complete: null });
  });
}

// Sets what a finished session of the repository whose main checkout is `main` does about its worktree, where null
// removes it so the global value or its default applies. It changes only close in the repository's existing entry,
// and writes nothing for a value trackerSetting would refuse or a repository without an entry.
export async function saveCloseSetting(main, close) {
  if (close != null && !CLOSES.includes(close)) throw badSetting(`close must be one of ${CLOSES.join(", ")}`);
  await changeEntry(main, (entry) => {
    if (!entry) throw badSetting("This repository has no entry in issues.json, so choose its tracker first");
    return withValues(entry, { close });
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

// The entry's own pollSeconds, spaceName and worktreeSetup, null where unset or blank, and topLevelPollSeconds and
// topLevelSpaceName, the top level's, which apply without the entry's, null where unset or blank.
export async function repositorySettings(project) {
  const setting = await trackerSetting(project), settings = await readCheckedSettings();
  return {
    pollSeconds: setting?.pollSeconds ?? null,
    spaceName: setting?.spaceName?.trim() || null,
    worktreeSetup: setting?.worktreeSetup?.trim() || null,
    topLevelPollSeconds: settings?.pollSeconds ?? null,
    topLevelSpaceName: settings?.spaceName?.trim() || null,
  };
}

// A whole number typed as `text`, of at least `minimum`: null when it's blank, else the number. It throws
// `problem` for anything else.
function parseWholeNumber(text, minimum, problem) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const number = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  if (!(number >= minimum)) throw badSetting(problem);
  return number;
}

// The pollSeconds typed as `text`: null when it's blank, else the number. It throws for anything trackerSetting
// would refuse.
export function parsePollSeconds(text) {
  return parseWholeNumber(text, MIN_POLL_SECONDS, `The poll interval must be a whole number of seconds, ${MIN_POLL_SECONDS} or more`);
}

// The updateCheckHours typed as `text`: null when it's blank, else the number. It throws for anything the top
// level would refuse.
export function parseUpdateCheckHours(text) {
  return parseWholeNumber(text, MIN_UPDATE_CHECK_HOURS, `The update check interval must be a whole number of hours, ${MIN_UPDATE_CHECK_HOURS} or more`);
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

// Sets the workPrompt, trimmed, in the existing entry of the repository whose main checkout is `main`. A blank or
// null prompt removes the key, so the top level's prompt, if any, applies. It changes no other key, and writes
// nothing for a prompt that isn't text or a repository without an entry.
export async function saveWorkPrompt(main, prompt) {
  if (prompt != null && typeof prompt !== "string") throw badSetting("workPrompt must be text");
  const trimmed = prompt?.trim() || null;
  await changeEntry(main, (entry) => {
    if (!entry) throw badSetting("This repository has no entry in issues.json, so choose its tracker first");
    const changed = { ...entry, workPrompt: trimmed };
    if (!trimmed) delete changed.workPrompt;
    return changed;
  });
}

export const TOP_LEVEL_KEYS = [...LANDING_KEYS, "close", "spaceName", "pollSeconds", "updateCheckHours", "workModel", "workEffort", "workPrompt"];

// Sets the settings in `changes`, any of TOP_LEVEL_KEYS, at the top level of issues.json, creating the file if
// needed. Text is trimmed, and a null or blank value removes the key, so each repository's own value or the
// default applies. Changing any of approval, onApproval and waitForChecks also removes the retired merge and
// complete, so pass all three. It keeps repos and every other top-level key, and writes nothing for a key it
// doesn't take or a top level readCheckedSettings would refuse once changed.
export async function saveTopLevelSettings(changes) {
  const unknown = Object.keys(changes).find((key) => !TOP_LEVEL_KEYS.includes(key));
  if (unknown) throw badSetting(`${unknown} isn't a setting for every repository`);
  if (changes.close != null && !CLOSES.includes(changes.close)) throw badSetting(`close must be one of ${CLOSES.join(", ")}`);
  const cleaned = Object.entries(changes).map(([key, value]) => [key, typeof value === "string" ? value.trim() || null : value ?? null]);
  if (Object.keys(changes).some((key) => LANDING_KEYS.includes(key))) cleaned.push(...RETIRED_LANDING_KEYS.map((key) => [key, null]));
  const previous = await readTextFile(settingsPath()).catch(() => null);
  const { repos, ...settings } = previous === null ? {} : parseSettings(previous);
  for (const [key, value] of cleaned) {
    if (value == null) delete settings[key];
    else settings[key] = value;
  }
  checkTopLevel(settings);
  const text = `${JSON.stringify({ ...settings, ...(repos !== undefined && { repos }) }, null, 2)}\n`;
  await writeTextFile(settingsPath(), text, previous);
  forgetLookups();
}
