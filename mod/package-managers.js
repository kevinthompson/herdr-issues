// The package managers the person installs command-line tools with, so the fix for a missing tool names the
// command they'd run: `devbox` when its global profile holds packages, and `brew` when Homebrew is installed.
import { exec } from "herdr";
/** @import { ExecResult } from "herdr" */

/** @param {ExecResult | null} result */
const succeeded = (result) => result?.code === 0;
/** @param {ExecResult | null} result */
const listsPackages = (result) => succeeded(result) && /^\* /m.test(result.stdout);

export async function packageManagers() {
  const [devboxGlobals, brew] = await Promise.all([
    exec("devbox", ["global", "list"]).catch(/** @returns {ExecResult | null} */ () => null),
    exec("brew", ["--version"]).catch(/** @returns {ExecResult | null} */ () => null),
  ]);
  return /** @type {string[]} */ (
    [listsPackages(devboxGlobals) && "devbox", succeeded(brew) && "brew"].filter(Boolean)
  );
}

/** @type {Record<string, (packageName: string) => string>} */
const INSTALL_COMMANDS = {
  devbox: (packageName) => `devbox global add ${packageName}`,
  brew: (packageName) => `brew install ${packageName}`,
};

// The install commands for `packageName` with each of `managers`, in Markdown, or null when there are none.
/** @param {string[]} managers @param {string} packageName */
export function installCommands(managers, packageName) {
  const commands = managers.map((manager) => `\`${INSTALL_COMMANDS[manager](packageName)}\``);
  return commands.length ? commands.join(" or ") : null;
}
