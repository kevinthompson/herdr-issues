import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createRepository, temporaryFolder } from "./support/repository.js";

const hook = (name) => fileURLToPath(new URL(`../claude-plugin/hooks/${name}`, import.meta.url));

const runHook = (name, input, env) =>
  spawnSync(hook(name), { input: JSON.stringify(input), encoding: "utf8", env: { ...process.env, ...env } });

test("the created hook touches the stamp after gh creates an issue, and not otherwise", (t) => {
  const appHome = join(temporaryFolder(t), "herdr-app");
  const stamp = join(appHome, "data/issues/created");
  const env = { HERDR_APP_HOME: appHome };

  runHook("herdr-issues-created.mjs", { tool_name: "Bash", tool_input: { command: "gh issue list" }, tool_response: { stdout: "" } }, env);
  runHook("herdr-issues-created.mjs", { tool_name: "mcp__linear__save_issue", tool_input: { id: "ABC-1" } }, env);
  assert.equal(existsSync(stamp), false);

  runHook(
    "herdr-issues-created.mjs",
    {
      tool_name: "Bash",
      tool_input: { command: "gh issue create --title x" },
      tool_response: { stdout: "https://github.com/owner/repo/issues/12\n" },
    },
    env,
  );
  assert.equal(existsSync(stamp), true);
});

test("the created hook touches the stamp after save_issue creates a Linear issue", (t) => {
  const appHome = join(temporaryFolder(t), "herdr-app");

  runHook("herdr-issues-created.mjs", { tool_name: "mcp__linear__save_issue", tool_input: { title: "x" } }, { HERDR_APP_HOME: appHome });

  assert.equal(existsSync(join(appHome, "data/issues/created")), true);
});

test("the scope hook announces the listed scope and the open issue once, and when the issue closes", (t) => {
  const folder = temporaryFolder(t);
  const repository = createRepository(folder);
  const appHome = join(folder, "herdr-app");
  const env = { HERDR_APP_HOME: appHome, HC_TERMINAL_ID: "terminal-1", TMPDIR: join(folder, "tmp") };
  mkdirSync(join(appHome, "data/issues/scope"), { recursive: true });
  writeFileSync(
    join(appHome, "data/issues/scope/a.json"),
    JSON.stringify({ repo: repository, tracker: "linear", team: "CAL", scope: { kind: "project", project: { name: "Launch", url: "https://l/p" } } }),
  );
  writeFileSync(
    join(appHome, "data/issues/open.json"),
    JSON.stringify({ root: repository, id: "CAL-7", title: "Fix it", link: "https://l/CAL-7" }),
  );
  const input = { session_id: "session-1", cwd: repository };

  const first = runHook("herdr-issues-scope.mjs", input, env).stdout;
  assert.equal(
    first,
    'The Herdr issues panel for this repository lists the project "Launch" (https://l/p) in Linear, team CAL. ' +
      "Open means not completed, canceled, a duplicate or in a state named Merged. " +
      "When I refer to the issues, the project or the milestone without naming one, or ask to start the next issues, I mean this scope.\n" +
      'The Herdr issues panel has CAL-7 open: "Fix it" (https://l/CAL-7). When I say "this issue" without naming one, I mean CAL-7.\n',
  );
  assert.equal(runHook("herdr-issues-scope.mjs", input, env).stdout, "");

  writeFileSync(join(appHome, "data/issues/open.json"), "{}");
  assert.equal(
    runHook("herdr-issues-scope.mjs", input, env).stdout,
    'The Herdr issues panel no longer has an issue open, so "this issue" no longer refers to one from it.\n',
  );
});

test("the scope hook stays quiet outside a Herdr terminal", (t) => {
  const repository = createRepository(temporaryFolder(t));

  const result = runHook("herdr-issues-scope.mjs", { session_id: "s", cwd: repository }, { HC_TERMINAL_ID: "" });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});
