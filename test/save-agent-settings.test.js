import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { agentSettings, saveAgentSettings, settingsPath } from "../mod/trackers/setting.js";
import { workSessionArgv } from "../mod/work-session.js";
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

test("saving model and effort settings writes only those keys and keeps every other repository's entry", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  const entry = { tracker: "github", repo: "owner/name", views: { Mine: "https://example.com" }, merge: "auto" };
  const other = { tracker: "beads", workModel: "opus" };
  writeSettings({ pollSeconds: 30, workEffort: "high", repos: { "/elsewhere": other, [repository]: entry } });

  await saveAgentSettings(repository, { workModel: "claude-opus-5-5", workEffort: "max" });

  assert.deepEqual(readSettings(), {
    pollSeconds: 30,
    workEffort: "high",
    repos: { "/elsewhere": other, [repository]: { ...entry, workModel: "claude-opus-5-5", workEffort: "max" } },
  });
  assert.equal(await setting(t, repository, "workModel"), "claude-opus-5-5");
  assert.equal(await setting(t, repository, "workEffort"), "max");
  assert.deepEqual(await workSessionArgv({ root: repository }), [
    "claude",
    "--model",
    "claude-opus-5-5",
    "--effort",
    "max",
  ]);
});

test("clearing a setting removes it, so the top level's value or the default applies", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({
    workEffort: "high",
    repos: { [repository]: { tracker: "beads", workModel: "opus", workEffort: "low" } },
  });

  await saveAgentSettings(repository, { workEffort: null });

  assert.deepEqual(readSettings().repos[repository], { tracker: "beads", workModel: "opus" });
  assert.equal(await setting(t, repository, "workEffort"), "high");
  forgetLookups();
  const settings = await agentSettings({ root: repository });
  assert.deepEqual(settings.workModel, { value: "opus", source: "repository", entry: "opus", topLevel: null });
  assert.deepEqual(settings.workEffort, { value: "high", source: "top level", entry: null, topLevel: "high" });
});

test("a value the settings would refuse is not written", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "beads" } } });
  const before = readFileSync(settingsPath(), "utf8");

  await assert.rejects(saveAgentSettings(repository, { workEffort: "extreme" }), /workEffort must be one of/);
  await assert.rejects(saveAgentSettings(repository, { workModel: "two words" }), /workModel must be/);
  await assert.rejects(saveAgentSettings(repository, { merge: "auto" }), /isn't a model or effort setting/);
  assert.equal(readFileSync(settingsPath(), "utf8"), before);
});

test("a repository without an entry gets none from saving model and effort settings", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: {} });
  const before = readFileSync(settingsPath(), "utf8");

  await assert.rejects(saveAgentSettings(repository, { workModel: "opus" }), /no entry in issues\.json/);
  assert.equal(readFileSync(settingsPath(), "utf8"), before);
});
