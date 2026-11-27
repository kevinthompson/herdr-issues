import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { saveRepositorySettings, saveTopLevelSettings, settingsPath } from "../mod/trackers/setting.js";
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
  const out = [],
    err = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", (line) => err.push(line));
  const code = await main(["setting", key]);
  t.mock.restoreAll();
  return { code, out: out.join("\n"), err: err.join("\n") };
}

// Retired settings: the model and effort of the background agent that used to write issues, and the model, effort
// and appended prompt of the Claude sessions the panel used to start, which worktreeCommand replaced. Values they
// once refused still load.
const retired = {
  createModel: "haiku",
  createEffort: "extreme",
  workModel: "two words",
  workEffort: "extreme",
  workPrompt: 3,
};

test("an issues.json with the retired settings still loads, ignoring them", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({
    ...retired,
    repos: { [repository]: { tracker: "github", repo: "owner/name", ...retired, close: "auto" } },
  });

  const result = await setting(t, repository, "close");

  assert.equal(result.code, 0);
  assert.equal(result.out, "auto");
});

test("saving a repository setting leaves the retired keys in the file", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ ...retired, repos: { [repository]: { tracker: "beads", ...retired } } });

  await saveRepositorySettings(repository, { pollSeconds: 30 });

  assert.deepEqual(readSettings(), {
    ...retired,
    repos: { [repository]: { tracker: "beads", ...retired, pollSeconds: 30 } },
  });
});

test("issues setting refuses the retired settings as unknown keys", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "beads" } } });

  for (const key of Object.keys(retired)) {
    const result = await setting(t, repository, key);
    assert.notEqual(result.code, 0);
    assert.match(result.err, new RegExp(`setting has no key ${key}`));
  }
});

test("the retired settings can't be saved at the top level", async () => {
  for (const key of Object.keys(retired)) {
    await assert.rejects(saveTopLevelSettings({ [key]: "x" }), /isn't a setting for every repository/);
  }
});
