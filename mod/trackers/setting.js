// Each repository's choice of tracker, in ~/.config/herdr-app/issues.json, which /issues:config writes. Repositories
// are keyed by their main checkout's path, ~ for the home folder, so worktrees share their repository's choice:
// { "pollSeconds": 120,                                             how often every panel polls its tracker
//   "repos": {
//     "~/Code/calendar": { "tracker": "linear", "team": "CAL",      a Linear team, with saved views as extra lists
//                          "views": { "<name>": "https://linear.app/…/view/…" } },
//     "~/Code/app":      { "tracker": "github", "repo": "owner/name",   its GitHub issues; repo defaults to origin's
//                          "spaceName": "<repo><issueId>",            names issue spaces (space-name.js), here app#41
//                          "merge": "pull-request", "complete": "merged",
//                          "worktreeSetup": "box worktree-setup", "pollSeconds": 30 },
//     "~/Code/notes":    { "tracker": "beads" } } }                   the Beads database in its .beads folder
// pollSeconds, at the top level and in any entry, is how often the panel asks the tracker for its list, a whole number
// of seconds of at least 10; an entry's overrides the top level's, and pollSettings resolves it, 60 without either.
// spaceName, merge, complete and worktreeSetup are optional in any entry. In spaceName, <issueId> is the issue's ID
// and <repo> the repository's name without its owner; without it, an issue's space is named after its ID. merge is
// how an issue's branch gets into main, and complete is when its work counts as complete; mergeSettings says what
// each value means and resolves their defaults. worktreeSetup is a shell command `issues worktree` runs in each new
// checkout (cli/worktree.js).
// The file holds no secrets, so it can be shared between machines; Linear's API key stays in linear.json.
// Without an entry, a repository uses Linear. Only this computer's repositories have entries. The panel's setup
// view (setup.js) writes an entry too, with saveSetupChoices.
import { appHome, home, readTextFile, writeTextFile } from "herdr";
import { mainCheckout } from "../location.js";
import { cachedLookup, forgetLookups } from "../lookups.js";
import { githubRepository } from "./github.js";
import { badMergeSetting, badSetting, settingsUnreadable } from "./problems.js";

export const settingsPath = () => `${appHome()}/issues.json`;
const TRACKERS = ["linear", "github", "beads"];
const MERGES = ["auto", "review", "pull-request"];
const COMPLETES = ["merged", "pull-request-open"];
export const DEFAULT_POLL_SECONDS = 60;
const MIN_POLL_SECONDS = 10;
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

const readCheckedSettings = async () => {
  const settings = await readSettings();
  checkPollSeconds(settings?.pollSeconds, "issues.json");
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
  if (setting.worktreeSetup != null && typeof setting.worktreeSetup !== "string") throw badSetting(`issues.json's ${key} has a worktreeSetup that isn't text`);
  if (setting.merge != null && !MERGES.includes(setting.merge)) throw badMergeSetting(`issues.json's ${key} needs a merge of ${MERGES.join(", ")}`);
  if (setting.complete != null && !COMPLETES.includes(setting.complete)) throw badMergeSetting(`issues.json's ${key} needs a complete of ${COMPLETES.join(", ")}`);
  if (setting.complete === "pull-request-open" && setting.merge && setting.merge !== "pull-request") {
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

const hasGitHubOrigin = (main) => githubRepository(main, {}).then(() => true, () => false);

// How the repository's issue branches get into main, and when an issue's work counts as complete: when a session
// can stop and a worktree is safe to remove. merge is "auto" (merged locally at once), "review" (merged locally
// once the person approves) or "pull-request"; without the setting, a pull request when origin is on GitHub,
// else review. complete is "merged" (once the branch is in main) or "pull-request-open" (once it's pushed with
// an open pull request), which only a pull request allows and is its default.
export async function mergeSettings(project) {
  return resolveMergeSettings(await mainCheckout(project.root, project.on), await trackerSetting(project));
}

// mergeSettings for the repository whose main checkout is `main`, from `setting`, its entry or null.
export async function resolveMergeSettings(main, setting) {
  const merge = setting?.merge ?? (await hasGitHubOrigin(main) ? "pull-request" : "review");
  const complete = merge === "pull-request" ? setting?.complete ?? "pull-request-open" : "merged";
  return { merge, complete };
}

const SETUP_KEYS = ["tracker", "team", "repo", "merge", "complete"];

// Makes `setting`, a tracker with its team or repo and how work lands (merge, and complete for a pull request),
// the choices of the repository whose main checkout is `main`. It replaces those keys in any entry the
// repository has under either spelling of its path but keeps that entry's other keys, and keeps every other
// repository's entry.
export async function saveSetupChoices(main, setting) {
  const previous = await readTextFile(settingsPath()).catch(() => null);
  const settings = previous === null ? {} : parseSettings(previous);
  const entries = Object.entries(settings.repos ?? {}), key = abbreviateHome(main);
  const existing = entries.findIndex(([path]) => expandHome(path) === main);
  const kept = Object.fromEntries(Object.entries(existing === -1 ? {} : entries[existing][1])
    .filter(([name]) => !SETUP_KEYS.includes(name)));
  const others = entries.filter(([path]) => expandHome(path) !== main);
  others.splice(existing === -1 ? others.length : existing, 0, [key, { ...setting, ...kept }]);
  const text = `${JSON.stringify({ ...settings, repos: Object.fromEntries(others) }, null, 2)}\n`;
  await writeTextFile(settingsPath(), text, previous);
  forgetLookups();
}
