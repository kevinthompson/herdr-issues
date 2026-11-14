// Each repository's choice of tracker, in ~/.config/herdr-app/issues.json, which /issues:config writes. Repositories
// are keyed by their main checkout's path, ~ for the home folder, so worktrees share their repository's choice:
// { "repos": {
//     "~/Code/calendar": { "tracker": "linear", "team": "CAL",      a Linear team, with saved views as extra lists
//                          "views": { "<name>": "https://linear.app/…/view/…" } },
//     "~/Code/app":      { "tracker": "github", "repo": "owner/name",   its GitHub issues; repo defaults to origin's
//                          "spaceName": "<repo><issueId>" } } }        names issue spaces (space-name.js), here app#41
// spaceName is optional in any entry: <issueId> is the issue's ID and <repo> the repository's name without its owner;
// without it, an issue's space is named after its ID.
// The file holds no secrets, so it can be shared between machines; Linear's API key stays in linear.json.
// Without an entry, a repository uses Linear. Only this computer's repositories have entries. The panel's setup
// view (setup.js) writes an entry too, with saveTrackerSetting.
import { appHome, home, readTextFile, writeTextFile } from "herdr";
import { mainCheckout } from "../location.js";
import { badSetting, settingsUnreadable } from "./problems.js";

export const settingsPath = () => `${appHome()}/issues.json`;
const TRACKERS = ["linear", "github"];
const expandHome = (path) => (path.startsWith("~/") ? `${home()}${path.slice(1)}` : path);
const abbreviateHome = (path) => (path.startsWith(`${home()}/`) ? `~${path.slice(home().length)}` : path);

function parseSettings(text) {
  try { return JSON.parse(text); } catch (e) { throw settingsUnreadable(`issues.json isn't valid JSON: ${e.message ?? e}`); }
}

// The repository's entry, or null when it has none.
export async function trackerSetting({ root, on }) {
  if (on != null) return null;
  const text = await readTextFile(settingsPath()).catch(() => null);
  if (text === null) return null;
  const settings = parseSettings(text);
  const main = await mainCheckout(root, on);
  const [key, setting] = Object.entries(settings?.repos ?? {}).find(([path]) => expandHome(path) === main) ?? [];
  if (!setting) return null;
  if (!TRACKERS.includes(setting.tracker)) throw badSetting(`issues.json's ${key} needs a tracker: ${TRACKERS.join(", ")}`);
  if (setting.tracker === "linear" && !setting.team) throw badSetting(`issues.json's ${key} needs the Linear team's key`);
  if (setting.spaceName != null && typeof setting.spaceName !== "string") throw badSetting(`issues.json's ${key} has a spaceName that isn't text`);
  return setting;
}

// Makes `setting` the entry of the repository whose main checkout is `main`, in place of any entry it has
// under either spelling of its path, and keeps every other repository's.
export async function saveTrackerSetting(main, setting) {
  const previous = await readTextFile(settingsPath()).catch(() => null);
  const settings = previous === null ? {} : parseSettings(previous);
  const entries = Object.entries(settings.repos ?? {}), key = abbreviateHome(main);
  const existing = entries.findIndex(([path]) => expandHome(path) === main);
  const others = entries.filter(([path]) => expandHome(path) !== main);
  others.splice(existing === -1 ? others.length : existing, 0, [key, setting]);
  const text = `${JSON.stringify({ ...settings, repos: Object.fromEntries(others) }, null, 2)}\n`;
  await writeTextFile(settingsPath(), text, previous);
}
