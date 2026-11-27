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
// spaceName, approval, onApproval, waitForChecks, pushAfterMerge and close are optional at the top level and in
// any entry, an entry's winning, and are checked the same way in either; worktreeSetup is optional in any entry. In
// spaceName, <issueId> is the issue's ID and <repo> the repository's name without its owner; without it, an issue's
// space is named after its ID. approval is whether a session asks the person to approve its work, ask or auto, ask
// without it; onApproval is how the branch then reaches main, merge (locally) or pull-request, a pull request
// without it when origin is on GitHub, else merge; waitForChecks, true or false, false without it, is whether a
// session with a pull request stays until its checks pass; pushAfterMerge, true or false, false without it, is
// whether a local merge then pushes main to its upstream remote (merge.js). The retired merge and complete still
// apply where a place sets none of these: merge auto means approval auto and onApproval merge, review means ask and
// merge, and pull-request means onApproval pull-request; complete pull-request-passing means waitForChecks true, and
// its other values false. Saving any of approval, onApproval and waitForChecks removes merge and complete there;
// approvalSettings resolves them all.
// worktreeSetup is a shell command `issues
// worktree` runs in each new checkout (cli/worktree.js). worktreeCommand, optional at the top level and in any
// entry, an entry's winning, is an interactive shell command that a new issue space opens running in its tab
// (worktree-command.js), where <issueId> is the issue's ID; without it, the space opens a plain shell.
// worktreeCommandTemplate resolves it. close is what a finished /issues:work session does about
// its worktree: ask asks whether to close it now, mentioning cmd+shift+w, and auto closes it, both with `issues
// close`; closeSettings resolves it, ask without it. The retired manual, which only told the person to press
// cmd+shift+w, still loads and reads as ask, but isn't saved.
// name, also optional in any entry, names the space `issues worktree` and the worktree dialog open on the main
// checkout, which the sidebar nests worktree spaces under; nameSettings resolves it, the repository's name without
// its owner without it or when it's blank.
// Keys it doesn't know, such as the retired workModel, workEffort and workPrompt, are ignored and kept when an entry
// is saved.
// The file holds no secrets, so it can be shared between machines; Linear's API key stays in linear.json beside it.
// Without an entry, a repository uses Linear. Only this computer's repositories have entries. The panel's setup
// view (setup.js) writes an entry too, with saveSetupChoices, and its settings view (settings.js) changes an entry's
// tracker with saveTrackerChoice, its approval settings and pushAfterMerge with saveApprovalSettings, its close with saveCloseSetting, its
// name with saveNameSetting, and its pollSeconds, spaceName, worktreeSetup and worktreeCommand with
// saveRepositorySettings; it changes the top level with saveTopLevelSettings.
import { appHome, home, readTextFile, writeTextFile } from "herdr";
import { mainCheckout } from "../location.js";
import { cachedLookup, forgetLookups } from "../lookups.js";
import { githubRepository } from "./github.js";
import { badApprovalSetting, badSetting, settingsUnreadable } from "./problems.js";

/**
 * @typedef {object} Setting
 * @property {string} [tracker]
 * @property {string} [team]
 * @property {Record<string, string>} [views]
 * @property {string} [repo]
 * @property {string} [spaceName]
 * @property {string} [worktreeCommand]
 * @property {string} [approval]
 * @property {string} [onApproval]
 * @property {boolean} [waitForChecks]
 * @property {boolean} [pushAfterMerge]
 * @property {string} [close]
 * @property {string} [worktreeSetup]
 * @property {number} [pollSeconds]
 * @property {string} [name]
 * @property {string} [merge]
 * @property {string} [complete]
 */

/**
 * @typedef {object} Settings
 * @property {number} [pollSeconds]
 * @property {number} [updateCheckHours]
 * @property {string} [approval]
 * @property {string} [onApproval]
 * @property {boolean} [waitForChecks]
 * @property {boolean} [pushAfterMerge]
 * @property {string} [close]
 * @property {string} [spaceName]
 * @property {string} [worktreeCommand]
 * @property {string} [merge]
 * @property {string} [complete]
 * @property {Record<string, Setting>} [repos]
 */

/**
 * @typedef {{ pollSeconds?: number | string | null, spaceName?: string | null, worktreeSetup?: string | null, worktreeCommand?: string | null }} RepositoryChanges
 * @import { Project } from "./index.js"
 */

export const settingsPath = () => `${appHome()}/issues.json`;
const TRACKERS = ["linear", "github", "beads"];
export const APPROVALS = ["ask", "auto"];
export const DEFAULT_APPROVAL = "ask";
export const ON_APPROVALS = ["merge", "pull-request"];
export const DEFAULT_WAIT_FOR_CHECKS = false;
export const DEFAULT_PUSH_AFTER_MERGE = false;
const RETIRED_MERGES = ["auto", "review", "pull-request"];
const RETIRED_COMPLETES = ["merged", "pull-request-open", "pull-request-passing"];
export const CLOSES = ["ask", "auto"];
export const DEFAULT_CLOSE = "ask";
const RETIRED_CLOSE = "manual";
/**
 * @param {string | null | undefined} close
 * @returns {string | null}
 */
export const closeChoice = (close) => (close === RETIRED_CLOSE ? "ask" : (close ?? null));
export const DEFAULT_POLL_SECONDS = 60;
const MIN_POLL_SECONDS = 10;
export const DEFAULT_UPDATE_CHECK_HOURS = 6;
const MIN_UPDATE_CHECK_HOURS = 1;
/**
 * @param {string} path
 */
const expandHome = (path) => (path.startsWith("~/") ? `${home()}${path.slice(1)}` : path);
/**
 * @param {string} path
 */
const abbreviateHome = (path) => (path.startsWith(`${home()}/`) ? `~${path.slice(home().length)}` : path);

/**
 * @param {string} text
 * @returns {Settings}
 */
function parseSettings(text) {
  try {
    return JSON.parse(text);
  } catch (/** @type {any} */ e) {
    throw settingsUnreadable(`issues.json isn't valid JSON: ${e.message ?? e}`);
  }
}

const cachedSettings = cachedLookup();

/** @returns {Promise<string | null>} */
const readSettingsText = () => readTextFile(settingsPath()).catch(/** @returns {string} */ () => null);

const readSettings = () =>
  cachedSettings("issues.json", async () => {
    const text = await readSettingsText();
    return text === null ? null : parseSettings(text);
  });

/**
 * @param {unknown} value
 * @param {string} where
 */
function checkPollSeconds(value, where) {
  if (value == null || (typeof value === "number" && Number.isInteger(value) && value >= MIN_POLL_SECONDS)) return;
  throw badSetting(`${where} needs a pollSeconds that's a whole number of seconds, ${MIN_POLL_SECONDS} or more`);
}

/**
 * @param {unknown} value
 */
function checkUpdateCheckHours(value) {
  if (value == null || (typeof value === "number" && Number.isInteger(value) && value >= MIN_UPDATE_CHECK_HOURS))
    return;
  throw badSetting(
    `issues.json needs an updateCheckHours that's a whole number of hours, ${MIN_UPDATE_CHECK_HOURS} or more`,
  );
}

/**
 * @param {string | null | undefined} value
 * @param {string} name
 * @param {string[]} choices
 * @param {string} where
 */
function checkChoice(value, name, choices, where) {
  if (value != null && !choices.includes(value)) throw badSetting(`${where} needs a ${name} of ${choices.join(", ")}`);
}

/**
 * @param {Setting | Settings} settings
 * @param {string} where
 */
function checkApproval(
  { approval, onApproval, waitForChecks, pushAfterMerge, merge, complete } = /** @type {Record<string, any>} */ ({}),
  where,
) {
  if (approval != null && !APPROVALS.includes(approval))
    throw badApprovalSetting(`${where} needs an approval of ${APPROVALS.join(", ")}`);
  if (onApproval != null && !ON_APPROVALS.includes(onApproval))
    throw badApprovalSetting(`${where} needs an onApproval of ${ON_APPROVALS.join(", ")}`);
  if (waitForChecks != null && typeof waitForChecks !== "boolean")
    throw badApprovalSetting(`${where} needs a waitForChecks of true or false`);
  if (pushAfterMerge != null && typeof pushAfterMerge !== "boolean")
    throw badApprovalSetting(`${where} needs a pushAfterMerge of true or false`);
  if (merge != null && !RETIRED_MERGES.includes(merge))
    throw badApprovalSetting(`${where} needs a merge of ${RETIRED_MERGES.join(", ")}`);
  if (complete != null && !RETIRED_COMPLETES.includes(complete))
    throw badApprovalSetting(`${where} needs a complete of ${RETIRED_COMPLETES.join(", ")}`);
}

// The settings both the top level and an entry take, checked the same way in either.
/**
 * @param {Setting | Settings | null | undefined} settings
 * @param {string} where
 */
function checkSharedSettings(settings, where) {
  checkPollSeconds(settings?.pollSeconds, where);
  if (settings?.spaceName != null && typeof settings.spaceName !== "string")
    throw badSetting(`${where} has a spaceName that isn't text`);
  if (settings?.worktreeCommand != null && typeof settings.worktreeCommand !== "string")
    throw badSetting(`${where} has a worktreeCommand that isn't text`);
  checkChoice(closeChoice(settings?.close), "close", CLOSES, where);
  checkApproval(settings ?? {}, where);
}

/**
 * @param {Settings | null} settings
 */
function checkTopLevel(settings) {
  checkSharedSettings(settings, "issues.json");
  checkUpdateCheckHours(settings?.updateCheckHours);
}

/**
 * @returns {Promise<Settings | null>}
 */
const readCheckedSettings = async () => {
  const settings = await readSettings();
  checkTopLevel(settings);
  return settings;
};

// issues.json's top level, which applies to every repository without its own value, or {} without the file.
export const topLevelSettings = async () => (await readCheckedSettings()) ?? {};

// The repository's entry, or null when it has none.
/**
 * @param {Project} project
 * @returns {Promise<Setting | null>}
 */
export async function trackerSetting({ root, on }) {
  if (on != null) return null;
  const settings = await readCheckedSettings();
  if (settings === null) return null;
  const main = await mainCheckout(root, on);
  const [key, setting] = Object.entries(settings?.repos ?? {}).find(([path]) => expandHome(path) === main) ?? [];
  if (!setting) return null;
  if (!TRACKERS.includes(setting.tracker))
    throw badSetting(`issues.json's ${key} needs a tracker: ${TRACKERS.join(", ")}`);
  if (setting.tracker === "linear" && !setting.team)
    throw badSetting(`issues.json's ${key} needs the Linear team's key`);
  checkSharedSettings(setting, `issues.json's ${key}`);
  if (setting.worktreeSetup != null && typeof setting.worktreeSetup !== "string")
    throw badSetting(`issues.json's ${key} has a worktreeSetup that isn't text`);
  if (setting.name != null && typeof setting.name !== "string")
    throw badSetting(`issues.json's ${key} has a name that isn't text`);
  return setting;
}

// How often the panel asks the repository's tracker for its list: its entry's pollSeconds, else the top level's,
// else 60.
/**
 * @param {Project} project
 */
export async function pollSettings(project) {
  const setting = await trackerSetting(project),
    settings = await readCheckedSettings();
  return { pollSeconds: setting?.pollSeconds ?? settings?.pollSeconds ?? DEFAULT_POLL_SECONDS };
}

// How often the panel checks for its own update: the top level's updateCheckHours, else 6. It takes a project,
// as the other settings do, but no repository's entry changes it.
export async function updateSettings() {
  const settings = await readCheckedSettings();
  return { updateCheckHours: settings?.updateCheckHours ?? DEFAULT_UPDATE_CHECK_HOURS };
}

/**
 * @param {string} main
 */
const hasGitHubOrigin = (main) =>
  Promise.resolve(githubRepository(main, {})).then(
    () => true,
    () => false,
  );

/** @type {Record<string, { approval?: string, onApproval?: string }>} */
const RETIRED_MERGE_MEANINGS = {
  auto: { approval: "auto", onApproval: "merge" },
  review: { approval: "ask", onApproval: "merge" },
  "pull-request": { onApproval: "pull-request" },
};

// The approval, onApproval and waitForChecks that `source`, an entry or the top level, sets itself, each null
// where unset: its own key, else what its retired merge or complete means.
/**
 * @param {Setting | Settings | null | undefined} source
 */
export function ownApproval(source) {
  const retired = RETIRED_MERGE_MEANINGS[source?.merge] ?? {};
  const retiredWait = source?.complete != null ? source.complete === "pull-request-passing" : null;
  return {
    approval: source?.approval ?? retired.approval ?? null,
    onApproval: source?.onApproval ?? retired.onApproval ?? null,
    waitForChecks: source?.waitForChecks ?? retiredWait,
    pushAfterMerge: source?.pushAfterMerge ?? null,
  };
}

// The repository's approval settings: approval, whether a session asks the person first ("ask")
// or goes straight on ("auto"); onApproval, how the branch reaches main once approved ("merge" locally or
// "pull-request"); and waitForChecks, whether a session with a pull request stays until its checks pass. Each is
// the entry's, else the top level's, else its default, where each place's retired merge and complete stand in for
// keys it doesn't set.
/**
 * @param {Project} project
 */
export async function approvalSettings(project) {
  const setting = await trackerSetting(project);
  return resolveApprovalSettings(await mainCheckout(project.root, project.on), setting, await topLevelSettings());
}

// approvalSettings for the repository whose main checkout is `main`, from `setting`, its entry or null, and
// `topLevel`, issues.json's top level or null.
/**
 * @param {string} main
 * @param {Setting | null} setting
 * @param {Settings | null} [topLevel]
 */
export async function resolveApprovalSettings(main, setting, topLevel = null) {
  const entry = ownApproval(setting),
    top = ownApproval(topLevel);
  return {
    approval: entry.approval ?? top.approval ?? DEFAULT_APPROVAL,
    onApproval: entry.onApproval ?? top.onApproval ?? (await defaultOnApproval(main)),
    waitForChecks: entry.waitForChecks ?? top.waitForChecks ?? DEFAULT_WAIT_FOR_CHECKS,
    pushAfterMerge: entry.pushAfterMerge ?? top.pushAfterMerge ?? DEFAULT_PUSH_AFTER_MERGE,
  };
}

/**
 * @param {string} main
 */
const defaultOnApproval = async (main) => ((await hasGitHubOrigin(main)) ? "pull-request" : "merge");

// What a finished issue session does about its worktree: the entry's close, else the top level's, else ask.
/**
 * @param {Project} project
 */
export async function closeSettings(project) {
  const setting = await trackerSetting(project),
    settings = await topLevelSettings();
  return { close: closeChoice(setting?.close) ?? closeChoice(settings.close) ?? DEFAULT_CLOSE };
}

export const APPROVAL_KEYS = ["approval", "onApproval", "waitForChecks"];
const RETIRED_APPROVAL_KEYS = ["merge", "complete"];
// The approval settings and pushAfterMerge, which setup and the settings view ask about together.
export const APPROVAL_QUESTION_KEYS = [...APPROVAL_KEYS, "pushAfterMerge"];

// Where the repository's approval, onApproval, waitForChecks, pushAfterMerge and close come from: { entry, topLevel,
// defaultOnApproval }, the entry's and the top level's own values (ownApproval), null where unset, and the
// onApproval that applies without either.
/**
 * @param {Project} project
 */
export async function approvalSources(project) {
  const setting = await trackerSetting(project),
    settings = await topLevelSettings();
  /** @param {Setting | Settings | null} source */
  const own = (source) => ({ ...ownApproval(source), close: closeChoice(source?.close) });
  const main = await mainCheckout(project.root, project.on);
  return { entry: own(setting), topLevel: own(settings), defaultOnApproval: await defaultOnApproval(main) };
}

// The template that names the repository's issue spaces (space-name.js): the entry's spaceName, else the top
// level's, null without either or when it's blank.
/**
 * @param {Project} project
 */
export async function spaceNameTemplate(project) {
  const setting = await trackerSetting(project),
    settings = await topLevelSettings();
  return setting?.spaceName?.trim() || settings.spaceName?.trim() || null;
}

// The command a new issue space runs (worktree-command.js): the entry's worktreeCommand, else the top level's, null
// without either or when it's blank.
/**
 * @param {Project} project
 */
export async function worktreeCommandTemplate(project) {
  const setting = await trackerSetting(project),
    settings = await topLevelSettings();
  return setting?.worktreeCommand?.trim() || settings.worktreeCommand?.trim() || null;
}

// The repository's name without its owner: the GitHub repository's for GitHub, else the main checkout's folder's.
/**
 * @param {string} main
 * @param {Setting | null} setting
 */
export async function repositoryName(main, setting) {
  if (setting?.tracker === "github") return (await githubRepository(main, setting)).split("/").pop();
  return main.split("/").pop();
}

// What the space on the repository's main checkout is named: { name, entry, defaultName }, where entry is the
// entry's own name, null when unset or blank, and defaultName the repository's name, which applies without it.
/**
 * @param {Project} project
 */
export async function nameSettings(project) {
  return resolveNameSettings(await mainCheckout(project.root, project.on), await trackerSetting(project));
}

// nameSettings for the repository whose main checkout is `main`, from `setting`, its entry or null. A GitHub
// repository whose name can't be read, such as one without origin, falls back on the main checkout's folder's.
/**
 * @param {string} main
 * @param {Setting | null} setting
 */
export async function resolveNameSettings(main, setting) {
  const entry = setting?.name?.trim() || null;
  const defaultName = await repositoryName(main, setting).catch(() => repositoryName(main, null));
  return { name: entry ?? defaultName, entry, defaultName };
}

const SETUP_KEYS = ["tracker", "team", "repo", ...APPROVAL_QUESTION_KEYS, ...RETIRED_APPROVAL_KEYS];

// Writes `change(entry)` as the entry of the repository whose main checkout is `main`, in the place of any entry
// it has under either spelling of its path, and keeps every other repository's entry. `entry` is null without one.
/**
 * @param {string} main
 * @param {(entry: Setting | null) => Record<string, unknown>} change
 */
async function changeEntry(main, change) {
  const previous = await readSettingsText();
  const settings = previous === null ? {} : parseSettings(previous);
  const entries = Object.entries(settings.repos ?? {}),
    key = abbreviateHome(main);
  const existing = entries.findIndex(([path]) => expandHome(path) === main);
  const changed = change(existing === -1 ? null : entries[existing][1]);
  const others = entries.filter(([path]) => expandHome(path) !== main);
  others.splice(existing === -1 ? others.length : existing, 0, [key, changed]);
  const text = `${JSON.stringify({ ...settings, repos: Object.fromEntries(others) }, null, 2)}\n`;
  await writeTextFile(settingsPath(), text, previous);
  forgetLookups();
}

// Makes `setting`, a tracker with its team or repo and its approval settings (approval, onApproval, waitForChecks
// for a pull request and pushAfterMerge for a merge), the choices of the repository whose main checkout is `main`.
// It replaces those keys and the retired merge and complete in the repository's entry but keeps its other keys.
/**
 * @param {string} main
 * @param {Setting} setting
 */
export async function saveSetupChoices(main, setting) {
  checkApproval(setting, "This repository");
  await changeEntry(main, (entry) => {
    const kept = Object.fromEntries(Object.entries(entry ?? {}).filter(([name]) => !SETUP_KEYS.includes(name)));
    return { ...setting, ...kept };
  });
}

const TRACKER_KEYS = ["tracker", "team", "repo"];

// Makes `tracker` the issue source of the repository whose main checkout is `main`: Linear with its `team`, GitHub
// Issues with an optional `repo`, or Beads. It replaces only those three keys, so a key the new tracker doesn't
// take, such as Linear's team when switching to Beads, goes, and keeps the entry's other keys.
/**
 * @param {string} main
 * @param {{ tracker: string, team?: string | null, repo?: string | null }} choice
 */
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
/**
 * @param {Setting} entry
 * @param {Record<string, unknown>} values
 * @returns {Record<string, unknown>}
 */
function withValues(entry, values) {
  const changed = /** @type {Record<string, unknown>} */ ({ ...entry, ...values });
  for (const [key, value] of Object.entries(values)) if (value == null) delete changed[key];
  return changed;
}

// Sets the approval settings of the repository whose main checkout is `main`: `approval`, `onApproval`,
// `waitForChecks` and `pushAfterMerge`, each of which null removes so the global value or its default applies. It
// also removes the retired merge and complete, which the first three replace, so pass all four. It changes only
// those keys of the repository's existing entry, and writes nothing for a value trackerSetting would refuse or a
// repository without an entry.
/**
 * @param {string} main
 * @param {{ approval?: string | null, onApproval?: string | null, waitForChecks?: boolean | null, pushAfterMerge?: boolean | null }} approvals
 */
export async function saveApprovalSettings(
  main,
  { approval = null, onApproval = null, waitForChecks = null, pushAfterMerge = null },
) {
  const values = { approval, onApproval, waitForChecks, pushAfterMerge };
  checkApproval(values, "This repository");
  await changeEntry(main, (entry) => {
    if (!entry) throw badSetting("This repository has no entry in issues.json, so choose its tracker first");
    return withValues(entry, { ...values, merge: null, complete: null });
  });
}

// Sets what a finished session of the repository whose main checkout is `main` does about its worktree, where null
// removes it so the global value or its default applies. It changes only close in the repository's existing entry,
// and writes nothing for a value trackerSetting would refuse or a repository without an entry.
/**
 * @param {string} main
 * @param {string | null} close
 */
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
/**
 * @param {string} main
 * @param {string | null | undefined} name
 */
export async function saveNameSetting(main, name) {
  const trimmed = name?.trim() || null;
  await changeEntry(main, (entry) => {
    if (!entry) throw badSetting("This repository has no entry in issues.json, so choose its tracker first");
    const changed = { ...entry, name: trimmed };
    if (!trimmed) delete changed.name;
    return changed;
  });
}

export const REPOSITORY_KEYS = ["pollSeconds", "spaceName", "worktreeSetup", "worktreeCommand"];

// The entry's own pollSeconds, spaceName, worktreeSetup and worktreeCommand, null where unset or blank, and
// topLevelPollSeconds, topLevelSpaceName and topLevelWorktreeCommand, the top level's, which apply without the
// entry's, null where unset or blank.
/**
 * @param {Project} project
 */
export async function repositorySettings(project) {
  const setting = await trackerSetting(project),
    settings = await readCheckedSettings();
  return {
    pollSeconds: setting?.pollSeconds ?? null,
    spaceName: setting?.spaceName?.trim() || null,
    worktreeSetup: setting?.worktreeSetup?.trim() || null,
    worktreeCommand: setting?.worktreeCommand?.trim() || null,
    topLevelPollSeconds: settings?.pollSeconds ?? null,
    topLevelSpaceName: settings?.spaceName?.trim() || null,
    topLevelWorktreeCommand: settings?.worktreeCommand?.trim() || null,
  };
}

// A whole number typed as `text`, of at least `minimum`: null when it's blank, else the number. It throws
// `problem` for anything else.
/**
 * @param {string} text
 * @param {number} minimum
 * @param {string} problem
 * @returns {number | null}
 */
function parseWholeNumber(text, minimum, problem) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const number = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  if (!(number >= minimum)) throw badSetting(problem);
  return number;
}

// The pollSeconds typed as `text`: null when it's blank, else the number. It throws for anything trackerSetting
// would refuse.
/**
 * @param {string} text
 */
export function parsePollSeconds(text) {
  return parseWholeNumber(
    text,
    MIN_POLL_SECONDS,
    `The poll interval must be a whole number of seconds, ${MIN_POLL_SECONDS} or more`,
  );
}

// The updateCheckHours typed as `text`: null when it's blank, else the number. It throws for anything the top
// level would refuse.
/**
 * @param {string} text
 */
export function parseUpdateCheckHours(text) {
  return parseWholeNumber(
    text,
    MIN_UPDATE_CHECK_HOURS,
    `The update check interval must be a whole number of hours, ${MIN_UPDATE_CHECK_HOURS} or more`,
  );
}

/**
 * @param {RepositoryChanges} changes
 */
function checkRepositoryChanges(changes) {
  for (const [key, value] of Object.entries(changes)) {
    if (!REPOSITORY_KEYS.includes(key)) throw badSetting(`${key} isn't a poll, space name or worktree setting`);
    if (value == null) continue;
    if (key === "pollSeconds") checkPollSeconds(value, "This repository");
    else if (typeof value !== "string") throw badSetting(`${key} must be text`);
  }
}

// Sets the settings in `changes`, { pollSeconds, spaceName, worktreeSetup, worktreeCommand } or any of them, in the existing entry of
// the repository whose main checkout is `main`. A null or blank value removes the key, so the top level's
// pollSeconds or the default applies. It changes no other key, and writes nothing for a value trackerSetting
// would refuse or a repository without an entry.
/**
 * @param {string} main
 * @param {RepositoryChanges} changes
 */
export async function saveRepositorySettings(main, changes) {
  checkRepositoryChanges(changes);
  const cleaned = Object.fromEntries(
    Object.entries(changes).map(([key, value]) => [
      key,
      typeof value === "string" ? value.trim() || null : (value ?? null),
    ]),
  );
  await changeEntry(main, (entry) => {
    if (!entry) throw badSetting("This repository has no entry in issues.json, so choose its tracker first");
    const changed = /** @type {Record<string, unknown>} */ ({ ...entry, ...cleaned });
    for (const [key, value] of Object.entries(cleaned)) if (value == null) delete changed[key];
    return changed;
  });
}

export const TOP_LEVEL_KEYS = [
  ...APPROVAL_QUESTION_KEYS,
  "close",
  "spaceName",
  "worktreeCommand",
  "pollSeconds",
  "updateCheckHours",
];

// Sets the settings in `changes`, any of TOP_LEVEL_KEYS, at the top level of issues.json, creating the file if
// needed. Text is trimmed, and a null or blank value removes the key, so each repository's own value or the
// default applies. Changing any of approval, onApproval and waitForChecks also removes the retired merge and
// complete, so pass all three. It keeps repos and every other top-level key, and writes nothing for a key it
// doesn't take or a top level readCheckedSettings would refuse once changed.
/**
 * @param {Record<string, string | number | boolean | null | undefined>} changes
 */
export async function saveTopLevelSettings(changes) {
  const unknown = Object.keys(changes).find((key) => !TOP_LEVEL_KEYS.includes(key));
  if (unknown) throw badSetting(`${unknown} isn't a setting for every repository`);
  if (changes.close != null && !CLOSES.includes(/** @type {string} */ (changes.close)))
    throw badSetting(`close must be one of ${CLOSES.join(", ")}`);
  /** @type {[string, string | number | boolean | null][]} */
  const cleaned = Object.entries(changes).map(([key, value]) => [
    key,
    typeof value === "string" ? value.trim() || null : (value ?? null),
  ]);
  if (Object.keys(changes).some((key) => APPROVAL_KEYS.includes(key)))
    cleaned.push(...RETIRED_APPROVAL_KEYS.map((key) => /** @type {[string, null]} */ ([key, null])));
  const previous = await readSettingsText();
  const { repos, ...rest } = previous === null ? {} : parseSettings(previous);
  const settings = /** @type {Record<string, unknown>} */ (rest);
  for (const [key, value] of cleaned) {
    if (value == null) delete settings[key];
    else settings[key] = value;
  }
  checkTopLevel(/** @type {Settings} */ (settings));
  const text = `${JSON.stringify({ ...settings, ...(repos !== undefined && { repos }) }, null, 2)}\n`;
  await writeTextFile(settingsPath(), text, previous);
  forgetLookups();
}
