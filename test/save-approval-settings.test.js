import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { approvalSources, saveApprovalSettings, saveSetupChoices, settingsPath } from "../mod/trackers/setting.js";
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

test("saving approval settings keeps the entry's other keys and every other repository's entry", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  const entry = {
    tracker: "github",
    repo: "owner/name",
    views: { Mine: "https://example.com" },
    spaceName: "<repo><issueId>",
    worktreeSetup: "npm install",
    workModel: "opus",
    close: "auto",
  };
  const other = { tracker: "beads", merge: "review" };
  writeSettings({ pollSeconds: 30, repos: { "/elsewhere": other, [repository]: entry } });

  await saveApprovalSettings(repository, { approval: "auto", onApproval: "pull-request", waitForChecks: true });

  assert.deepEqual(readSettings(), {
    pollSeconds: 30,
    repos: {
      "/elsewhere": other,
      [repository]: { ...entry, approval: "auto", onApproval: "pull-request", waitForChecks: true },
    },
  });
  assert.equal(await setting(t, repository, "approval"), "auto");
  assert.equal(await setting(t, repository, "onApproval"), "pull-request");
  assert.equal(await setting(t, repository, "waitForChecks"), "true");
});

test("saving approval settings removes the retired merge and complete", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({
    repos: { [repository]: { tracker: "beads", merge: "pull-request", complete: "pull-request-passing" } },
  });

  await saveApprovalSettings(repository, { approval: "ask", onApproval: "merge" });

  assert.deepEqual(readSettings().repos[repository], { tracker: "beads", approval: "ask", onApproval: "merge" });
});

test("a null value removes it from the entry, so the global value or default applies", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({
    approval: "auto",
    repos: { [repository]: { tracker: "beads", approval: "ask", onApproval: "pull-request", waitForChecks: true } },
  });

  await saveApprovalSettings(repository, { approval: null, onApproval: null, waitForChecks: null });

  assert.deepEqual(readSettings().repos[repository], { tracker: "beads" });
  assert.equal(await setting(t, repository, "approval"), "auto");
  assert.equal(await setting(t, repository, "onApproval"), "merge");
  assert.equal(await setting(t, repository, "waitForChecks"), "false");
});

test("a value trackerSetting would refuse is not written", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "beads" } } });
  const before = readFileSync(settingsPath(), "utf8");

  await assert.rejects(saveApprovalSettings(repository, { approval: "sometimes" }), /needs an approval of ask, auto/);
  await assert.rejects(
    saveApprovalSettings(repository, { onApproval: "rebase" }),
    /needs an onApproval of merge, pull-request/,
  );
  await assert.rejects(
    saveApprovalSettings(repository, { waitForChecks: "yes" }),
    /needs a waitForChecks of true or false/,
  );
  await assert.rejects(
    saveApprovalSettings(repository, { pushAfterMerge: "yes" }),
    /needs a pushAfterMerge of true or false/,
  );
  assert.equal(readFileSync(settingsPath(), "utf8"), before);
});

test("saving pushAfterMerge writes it, and null removes it so the default applies", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "beads" } } });

  await saveApprovalSettings(repository, { onApproval: "merge", pushAfterMerge: true });
  assert.deepEqual(readSettings().repos[repository], { tracker: "beads", onApproval: "merge", pushAfterMerge: true });
  assert.equal(await setting(t, repository, "pushAfterMerge"), "true");

  await saveApprovalSettings(repository, { onApproval: "merge", pushAfterMerge: null });
  assert.deepEqual(readSettings().repos[repository], { tracker: "beads", onApproval: "merge" });
  assert.equal(await setting(t, repository, "pushAfterMerge"), "false");
});

test("a repository without an entry gets none from saving approval settings", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: {} });
  const before = readFileSync(settingsPath(), "utf8");

  await assert.rejects(saveApprovalSettings(repository, { approval: "auto" }), /no entry in issues\.json/);
  assert.equal(readFileSync(settingsPath(), "utf8"), before);
});

test("the setup choices replace the approval settings and the retired merge and complete", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({
    repos: {
      [repository]: {
        tracker: "beads",
        merge: "pull-request",
        complete: "merged",
        waitForChecks: true,
        pushAfterMerge: true,
        close: "auto",
      },
    },
  });

  await saveSetupChoices(repository, { tracker: "github", approval: "ask", onApproval: "merge" });

  assert.deepEqual(readSettings().repos[repository], {
    tracker: "github",
    approval: "ask",
    onApproval: "merge",
    close: "auto",
  });
});

test("approval sources give the entry's and top level's own values, the retired keys' meanings, and the default onApproval", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({
    complete: "pull-request-passing",
    close: "auto",
    repos: { [repository]: { tracker: "beads", merge: "review", approval: "auto" } },
  });

  assert.deepEqual(await approvalSources({ root: repository, on: null }), {
    entry: { approval: "auto", onApproval: "merge", waitForChecks: null, pushAfterMerge: null, close: null },
    topLevel: { approval: null, onApproval: null, waitForChecks: true, pushAfterMerge: null, close: "auto" },
    defaultOnApproval: "merge",
  });
});

test("approval sources give the retired close of manual as ask, so the settings forms show it that way", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ close: "manual", repos: { [repository]: { tracker: "beads", close: "manual" } } });

  const sources = await approvalSources({ root: repository, on: null });
  assert.equal(sources.entry.close, "ask");
  assert.equal(sources.topLevel.close, "ask");
});
