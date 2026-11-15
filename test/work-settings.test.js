import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { settingsPath } from "../mod/trackers/setting.js";
import { main } from "../cli/main.js";

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

const githubEntry = (extra = {}) => ({ tracker: "github", repo: "owner/name", ...extra });

const startingFolder = process.cwd();

beforeEach(() => forgetLookups());
afterEach(() => process.chdir(startingFolder));

// Runs `issues setting <key>` in `repository`, returning its exit code and what it printed.
async function setting(t, repository, key) {
  process.chdir(repository);
  const out = [], err = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", (line) => err.push(line));
  const code = await main(["setting", key]);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("issue sessions inherit the person's model and effort without the settings", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: githubEntry() } });
  assert.equal((await setting(t, repository, "workModel")).out, "inherit");
  assert.equal((await setting(t, repository, "workEffort")).out, "default");
});

test("top-level workModel and workEffort apply to every repository", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ workModel: "haiku", workEffort: "low", repos: {} });
  assert.equal((await setting(t, repository, "workModel")).out, "haiku");
  assert.equal((await setting(t, repository, "workEffort")).out, "low");
});

test("a repository's workModel and workEffort override the top level's", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ workModel: "haiku", workEffort: "low", repos: { [repository]: githubEntry({ workModel: "claude-opus-5-5", workEffort: "high" }) } });
  assert.equal((await setting(t, repository, "workModel")).out, "claude-opus-5-5");
  assert.equal((await setting(t, repository, "workEffort")).out, "high");
});

test("a repository's workModel that isn't one word is refused", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: githubEntry({ workModel: "sonnet --dangerously-skip-permissions" }) } });
  const result = await setting(t, repository, "workModel");
  assert.equal(result.code, 1);
  assert.match(result.err, new RegExp(`issues.json's ${repository} needs a workModel of inherit, a model alias such as sonnet, or a model's full name`));
});

test("a top-level workEffort that isn't an effort level is refused", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ workEffort: "extreme", repos: {} });
  const result = await setting(t, repository, "workEffort");
  assert.equal(result.code, 1);
  assert.match(result.err, /issues\.json needs a workEffort of default, low, medium, high, xhigh, max/);
});
