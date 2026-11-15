import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { saveMergeSettings, settingsPath } from "../mod/trackers/setting.js";
import { main } from "../cli/main.js";

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

const readSettings = () => JSON.parse(readFileSync(settingsPath(), "utf8"));

const startingFolder = process.cwd();

beforeEach(() => forgetLookups());
afterEach(() => process.chdir(startingFolder));

async function setting(t, repository, key) {
  process.chdir(repository);
  const out = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", () => {});
  await main(["setting", key]);
  t.mock.restoreAll();
  return out.join("\n");
}

test("saving merge and complete keeps the entry's other keys and every other repository's entry", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  const entry = { tracker: "github", repo: "owner/name", views: { Mine: "https://example.com" }, spaceName: "<repo><issueId>", worktreeSetup: "npm install", workModel: "opus", merge: "auto" };
  const other = { tracker: "beads", merge: "review" };
  writeSettings({ pollSeconds: 30, repos: { "/elsewhere": other, [repository]: entry } });

  await saveMergeSettings(repository, { merge: "pull-request", complete: "merged" });

  assert.deepEqual(readSettings(), {
    pollSeconds: 30,
    repos: { "/elsewhere": other, [repository]: { ...entry, merge: "pull-request", complete: "merged" } },
  });
  assert.equal(await setting(t, repository, "merge"), "pull-request");
  assert.equal(await setting(t, repository, "complete"), "merged");
});

test("merging without a pull request removes complete, so the work is complete once merged", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "github", repo: "owner/name", merge: "pull-request", complete: "pull-request-open" } } });

  await saveMergeSettings(repository, { merge: "review" });

  assert.deepEqual(readSettings().repos[repository], { tracker: "github", repo: "owner/name", merge: "review" });
  assert.equal(await setting(t, repository, "merge"), "review");
  assert.equal(await setting(t, repository, "complete"), "merged");
});

test("an invalid combination is not written", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "beads", merge: "pull-request" } } });
  const before = readFileSync(settingsPath(), "utf8");

  await assert.rejects(saveMergeSettings(repository, { merge: "auto", complete: "pull-request-open" }), /complete only once merged/);
  await assert.rejects(saveMergeSettings(repository, { merge: "rebase" }), /merge must be one of/);
  await assert.rejects(saveMergeSettings(repository, { merge: "pull-request", complete: "soon" }), /complete must be one of/);
  assert.equal(readFileSync(settingsPath(), "utf8"), before);
});

test("a repository without an entry gets none from saving merge settings", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: {} });
  const before = readFileSync(settingsPath(), "utf8");

  await assert.rejects(saveMergeSettings(repository, { merge: "auto" }), /no entry in issues\.json/);
  assert.equal(readFileSync(settingsPath(), "utf8"), before);
});
