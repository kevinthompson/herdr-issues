import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { defaults, stubHerdr } from "./support/herdr.js";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { nameSettings, settingsPath } from "../mod/trackers/setting.js";
import { main } from "../cli/main.js";

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

const githubEntry = (extra = {}) => ({ tracker: "github", repo: "owner/name", ...extra });

const startingFolder = process.cwd();

beforeEach(() => forgetLookups());
afterEach(() => process.chdir(startingFolder));

const repositoryNamed = (t, name) => createRepository(temporaryFolder(t), { name });

// Runs `issues setting name` in `repository`, returning what it printed.
async function nameSetting(t, repository) {
  process.chdir(repository);
  forgetLookups();
  const out = [];
  t.mock.method(console, "log", (line) => out.push(line));
  await main(["setting", "name"]);
  t.mock.restoreAll();
  return out.join("\n");
}

test("a repository's name is printed when set", async (t) => {
  const repository = repositoryNamed(t, "checkout");
  writeSettings({ repos: { [repository]: githubEntry({ name: "My App" }) } });
  assert.equal(await nameSetting(t, repository), "My App");
  assert.deepEqual(await nameSettings({ root: repository, on: null }), { name: "My App", entry: "My App", defaultName: "name" });
});

test("a GitHub repository without a name uses its repo's name, without the owner", async (t) => {
  const repository = repositoryNamed(t, "checkout");
  writeSettings({ repos: { [repository]: githubEntry() } });
  assert.equal(await nameSetting(t, repository), "name");
});

test("a blank name counts as unset", async (t) => {
  const repository = repositoryNamed(t, "checkout");
  writeSettings({ repos: { [repository]: githubEntry({ name: "  " }) } });
  assert.deepEqual(await nameSettings({ root: repository, on: null }), { name: "name", entry: null, defaultName: "name" });
});

test("a GitHub repository without repo uses origin's repository's name", async (t) => {
  const repository = repositoryNamed(t, "checkout");
  writeSettings({ repos: { [repository]: { tracker: "github" } } });
  stubHerdr(t, {
    exec: async (command, args, options) => command === "gh"
      ? { code: 0, stdout: "someone/from-origin\n", stderr: "" }
      : defaults.exec(command, args, options),
  });
  assert.equal((await nameSettings({ root: repository, on: null })).name, "from-origin");
});

test("a repository not tracked in GitHub uses its main checkout's folder's name", async (t) => {
  const repository = repositoryNamed(t, "notes");
  writeSettings({ repos: { [repository]: { tracker: "beads" } } });
  assert.equal(await nameSetting(t, repository), "notes");
});

test("a repository without an entry uses its main checkout's folder's name", async (t) => {
  const repository = repositoryNamed(t, "plain");
  writeSettings({ repos: {} });
  assert.equal(await nameSetting(t, repository), "plain");
});

test("a name that isn't text is refused", async (t) => {
  const repository = repositoryNamed(t, "checkout");
  writeSettings({ repos: { [repository]: githubEntry({ name: 7 }) } });
  await assert.rejects(nameSettings({ root: repository, on: null }), /has a name that isn't text/);
});
