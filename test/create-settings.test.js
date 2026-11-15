import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { saveAgentSettings, settingsPath } from "../mod/trackers/setting.js";
import { main } from "../cli/main.js";

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

const readSettings = () => JSON.parse(readFileSync(settingsPath(), "utf8"));

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
  t.mock.restoreAll();
  return { code, out: out.join("\n"), err: err.join("\n") };
}

// The retired settings that chose the model and effort of the background agent that used to write issues.
const retired = { createModel: "haiku", createEffort: "extreme" };

test("an issues.json with the retired createModel and createEffort still loads, ignoring them", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ ...retired, repos: { [repository]: { tracker: "github", repo: "owner/name", ...retired, workModel: "opus" } } });

  const result = await setting(t, repository, "workModel");

  assert.equal(result.code, 0);
  assert.equal(result.out, "opus");
});

test("saving a work setting leaves the retired keys in the file", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ ...retired, repos: { [repository]: { tracker: "beads", ...retired } } });

  await saveAgentSettings(repository, { workEffort: "high" });

  assert.deepEqual(readSettings(), { ...retired, repos: { [repository]: { tracker: "beads", ...retired, workEffort: "high" } } });
});

test("issues setting refuses createModel and createEffort as unknown keys", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "beads" } } });

  for (const key of ["createModel", "createEffort"]) {
    const result = await setting(t, repository, key);
    assert.notEqual(result.code, 0);
    assert.match(result.err, new RegExp(`setting has no key ${key}`));
  }
});

test("the retired keys can't be saved as model and effort settings", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "beads" } } });

  await assert.rejects(saveAgentSettings(repository, { createModel: "opus" }), /isn't a model or effort setting/);
});
