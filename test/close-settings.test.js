import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { saveCloseSetting, settingsPath } from "../mod/trackers/setting.js";
import { main } from "../cli/main.js";

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

const readSettings = () => JSON.parse(readFileSync(settingsPath(), "utf8"));
const githubEntry = (extra = {}) => ({ tracker: "github", repo: "owner/name", ...extra });

const startingFolder = process.cwd();

beforeEach(() => forgetLookups());
afterEach(() => process.chdir(startingFolder));

// Runs `issues setting close` in `repository`, returning its exit code and what it printed.
async function closeSetting(t, repository) {
  process.chdir(repository);
  forgetLookups();
  const out = [],
    err = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", (line) => err.push(line));
  const code = await main(["setting", "close"]);
  t.mock.restoreAll();
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("a repository without close asks", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: githubEntry() } });
  assert.equal((await closeSetting(t, repository)).out, "ask");
});

for (const close of ["ask", "auto"]) {
  test(`a repository's close of ${close} is printed`, async (t) => {
    const repository = createRepository(temporaryFolder(t));
    writeSettings({ repos: { [repository]: githubEntry({ close }) } });
    assert.equal((await closeSetting(t, repository)).out, close);
  });
}

test("a repository's retired close of manual is read as ask", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ close: "auto", repos: { [repository]: githubEntry({ close: "manual" }) } });
  const result = await closeSetting(t, repository);
  assert.equal(result.code, 0);
  assert.equal(result.out, "ask");
});

test("a top-level retired close of manual is read as ask", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ close: "manual", repos: { [repository]: githubEntry() } });
  assert.equal((await closeSetting(t, repository)).out, "ask");
});

test("a repository's close that isn't one of the choices is refused", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: githubEntry({ close: "always" }) } });
  const result = await closeSetting(t, repository);
  assert.equal(result.code, 1);
  assert.match(result.err, new RegExp(`issues.json's ${repository} needs a close of ask, auto`));
});

test("saving close keeps the entry's other keys and every other repository's entry", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  const entry = githubEntry({ merge: "auto", workModel: "opus", close: "manual" });
  const other = { tracker: "beads", close: "manual" };
  writeSettings({ pollSeconds: 30, repos: { "/elsewhere": other, [repository]: entry } });

  await saveCloseSetting(repository, "auto");

  assert.deepEqual(readSettings(), {
    pollSeconds: 30,
    repos: { "/elsewhere": other, [repository]: { ...entry, close: "auto" } },
  });
  assert.equal((await closeSetting(t, repository)).out, "auto");
});

test("an invalid close is not written", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: githubEntry() } });
  const before = readFileSync(settingsPath(), "utf8");

  await assert.rejects(saveCloseSetting(repository, "always"), /close must be one of ask, auto/);
  assert.equal(readFileSync(settingsPath(), "utf8"), before);
});

test("the retired close of manual is not written", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: githubEntry() } });
  const before = readFileSync(settingsPath(), "utf8");

  await assert.rejects(saveCloseSetting(repository, "manual"), /close must be one of ask, auto/);
  assert.equal(readFileSync(settingsPath(), "utf8"), before);
});

test("a repository without an entry gets none from saving close", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: {} });
  const before = readFileSync(settingsPath(), "utf8");

  await assert.rejects(saveCloseSetting(repository, "auto"), /no entry in issues\.json/);
  assert.equal(readFileSync(settingsPath(), "utf8"), before);
});

test("a null close removes it from the entry, so the global value applies", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ close: "ask", repos: { [repository]: githubEntry({ close: "auto" }) } });

  await saveCloseSetting(repository, null);

  assert.deepEqual(readSettings().repos[repository], githubEntry());
  assert.equal((await closeSetting(t, repository)).out, "ask");
});
