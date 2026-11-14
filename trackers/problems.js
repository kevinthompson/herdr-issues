// What stops a tracker from loading that the person can fix: each is an Error whose `fix` says what to do,
// in Markdown. The panel shows these in its setup view (setup.js) rather than as a line above the list.
export class SetupProblem extends Error {
  constructor(message, fix) {
    super(message);
    this.fix = fix;
  }
}

const LINEAR_KEY_FIX = "Create a personal API key in Linear under **Settings → Account → Security & access**, and save it in "
  + '`~/.config/herdr-app/linear.json` as `{ "apiKey": "lin_api_…" }`. Then check again.';

export const ghMissing = () => new SetupProblem("The GitHub CLI (gh) isn't installed",
  "Install it from [cli.github.com](https://cli.github.com) or with `brew install gh`, then check again.");
export const ghLoggedOut = () => new SetupProblem("The GitHub CLI (gh) isn't logged in",
  "Run `gh auth login` in a terminal, then check again.");
export const ghFailed = (message) => new SetupProblem(message,
  "Check that `gh auth status` shows you logged in and that your GitHub account can see the repository, then check again.");
export const originNotOnGitHub = () => new SetupProblem("This repository's origin isn't on GitHub",
  "Add the repository's GitHub copy as the `origin` remote, then check again. To track issues in another GitHub repository, run `/issues:config` in Claude.");
export const linearKeyMissing = () => new SetupProblem("No Linear API key in ~/.config/herdr-app/linear.json", LINEAR_KEY_FIX);
export const linearKeyUnreadable = () => new SetupProblem("~/.config/herdr-app/linear.json isn't valid JSON", LINEAR_KEY_FIX);
export const linearKeyInvalid = () => new SetupProblem("Linear refused the API key in ~/.config/herdr-app/linear.json", LINEAR_KEY_FIX);
export const badSetting = (message) => new SetupProblem(message,
  "Fix the repository's entry in `~/.config/herdr-app/issues.json`, or choose a different tracker to replace it.");
export const badMergeSetting = (message) => new SetupProblem(message,
  "Fix the repository's `merge` and `complete` in `~/.config/herdr-app/issues.json`, then check again. Choosing a tracker keeps them.");
export const settingsUnreadable = (message) => new SetupProblem(message,
  "Fix `~/.config/herdr-app/issues.json` so it's valid JSON, then check again.");
