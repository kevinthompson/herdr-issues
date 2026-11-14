import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { pollSettings, settingsPath } from "../mod/trackers/setting.js";

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

const githubEntry = (extra = {}) => ({ tracker: "github", repo: "owner/name", ...extra });

beforeEach(() => forgetLookups());

test("the panel polls every 60 seconds without a pollSeconds", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: githubEntry() } });
  assert.equal((await pollSettings({ root: repository, on: null })).pollSeconds, 60);
});

test("a top-level pollSeconds sets every repository's interval", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ pollSeconds: 120, repos: { [repository]: githubEntry() } });
  assert.equal((await pollSettings({ root: repository, on: null })).pollSeconds, 120);
});

test("a top-level pollSeconds applies to a repository with no entry", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ pollSeconds: 90, repos: {} });
  assert.equal((await pollSettings({ root: repository, on: null })).pollSeconds, 90);
});

test("a repository's pollSeconds overrides the top level's", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ pollSeconds: 120, repos: { [repository]: githubEntry({ pollSeconds: 30 }) } });
  assert.equal((await pollSettings({ root: repository, on: null })).pollSeconds, 30);
});

for (const pollSeconds of [5, 12.5, "30"]) {
  test(`a pollSeconds of ${JSON.stringify(pollSeconds)} is refused, naming the entry and the allowed range`, async (t) => {
    const repository = createRepository(temporaryFolder(t));
    writeSettings({ repos: { [repository]: githubEntry({ pollSeconds }) } });
    await assert.rejects(pollSettings({ root: repository, on: null }), (error) => {
      assert.match(error.message, new RegExp(`issues.json's ${repository} needs a pollSeconds .*10 or more`));
      assert.ok(error.fix);
      return true;
    });
  });
}

test("a top-level pollSeconds below 10 is refused", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ pollSeconds: 9, repos: {} });
  await assert.rejects(pollSettings({ root: repository, on: null }), /issues\.json needs a pollSeconds .*10 or more/);
});
