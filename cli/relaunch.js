// Reruns the issues CLI with a node that has module.registerHooks, which Node added in 22.15, when the node
// running it lacks it. A project's own toolchain, such as a devbox shell pinning Node 20, can put an older node
// first on the PATH while the person's newer one comes later on it.
import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

const minimumNodeVersion = "22.15";

const isExecutable = (path) => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const nodesOnPath = () => [
  ...new Set(
    (process.env.PATH ?? "")
      .split(delimiter)
      .filter(Boolean)
      .map((folder) => join(folder, "node"))
      .filter(isExecutable),
  ),
];

const hasRegisterHooks = (node) =>
  spawnSync(node, ["-e", 'process.exit(require("node:module").registerHooks ? 0 : 1)'], { stdio: "ignore" }).status ===
  0;

// Runs script with args under the first node on the PATH that has registerHooks, and returns its exit code.
export function relaunchWithNewerNode(script, args) {
  const node = nodesOnPath().find(hasRegisterHooks);
  if (!node) {
    console.error(
      `issues: needs Node.js ${minimumNodeVersion} or later, but ${process.execPath} is ${process.version} and no newer node is on the PATH`,
    );
    return 1;
  }
  const result = spawnSync(node, [script, ...args], { stdio: "inherit" });
  if (result.signal) process.kill(process.pid, result.signal);
  return result.status ?? 1;
}
