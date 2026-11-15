import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { issueSpaceName } from "../mod/space-name.js";
import {
  parsePollSeconds, pollSettings, repositorySettings, saveRepositorySettings, settingsPath,
} from "../mod/trackers/setting.js";

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

const readSettings = () => JSON.parse(readFileSync(settingsPath(), "utf8"));

beforeEach(() => forgetLookups());

test("a repository's settings open on its entry's values and the top level's pollSeconds", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ pollSeconds: 120, repos: { [repository]: { tracker: "beads", spaceName: "<issueId>!", worktreeSetup: "npm install" } } });
  assert.deepEqual(await repositorySettings({ root: repository, on: null }), {
    pollSeconds: null, spaceName: "<issueId>!", worktreeSetup: "npm install", topLevelPollSeconds: 120,
  });
});

test("saving writes only those keys and keeps every other repository's entry", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  const entry = { tracker: "github", repo: "owner/name", merge: "auto" }, other = { tracker: "beads", pollSeconds: 15 };
  writeSettings({ pollSeconds: 30, repos: { "/elsewhere": other, [repository]: entry } });

  await saveRepositorySettings(repository, { pollSeconds: 20, spaceName: " <repo><issueId> ", worktreeSetup: "npm install" });

  assert.deepEqual(readSettings(), {
    pollSeconds: 30,
    repos: { "/elsewhere": other, [repository]: { ...entry, pollSeconds: 20, spaceName: "<repo><issueId>", worktreeSetup: "npm install" } },
  });
  assert.equal((await pollSettings({ root: repository, on: null })).pollSeconds, 20);
  assert.equal(await issueSpaceName({ root: repository, on: null }, "#4"), "name#4");
});

test("clearing a setting removes its key, so the top level's pollSeconds or the default applies", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ pollSeconds: 90, repos: { [repository]: { tracker: "beads", pollSeconds: 20, spaceName: "x<issueId>", worktreeSetup: "make" } } });

  await saveRepositorySettings(repository, { pollSeconds: null, spaceName: "", worktreeSetup: "  " });

  assert.deepEqual(readSettings().repos[repository], { tracker: "beads" });
  assert.equal((await pollSettings({ root: repository, on: null })).pollSeconds, 90);
  assert.equal(await issueSpaceName({ root: repository, on: null }, "#4"), "#4");
});

test("a value the settings would refuse is not written", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "beads" } } });
  const before = readFileSync(settingsPath(), "utf8");

  for (const pollSeconds of [9, 12.5, "30"]) {
    await assert.rejects(saveRepositorySettings(repository, { pollSeconds }), /whole number of seconds, 10 or more/);
  }
  await assert.rejects(saveRepositorySettings(repository, { worktreeSetup: 3 }), /worktreeSetup must be text/);
  await assert.rejects(saveRepositorySettings(repository, { merge: "auto" }), /isn't a poll, space name or worktree setup setting/);
  assert.equal(readFileSync(settingsPath(), "utf8"), before);
});

test("a repository without an entry gets none from saving these settings", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: {} });
  const before = readFileSync(settingsPath(), "utf8");

  await assert.rejects(saveRepositorySettings(repository, { pollSeconds: 30 }), /no entry in issues\.json/);
  assert.equal(readFileSync(settingsPath(), "utf8"), before);
});

test("a typed poll interval is a whole number of at least 10 seconds, or blank", () => {
  assert.equal(parsePollSeconds(" 45 "), 45);
  assert.equal(parsePollSeconds("10"), 10);
  assert.equal(parsePollSeconds("  "), null);
  for (const text of ["9", "12.5", "-20", "1e3", "soon"]) {
    assert.throws(() => parsePollSeconds(text), /whole number of seconds, 10 or more/);
  }
});
