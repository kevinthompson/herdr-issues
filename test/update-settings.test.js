import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { settingsPath } from "../mod/trackers/setting.js";
import { main } from "../cli/main.js";

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

const githubEntry = (extra = {}) => ({ tracker: "github", repo: "owner/name", ...extra });

const startingFolder = process.cwd();

beforeEach(() => forgetLookups());
afterEach(() => process.chdir(startingFolder));

// Runs `issues setting updateCheckHours` in `repository`, returning its exit code and what it printed.
async function updateCheckHours(t, repository) {
  process.chdir(repository);
  const out = [],
    err = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", (line) => err.push(line));
  const code = await main(["setting", "updateCheckHours"]);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("the panel checks for its update every 6 hours without an updateCheckHours", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: githubEntry() } });
  assert.deepEqual(await updateCheckHours(t, repository), { code: 0, out: "6", err: "" });
});

test("a top-level updateCheckHours sets the interval", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ updateCheckHours: 24, repos: { [repository]: githubEntry() } });
  assert.equal((await updateCheckHours(t, repository)).out, "24");
});

test("a repository's updateCheckHours doesn't change the interval", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: githubEntry({ updateCheckHours: 2 }) } });
  assert.equal((await updateCheckHours(t, repository)).out, "6");
});

for (const hours of [0, 1.5, "6"]) {
  test(`an updateCheckHours of ${JSON.stringify(hours)} is refused, naming issues.json and the allowed range`, async (t) => {
    const repository = createRepository(temporaryFolder(t));
    writeSettings({ updateCheckHours: hours, repos: {} });
    const { code, out, err } = await updateCheckHours(t, repository);
    assert.notEqual(code, 0);
    assert.equal(out, "");
    assert.match(err, /issues\.json needs an updateCheckHours that's a whole number of hours, 1 or more/);
  });
}
