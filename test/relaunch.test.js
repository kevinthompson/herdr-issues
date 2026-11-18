import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { temporaryFolder } from "./support/repository.js";

const issuesCli = fileURLToPath(new URL("../bin/issues", import.meta.url));

// A `node` that runs this one with module.registerHooks removed, as Node before 22.15 has it, the way a
// project's devbox shell can put an older node first on the PATH.
function nodeWithoutRegisterHooks(t) {
  const folder = join(temporaryFolder(t), "old-node");
  mkdirSync(folder);
  const preload = join(folder, "remove-register-hooks.cjs");
  writeFileSync(
    preload,
    'const nodeModule = require("node:module");\ndelete nodeModule.registerHooks;\nnodeModule.syncBuiltinESMExports();\n',
  );
  const node = join(folder, "node");
  writeFileSync(node, `#!/bin/sh\nexec "${process.execPath}" --require "${preload}" "$@"\n`);
  chmodSync(node, 0o755);
  return { folder, node };
}

const runWith = (node, path) =>
  spawnSync(node, [issuesCli, "--help"], { encoding: "utf8", env: { ...process.env, PATH: path.join(":") } });

test("an old node first on the PATH reruns the CLI with a newer node later on it", (t) => {
  const oldNode = nodeWithoutRegisterHooks(t);
  const result = runWith(oldNode.node, [oldNode.folder, dirname(process.execPath), "/usr/bin", "/bin"]);
  assert.equal(result.stderr, "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage/i);
});

test("an old node with no newer one on the PATH says which Node the CLI needs", (t) => {
  const oldNode = nodeWithoutRegisterHooks(t);
  const result = runWith(oldNode.node, [oldNode.folder, "/usr/bin", "/bin"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Node\.js 22\.15 or later/);
});
