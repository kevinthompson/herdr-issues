import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { saveTrackerChoice, settingsPath, trackerSetting } from "../mod/trackers/setting.js";

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

const readSettings = () => JSON.parse(readFileSync(settingsPath(), "utf8"));

beforeEach(() => forgetLookups());

const keptKeys = { views: { Mine: "https://example.com" }, spaceName: "<repo><issueId>", worktreeSetup: "npm install", workModel: "opus", merge: "pull-request", complete: "merged" };
const other = { tracker: "beads", merge: "review" };

for (const [name, from, choice, expected] of [
  ["Linear to Beads drops the team", { tracker: "linear", team: "WEB" }, { tracker: "beads" }, { tracker: "beads" }],
  ["Linear to GitHub drops the team", { tracker: "linear", team: "WEB" }, { tracker: "github" }, { tracker: "github" }],
  ["GitHub to Linear drops the repo", { tracker: "github", repo: "owner/name" }, { tracker: "linear", team: "APP" }, { tracker: "linear", team: "APP" }],
  ["Beads to GitHub keeps a repo it's given", { tracker: "beads" }, { tracker: "github", repo: "owner/other" }, { tracker: "github", repo: "owner/other" }],
  ["Linear to another Linear team", { tracker: "linear", team: "WEB" }, { tracker: "linear", team: "APP" }, { tracker: "linear", team: "APP" }],
]) {
  test(`saving a tracker from ${name}, keeping the entry's other keys and other repositories' entries`, async (t) => {
    const repository = createRepository(temporaryFolder(t));
    writeSettings({ pollSeconds: 30, repos: { "/elsewhere": other, [repository]: { ...from, ...keptKeys } } });

    await saveTrackerChoice(repository, choice);

    assert.deepEqual(readSettings(), { pollSeconds: 30, repos: { "/elsewhere": other, [repository]: { ...expected, ...keptKeys } } });
    assert.deepEqual(await trackerSetting({ root: repository, on: null }), { ...expected, ...keptKeys });
  });
}

test("saving a tracker for a repository without an entry adds one", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { "/elsewhere": other } });

  await saveTrackerChoice(repository, { tracker: "beads" });

  assert.deepEqual(readSettings().repos, { "/elsewhere": other, [repository]: { tracker: "beads" } });
});

test("a tracker it can't use is not written", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "beads", merge: "review" } } });
  const before = readFileSync(settingsPath(), "utf8");

  await assert.rejects(saveTrackerChoice(repository, { tracker: "jira" }), /tracker must be one of/);
  await assert.rejects(saveTrackerChoice(repository, { tracker: "linear" }), /needs a team/);
  assert.equal(readFileSync(settingsPath(), "utf8"), before);
});
