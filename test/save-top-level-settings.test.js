import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { forgetLookups } from "../mod/lookups.js";
import { saveTopLevelSettings, settingsPath, topLevelSettings } from "../mod/trackers/setting.js";

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

const readSettings = () => JSON.parse(readFileSync(settingsPath(), "utf8"));

beforeEach(() => forgetLookups());

const repos = { "~/Code/web": { tracker: "linear", team: "WEB", close: "manual", workPrompt: "Web rules" }, "/elsewhere": { tracker: "beads" } };

test("saving changes only the given top-level keys and keeps repos and every other key", async () => {
  writeSettings({ pollSeconds: 30, futureSetting: { kept: true }, close: "ask", repos });

  await saveTopLevelSettings({ close: "auto", merge: "pull-request", complete: "pull-request-passing", workPrompt: "  House rules.\n" });

  assert.deepEqual(readSettings(), {
    pollSeconds: 30, futureSetting: { kept: true }, close: "auto",
    merge: "pull-request", complete: "pull-request-passing", workPrompt: "House rules.", repos,
  });
  assert.deepEqual(Object.keys(readSettings()).at(-1), "repos");
  assert.equal((await topLevelSettings()).close, "auto");
});

test("a null or blank value removes the key", async () => {
  writeSettings({ workModel: "opus", spaceName: "<repo><issueId>", updateCheckHours: 12, repos });

  await saveTopLevelSettings({ workModel: null, spaceName: "  ", updateCheckHours: undefined });

  assert.deepEqual(readSettings(), { repos });
});

test("saving without a file creates one with only the given keys", async () => {
  rmSync(settingsPath(), { force: true });

  await saveTopLevelSettings({ workEffort: "high", pollSeconds: 120 });

  assert.deepEqual(readSettings(), { workEffort: "high", pollSeconds: 120 });
});

test("a value or pair the top level couldn't hold, or a repository-only key, writes nothing", async () => {
  writeSettings({ merge: "pull-request", complete: "pull-request-open", repos });
  const before = readFileSync(settingsPath(), "utf8");
  const refusals = [
    [{ close: "always" }, /issues\.json needs a close of manual, ask, auto/],
    [{ merge: "auto" }, /issues\.json merges with auto, so its complete can only be merged/],
    [{ pollSeconds: 5 }, /pollSeconds that's a whole number of seconds, 10 or more/],
    [{ updateCheckHours: 0.5 }, /updateCheckHours that's a whole number of hours/],
    [{ workModel: "two words" }, /needs a workModel of inherit/],
    [{ workEffort: "extreme" }, /needs a workEffort of/],
    [{ tracker: "beads" }, /tracker isn't a setting for every repository/],
  ];
  for (const [changes, message] of refusals) {
    await assert.rejects(saveTopLevelSettings(changes), message);
    assert.equal(readFileSync(settingsPath(), "utf8"), before);
  }
  assert.ok(existsSync(settingsPath()));
});

test("changing merge with complete together is checked as a pair", async () => {
  writeSettings({ merge: "pull-request", complete: "pull-request-open", repos });

  await saveTopLevelSettings({ merge: "auto", complete: null });

  assert.deepEqual(readSettings(), { merge: "auto", repos });
});
