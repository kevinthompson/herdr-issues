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
export const KEYCHAIN = "the macOS Keychain";
const LINEAR_KEY_FIX =
  `Create a personal API key in Linear under **Settings → Account → Security & access** (${LINEAR_KEY_PAGE}), paste it in the Issues panel's API key field ` +
  "and choose **Save key**, which keeps it in the macOS Keychain. Or save it in the Keychain yourself with " +
  "`security add-generic-password -U -s herdr-issues -a linear -w`, which asks for the key, then check again.";
const KEYCHAIN_ACCESS_FIX =
  "Unlock the macOS Keychain, or allow access when it asks, then check again. If the item is damaged, " +
  "delete it with `security delete-generic-password -s herdr-issues -a linear` and save the key again: " +
  LINEAR_KEY_FIX;

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
export const linearKeyMissing = (store = KEYCHAIN) =>
  new SetupProblem(`No Linear API key in ${store}`, LINEAR_KEY_FIX, LINEAR_KEY_PROBLEM);
/**
 * @param {string} reason
 * @param {string} [store]
 */
export const linearKeyUnreadable = (reason, store = KEYCHAIN) =>
  new SetupProblem(
    `Couldn't read the Linear API key from ${store}${reason ? ` (${reason})` : ""}`,
    store === KEYCHAIN ? KEYCHAIN_ACCESS_FIX : LINEAR_KEY_FIX,
    LINEAR_KEY_PROBLEM,
  );
/** @param {string} reason */
export const linearKeyUnsaved = (reason) =>
  new SetupProblem(
    `Couldn't save the Linear API key in ${KEYCHAIN}${reason ? ` (${reason})` : ""}`,
    KEYCHAIN_ACCESS_FIX,
    LINEAR_KEY_PROBLEM,
  );
export const linearKeyInvalid = (store = KEYCHAIN) =>
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
