import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { forgetLookups } from "../mod/lookups.js";
import {
  parseUpdateCheckHours,
  saveTopLevelSettings,
  settingsPath,
  topLevelSettings,
} from "../mod/trackers/setting.js";

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

const readSettings = () => JSON.parse(readFileSync(settingsPath(), "utf8"));

beforeEach(() => forgetLookups());

const repos = {
  "~/Code/web": { tracker: "linear", team: "WEB", close: "manual", workPrompt: "Web rules" },
  "/elsewhere": { tracker: "beads" },
};

test("saving changes only the given top-level keys and keeps repos and every other key", async () => {
  writeSettings({ pollSeconds: 30, futureSetting: { kept: true }, close: "ask", repos });

  await saveTopLevelSettings({
    close: "auto",
    approval: "auto",
    onApproval: "pull-request",
    waitForChecks: true,
    workPrompt: "  House rules.\n",
  });

  assert.deepEqual(readSettings(), {
    pollSeconds: 30,
    futureSetting: { kept: true },
    close: "auto",
    approval: "auto",
    onApproval: "pull-request",
    waitForChecks: true,
    workPrompt: "House rules.",
    repos,
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
    [{ close: "always" }, /close must be one of ask, auto/],
    [{ close: "manual" }, /close must be one of ask, auto/],
    [{ approval: "sometimes" }, /issues\.json needs an approval of ask, auto/],
    [{ waitForChecks: "yes" }, /issues\.json needs a waitForChecks of true or false/],
    [{ pushAfterMerge: "yes" }, /issues\.json needs a pushAfterMerge of true or false/],
    [{ merge: "auto" }, /merge isn't a setting for every repository/],
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

test("saving a approval setting removes the retired merge and complete, and other saves keep them", async () => {
  writeSettings({ merge: "pull-request", complete: "pull-request-passing", repos });

  await saveTopLevelSettings({ close: "auto" });
  assert.deepEqual(readSettings(), { merge: "pull-request", complete: "pull-request-passing", close: "auto", repos });

  await saveTopLevelSettings({ pushAfterMerge: true });
  assert.deepEqual(readSettings(), {
    merge: "pull-request",
    complete: "pull-request-passing",
    close: "auto",
    pushAfterMerge: true,
    repos,
  });
  await saveTopLevelSettings({ pushAfterMerge: null });

  await saveTopLevelSettings({ approval: "ask", onApproval: "pull-request", waitForChecks: false });
  assert.deepEqual(readSettings(), {
    close: "auto",
    approval: "ask",
    onApproval: "pull-request",
    waitForChecks: false,
    repos,
  });
});

test("a typed update check interval is a whole number of hours, 1 or more, or blank", () => {
  assert.equal(parseUpdateCheckHours(" 12 "), 12);
  assert.equal(parseUpdateCheckHours("1"), 1);
  assert.equal(parseUpdateCheckHours("  "), null);
  for (const text of ["0", "1.5", "-2", "six"]) {
    assert.throws(() => parseUpdateCheckHours(text), /whole number of hours, 1 or more/);
  }
});
