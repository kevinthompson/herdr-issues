import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { saveWorkPrompt, settingsPath, workPromptSettings } from "../mod/trackers/setting.js";

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

const readSettings = () => JSON.parse(readFileSync(settingsPath(), "utf8"));

beforeEach(() => forgetLookups());

test("saving a work prompt writes it trimmed and keeps every other key and repository's entry", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  const entry = { tracker: "github", repo: "owner/name", workModel: "opus", merge: "auto" };
  const other = { tracker: "beads", workPrompt: "Elsewhere" };
  writeSettings({ workPrompt: "Top level", repos: { "/elsewhere": other, [repository]: entry } });

  await saveWorkPrompt(repository, "  Run the tests.\nCommit often.\n\n");

  assert.deepEqual(readSettings(), {
    workPrompt: "Top level",
    repos: { "/elsewhere": other, [repository]: { ...entry, workPrompt: "Run the tests.\nCommit often." } },
  });
  forgetLookups();
  assert.deepEqual(await workPromptSettings({ root: repository }), {
    entry: "Run the tests.\nCommit often.",
    topLevel: "Top level",
  });
});

test("saving a different work prompt replaces the entry's", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "beads", workPrompt: "Old" } } });

  await saveWorkPrompt(repository, "New");

  assert.deepEqual(readSettings().repos[repository], { tracker: "beads", workPrompt: "New" });
});

test("saving an empty work prompt removes it, so the top level's applies", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({
    workPrompt: "Top level",
    repos: { [repository]: { tracker: "beads", workEffort: "low", workPrompt: "Old" } },
  });

  await saveWorkPrompt(repository, " \n ");

  assert.deepEqual(readSettings().repos[repository], { tracker: "beads", workEffort: "low" });
  forgetLookups();
  assert.deepEqual(await workPromptSettings({ root: repository }), { entry: null, topLevel: "Top level" });
});

test("a work prompt that isn't text, or a repository without an entry, writes nothing", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "beads" } } });
  const before = readFileSync(settingsPath(), "utf8");
  await assert.rejects(saveWorkPrompt(repository, 42), /workPrompt must be text/);
  assert.equal(readFileSync(settingsPath(), "utf8"), before);

  writeSettings({ repos: {} });
  const empty = readFileSync(settingsPath(), "utf8");
  await assert.rejects(saveWorkPrompt(repository, "Run the tests."), /no entry in issues\.json/);
  assert.equal(readFileSync(settingsPath(), "utf8"), empty);
});
