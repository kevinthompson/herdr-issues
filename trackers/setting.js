// Each repository's choice of tracker, in ~/.config/herdr-app/issues.json, which /issues:config writes. Repositories
// are keyed by their main checkout's path, ~ for the home folder, so worktrees share their repository's choice:
// { "repos": {
//     "~/Code/calendar": { "tracker": "linear", "team": "CAL",      a Linear team, with saved views as extra lists
//                          "views": { "<name>": "https://linear.app/…/view/…" } },
//     "~/Code/app":      { "tracker": "github", "repo": "owner/name" } } }   its GitHub issues; repo defaults to origin's
// The file holds no secrets, so it can be shared between machines; Linear's API key stays in linear.json.
// Without an entry, a repository uses Linear. Only this computer's repositories have entries.
import { appHome, home, readTextFile } from "herdr";
import { mainCheckout } from "../location.js";

export const settingsPath = () => `${appHome()}/issues.json`;
const TRACKERS = ["linear", "github"];
const expandHome = (path) => (path.startsWith("~/") ? `${home()}${path.slice(1)}` : path);

// The repository's entry, or null when it has none.
export async function trackerSetting({ root, on }) {
  if (on != null) return null;
  const text = await readTextFile(settingsPath()).catch(() => null);
  if (text === null) return null;
  let settings;
  try { settings = JSON.parse(text); } catch (e) { throw new Error(`issues.json isn't valid JSON: ${e.message ?? e}`); }
  const main = await mainCheckout(root, on);
  const [key, setting] = Object.entries(settings?.repos ?? {}).find(([path]) => expandHome(path) === main) ?? [];
  if (!setting) return null;
  if (!TRACKERS.includes(setting.tracker)) throw new Error(`issues.json's ${key} needs a tracker: ${TRACKERS.join(", ")}`);
  if (setting.tracker === "linear" && !setting.team) throw new Error(`issues.json's ${key} needs the Linear team's key`);
  return setting;
}
