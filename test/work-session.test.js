import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { settingsPath } from "../mod/trackers/setting.js";
import { workSessionArgv } from "../mod/work-session.js";

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

describe("the Claude session's model and effort", () => {
  beforeEach(() => forgetLookups());

  test("starts plain claude without workModel or workEffort", async (t) => {
    const repository = createRepository(temporaryFolder(t));
    writeSettings({ repos: { [repository]: { tracker: "github", repo: "owner/name" } } });
    assert.deepEqual(await workSessionArgv({ root: repository, on: null }), ["claude"]);
    assert.deepEqual(await workSessionArgv(null), ["claude"]);
  });

  test("passes the repository's workModel and workEffort to claude", async (t) => {
    const repository = createRepository(temporaryFolder(t));
    writeSettings({
      workEffort: "low",
      repos: { [repository]: { tracker: "github", repo: "owner/name", workModel: "sonnet", workEffort: "high" } },
    });
    assert.deepEqual(await workSessionArgv({ root: repository, on: null }), [
      "claude",
      "--model",
      "sonnet",
      "--effort",
      "high",
    ]);
  });

  test("passes only the setting that isn't its default", async (t) => {
    const repository = createRepository(temporaryFolder(t));
    writeSettings({ workEffort: "max", repos: {} });
    assert.deepEqual(await workSessionArgv({ root: repository, on: null }), ["claude", "--effort", "max"]);
  });
});

describe("the Claude session's work prompt", () => {
  beforeEach(() => forgetLookups());

  test("appends the top level's and the repository's workPrompt to the system prompt as one argument", async (t) => {
    const repository = createRepository(temporaryFolder(t));
    const workPrompt = `Run "npm test" before each commit.\nDon't use 'git stash'.`;
    writeSettings({
      workPrompt: "Top level",
      repos: { [repository]: { tracker: "github", repo: "owner/name", workPrompt } },
    });
    assert.deepEqual(await workSessionArgv({ root: repository, on: null }), [
      "claude",
      "--append-system-prompt",
      `Top level\n\n${workPrompt}`,
    ]);
  });

  test("uses the top level's workPrompt without the repository's", async (t) => {
    const repository = createRepository(temporaryFolder(t));
    writeSettings({
      workPrompt: "Top level",
      repos: { [repository]: { tracker: "github", repo: "owner/name", workPrompt: "  " } },
    });
    assert.deepEqual(await workSessionArgv({ root: repository, on: null }), [
      "claude",
      "--append-system-prompt",
      "Top level",
    ]);
  });

  test("adds nothing for a blank or missing workPrompt", async (t) => {
    const repository = createRepository(temporaryFolder(t));
    writeSettings({ repos: { [repository]: { tracker: "github", repo: "owner/name", workPrompt: " \n " } } });
    assert.deepEqual(await workSessionArgv({ root: repository, on: null }), ["claude"]);
    forgetLookups();
    writeSettings({ repos: {} });
    assert.deepEqual(await workSessionArgv({ root: repository, on: null }), ["claude"]);
  });
});
