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

test("/issues:create runs on sonnet at its default effort without the settings", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: githubEntry() } });
  assert.equal((await setting(t, repository, "createModel")).out, "sonnet");
  assert.equal((await setting(t, repository, "createEffort")).out, "default");
});

test("top-level createModel and createEffort apply to every repository", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ createModel: "haiku", createEffort: "low", repos: {} });
  assert.equal((await setting(t, repository, "createModel")).out, "haiku");
  assert.equal((await setting(t, repository, "createEffort")).out, "low");
});

test("a repository's createModel and createEffort override the top level's", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ createModel: "haiku", createEffort: "low", repos: { [repository]: githubEntry({ createModel: "inherit", createEffort: "high" }) } });
  assert.equal((await setting(t, repository, "createModel")).out, "inherit");
  assert.equal((await setting(t, repository, "createEffort")).out, "high");
});

test("a repository's createModel that isn't a model alias is refused, listing the allowed values", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: githubEntry({ createModel: "gpt" }) } });
  const result = await setting(t, repository, "createModel");
  assert.equal(result.code, 1);
  assert.match(result.err, new RegExp(`issues.json's ${repository} needs a createModel of inherit, sonnet, opus, haiku, fable`));
});

test("a top-level createEffort that isn't an effort level is refused", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ createEffort: "extreme", repos: {} });
  const result = await setting(t, repository, "createEffort");
  assert.equal(result.code, 1);
  assert.match(result.err, /issues\.json needs a createEffort of default, low, medium, high, xhigh, max/);
});
