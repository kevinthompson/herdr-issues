// The package managers the person installs command-line tools with, so the fix for a missing tool names the
// command they'd run: `devbox` when its global profile holds packages, and `brew` when Homebrew is installed.
import { exec } from "herdr";

const succeeded = (result) => result?.code === 0;
const listsPackages = (result) => succeeded(result) && /^\* /m.test(result.stdout);

export async function packageManagers() {
  const [devboxGlobals, brew] = await Promise.all([
    exec("devbox", ["global", "list"]).catch(() => null),
    exec("brew", ["--version"]).catch(() => null),
  ]);
  return [listsPackages(devboxGlobals) && "devbox", succeeded(brew) && "brew"].filter(Boolean);
}

const INSTALL_COMMANDS = {
  devbox: (packageName) => `devbox global add ${packageName}`,
  brew: (packageName) => `brew install ${packageName}`,
};

// The install commands for `packageName` with each of `managers`, in Markdown, or null when there are none.
export function installCommands(managers, packageName) {
  const commands = managers.map((manager) => `\`${INSTALL_COMMANDS[manager](packageName)}\``);
  return commands.length ? commands.join(" or ") : null;
}
