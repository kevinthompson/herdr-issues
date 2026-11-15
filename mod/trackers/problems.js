// What stops a tracker from loading that the person can fix: each is an Error whose `fix` says what to do,
// in Markdown, and whose `code`, when set, names a problem the setup view can fix itself. The panel shows these
// in its setup view (setup.js) rather than as a line above the list.
import { installCommands, packageManagers } from "../package-managers.js";

export class SetupProblem extends Error {
  constructor(message, fix, code = null) {
    super(message);
    this.fix = fix;
    this.code = code;
  }
}

const LINEAR_KEY_FIX = "Create a personal API key in Linear under **Settings → Account → Security & access**, and save it in "
  + '`~/.config/herdr-app/linear.json` as `{ "apiKey": "lin_api_…" }`. Then check again.';

// Installing a missing tool with the person's package managers, or as `instructions` say when they have none.
async function installFix(packageName, instructions) {
  const commands = installCommands(await packageManagers(), packageName);
  return `Install it ${commands ? `with ${commands}` : instructions}, then check again.`;
}

export const ghMissing = async () => new SetupProblem("The GitHub CLI (gh) isn't installed",
  await installFix("gh", "from [cli.github.com](https://cli.github.com)"));
export const ghLoggedOut = () => new SetupProblem("The GitHub CLI (gh) isn't logged in",
  "Run `gh auth login` in a terminal, then check again.");
export const ghFailed = (message) => new SetupProblem(message,
  "Check that `gh auth status` shows you logged in and that your GitHub account can see the repository, then check again.");
export const originNotOnGitHub = () => new SetupProblem("This repository's origin isn't on GitHub",
  "Add the repository's GitHub copy as the `origin` remote, then check again. To track issues in another GitHub repository, run `/issues:config` in Claude.");
export const bdMissing = async () => new SetupProblem("The Beads CLI (bd) isn't installed",
  await installFix("beads", "as [Beads' README](https://github.com/steveyegge/beads) says"));
export const BEADS_NOT_INITIALIZED = "beads-not-initialized";
export const beadsNotInitialized = () => new SetupProblem("This repository has no Beads database",
  "Run `bd init` in the repository's main checkout, then check again.", BEADS_NOT_INITIALIZED);
export const bdFailed = (message) => new SetupProblem(message,
  "Check that `bd list` works in the repository's main checkout, then check again.");
export const linearKeyMissing = () => new SetupProblem("No Linear API key in ~/.config/herdr-app/linear.json", LINEAR_KEY_FIX);
export const linearKeyUnreadable = () => new SetupProblem("~/.config/herdr-app/linear.json isn't valid JSON", LINEAR_KEY_FIX);
export const linearKeyInvalid = () => new SetupProblem("Linear refused the API key in ~/.config/herdr-app/linear.json", LINEAR_KEY_FIX);
export const badSetting = (message) => new SetupProblem(message,
  "Fix the repository's entry in `~/.config/herdr-app/issues.json`, or choose a different tracker to replace it.");
export const badMergeSetting = (message) => new SetupProblem(message,
  "Fix the repository's `merge` and `complete` in `~/.config/herdr-app/issues.json`, then check again, or choose a tracker again to choose them anew.");
export const settingsUnreadable = (message) => new SetupProblem(message,
  "Fix `~/.config/herdr-app/issues.json` so it's valid JSON, then check again.");
