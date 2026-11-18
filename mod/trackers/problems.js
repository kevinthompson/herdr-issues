// What stops a tracker from loading that the person can fix: each is an Error whose `fix` says what to do,
// in Markdown, and whose `code`, when set, names a problem the setup view can fix itself. The panel shows these
// in its setup view (setup.js) rather than as a line above the list.
import { installCommands, packageManagers } from "../package-managers.js";

export class SetupProblem extends Error {
  /**
   * @param {string} message
   * @param {string} fix
   * @param {string | null} [code]
   */
  constructor(message, fix, code = null) {
    super(message);
    this.fix = fix;
    this.code = code;
  }
}

export const LINEAR_KEY_PAGE = "https://linear.app/settings/account/security";
export const LINEAR_KEY_FILE = "~/.config/herdr-app/linear.json";
export const LINEAR_KEY_VARIABLE = "LINEAR_API_KEY";
const LINEAR_KEY_FIX =
  `Create a personal API key in Linear under **Settings → Account → Security & access** (${LINEAR_KEY_PAGE}), paste it in the Issues panel's API key field ` +
  `and choose **Save key**, which keeps it in \`${LINEAR_KEY_FILE}\`. Or add it to that file yourself as ` +
  '`"apiKey"`, such as `{ "apiKey": "lin_api_…" }`, or set `' +
  LINEAR_KEY_VARIABLE +
  "` in your shell profile, then check again. A key in the file takes precedence over the variable.";

// Installing a missing tool with the person's package managers, or as `instructions` say when they have none.
/**
 * @param {string} packageName
 * @param {string} instructions
 */
async function installFix(packageName, instructions) {
  const commands = installCommands(await packageManagers(), packageName);
  return `Install it ${commands ? `with ${commands}` : instructions}, then check again.`;
}

export const ghMissing = async () =>
  new SetupProblem(
    "The GitHub CLI (gh) isn't installed",
    await installFix("gh", "from [cli.github.com](https://cli.github.com)"),
  );
export const ghLoggedOut = () =>
  new SetupProblem("The GitHub CLI (gh) isn't logged in", "Run `gh auth login` in a terminal, then check again.");
/** @param {string} message */
export const ghFailed = (message) =>
  new SetupProblem(
    message,
    "Check that `gh auth status` shows you logged in and that your GitHub account can see the repository, then check again.",
  );
export const originNotOnGitHub = () =>
  new SetupProblem(
    "This repository's origin isn't on GitHub",
    "Add the repository's GitHub copy as the `origin` remote, then check again. To track issues in another GitHub repository, run `/issues:config` in Claude.",
  );
export const bdMissing = async () =>
  new SetupProblem(
    "The Beads CLI (bd) isn't installed",
    await installFix("beads", "as [Beads' README](https://github.com/steveyegge/beads) says"),
  );
export const BEADS_NOT_INITIALIZED = "beads-not-initialized";
export const beadsNotInitialized = () =>
  new SetupProblem(
    "This repository has no Beads database",
    "Run `bd init` in the repository's main checkout, then check again.",
    BEADS_NOT_INITIALIZED,
  );
/** @param {string} message */
export const bdFailed = (message) =>
  new SetupProblem(message, "Check that `bd list` works in the repository's main checkout, then check again.");
export const LINEAR_KEY_PROBLEM = "linear-key";
export const linearKeyMissing = () =>
  new SetupProblem(
    `No Linear API key in ${LINEAR_KEY_FILE} or ${LINEAR_KEY_VARIABLE}`,
    LINEAR_KEY_FIX,
    LINEAR_KEY_PROBLEM,
  );
/** @param {string} reason */
export const linearKeyUnreadable = (reason) =>
  new SetupProblem(
    `Couldn't read the Linear API key from ${LINEAR_KEY_FILE} (${reason})`,
    LINEAR_KEY_FIX,
    LINEAR_KEY_PROBLEM,
  );
// `store` is LINEAR_KEY_FILE or LINEAR_KEY_VARIABLE, whichever the refused key came from.
/** @param {string} store */
export const linearKeyInvalid = (store) =>
  new SetupProblem(`Linear refused the API key in ${store}`, LINEAR_KEY_FIX, LINEAR_KEY_PROBLEM);
/** @param {string} message */
export const badSetting = (message) =>
  new SetupProblem(
    message,
    "Fix the repository's entry in `~/.config/herdr-app/issues.json`, or choose a different tracker to replace it.",
  );
/** @param {string} message */
export const badApprovalSetting = (message) =>
  new SetupProblem(
    message,
    "Fix the repository's `approval`, `onApproval`, `waitForChecks` and `pushAfterMerge` in `~/.config/herdr-app/issues.json`, then check again, or choose a tracker again to choose them anew.",
  );
/** @param {string} message */
export const settingsUnreadable = (message) =>
  new SetupProblem(message, "Fix `~/.config/herdr-app/issues.json` so it's valid JSON, then check again.");
