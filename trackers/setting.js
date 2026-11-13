// A repository's own choice of tracker: .issues.json in its main checkout, which /issues:config writes and
// keeps out of git through .git/info/exclude, since the choice belongs to this machine's checkout.
//   { "tracker": "local" }                      its issues/ folder
//   { "tracker": "linear", "team": "CAL", "views": { "<name>": "https://linear.app/…/view/…" } }
//   { "tracker": "github", "repo": "owner/name" }  its GitHub issues; repo defaults to origin's
// Without one, a repository's issues/ folder wins, then Linear.
import { readTextFile } from "herdr";
import { mainCheckout } from "../location.js";

export const SETTING_FILE = ".issues.json";
const TRACKERS = ["local", "linear", "github"];

// The setting, or null when the repository has none.
export async function trackerSetting({ root, on }) {
  const main = await mainCheckout(root, on);
  const text = await readTextFile(`${main}/${SETTING_FILE}`, { on }).catch(() => null);
  if (text === null) return null;
  let setting;
  try { setting = JSON.parse(text); } catch (e) { throw new Error(`${SETTING_FILE} isn't valid JSON: ${e.message ?? e}`); }
  if (!TRACKERS.includes(setting?.tracker)) throw new Error(`${SETTING_FILE} needs a tracker: ${TRACKERS.join(", ")}`);
  if (setting.tracker === "linear" && !setting.team) throw new Error(`${SETTING_FILE} needs the Linear team's key`);
  return setting;
}
