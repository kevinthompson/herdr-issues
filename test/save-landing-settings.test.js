import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { landingSources, saveLandingSettings, saveSetupChoices, settingsPath } from "../mod/trackers/setting.js";
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
  forgetLookups();
  const out = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", () => {});
  await main(["setting", key]);
  t.mock.restoreAll();
  return out.join("\n");
}

test("saving landing settings keeps the entry's other keys and every other repository's entry", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  const entry = { tracker: "github", repo: "owner/name", views: { Mine: "https://example.com" }, spaceName: "<repo><issueId>", worktreeSetup: "npm install", workModel: "opus", close: "auto" };
  const other = { tracker: "beads", merge: "review" };
  writeSettings({ pollSeconds: 30, repos: { "/elsewhere": other, [repository]: entry } });

  await saveLandingSettings(repository, { approval: "auto", onApproval: "pull-request", waitForChecks: true });

  assert.deepEqual(readSettings(), {
    pollSeconds: 30,
    repos: { "/elsewhere": other, [repository]: { ...entry, approval: "auto", onApproval: "pull-request", waitForChecks: true } },
  });
  assert.equal(await setting(t, repository, "approval"), "auto");
  assert.equal(await setting(t, repository, "onApproval"), "pull-request");
  assert.equal(await setting(t, repository, "waitForChecks"), "true");
});

test("saving landing settings removes the retired merge and complete", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "beads", merge: "pull-request", complete: "pull-request-passing" } } });

  await saveLandingSettings(repository, { approval: "ask", onApproval: "merge" });

  assert.deepEqual(readSettings().repos[repository], { tracker: "beads", approval: "ask", onApproval: "merge" });
});

test("a null value removes it from the entry, so the global value or default applies", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ approval: "auto", repos: { [repository]: { tracker: "beads", approval: "ask", onApproval: "pull-request", waitForChecks: true } } });

  await saveLandingSettings(repository, { approval: null, onApproval: null, waitForChecks: null });

  assert.deepEqual(readSettings().repos[repository], { tracker: "beads" });
  assert.equal(await setting(t, repository, "approval"), "auto");
  assert.equal(await setting(t, repository, "onApproval"), "merge");
  assert.equal(await setting(t, repository, "waitForChecks"), "false");
});

test("a value trackerSetting would refuse is not written", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "beads" } } });
  const before = readFileSync(settingsPath(), "utf8");

  await assert.rejects(saveLandingSettings(repository, { approval: "sometimes" }), /needs an approval of ask, auto/);
  await assert.rejects(saveLandingSettings(repository, { onApproval: "rebase" }), /needs an onApproval of merge, pull-request/);
  await assert.rejects(saveLandingSettings(repository, { waitForChecks: "yes" }), /needs a waitForChecks of true or false/);
  assert.equal(readFileSync(settingsPath(), "utf8"), before);
});

test("a repository without an entry gets none from saving landing settings", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: {} });
  const before = readFileSync(settingsPath(), "utf8");

  await assert.rejects(saveLandingSettings(repository, { approval: "auto" }), /no entry in issues\.json/);
  assert.equal(readFileSync(settingsPath(), "utf8"), before);
});

test("the setup choices replace the landing settings and the retired merge and complete", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "beads", merge: "pull-request", complete: "merged", waitForChecks: true, close: "auto" } } });

  await saveSetupChoices(repository, { tracker: "github", approval: "ask", onApproval: "merge" });

  assert.deepEqual(readSettings().repos[repository], { tracker: "github", approval: "ask", onApproval: "merge", close: "auto" });
});

test("landing sources give the entry's and top level's own values, the retired keys' meanings, and the default onApproval", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ complete: "pull-request-passing", close: "auto", repos: { [repository]: { tracker: "beads", merge: "review", approval: "auto" } } });

  assert.deepEqual(await landingSources({ root: repository, on: null }), {
    entry: { approval: "auto", onApproval: "merge", waitForChecks: null, close: null },
    topLevel: { approval: null, onApproval: null, waitForChecks: true, close: "auto" },
    defaultOnApproval: "merge",
  });
});
