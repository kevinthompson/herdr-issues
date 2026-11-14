import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { defaults, stubHerdr } from "./support/herdr.js";
import { createRepository, git, temporaryFolder } from "./support/repository.js";
import { mainCheckout, repositoryRoot } from "../mod/location.js";
import { forgetLookups } from "../mod/lookups.js";
import { trackerFor } from "../mod/trackers/index.js";
import { saveSetupChoices, settingsPath, trackerSetting } from "../mod/trackers/setting.js";

// The git commands the mod's modules run during the test, each as one string, while still running them.
function recordGitCommands(t) {
  const commands = [];
  stubHerdr(t, {
    exec: (command, args = [], options) => {
      if (command === "git") commands.push(args.join(" "));
      return defaults.exec(command, args, options);
    },
  });
  return commands;
}

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

beforeEach(() => forgetLookups());

test("a folder's repository is looked up once, until the lookups are forgotten", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  const commands = recordGitCommands(t);
  const where = { cwd: repository, on: null };

  assert.equal(await repositoryRoot(where), repository);
  assert.equal(await mainCheckout(repository, null), repository);
  const firstLookups = commands.length;
  assert.equal(await repositoryRoot(where), repository);
  assert.equal(await mainCheckout(repository, null), repository);
  assert.equal(commands.length, firstLookups);

  forgetLookups();
  await repositoryRoot(where);
  await mainCheckout(repository, null);
  assert.equal(commands.length, firstLookups * 2);
});

test("a folder outside a repository is asked again, since it may become one", async (t) => {
  const folder = temporaryFolder(t);
  assert.equal(await repositoryRoot({ cwd: folder, on: null }), null);
  git(folder, "init", "-q");
  assert.equal(await repositoryRoot({ cwd: folder, on: null }), folder);
});

test("a worktree added after its repository was looked up resolves to the main checkout", async (t) => {
  const folder = temporaryFolder(t);
  const repository = createRepository(folder);
  assert.equal(await mainCheckout(repository, null), repository);
  const worktree = join(folder, "worktree");
  git(repository, "worktree", "add", "-q", "-b", "feature", worktree);
  assert.equal(await repositoryRoot({ cwd: worktree, on: null }), worktree);
  assert.equal(await mainCheckout(worktree, null), repository);
});

test("finding a repository's tracker lists its worktrees once", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ repos: { [repository]: { tracker: "github", repo: "owner/name" } } });
  const commands = recordGitCommands(t);

  const root = await repositoryRoot({ cwd: repository, on: null });
  await mainCheckout(root, null);
  const tracker = await trackerFor({ root, on: null });

  assert.equal(tracker.repo, "owner/name");
  assert.equal(commands.filter((command) => command.startsWith("worktree list")).length, 1);
});

test("issues.json is read once, until the lookups are forgotten", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  const project = { root: repository, on: null };
  writeSettings({ repos: { [repository]: { tracker: "github", repo: "owner/first" } } });
  assert.equal((await trackerSetting(project)).repo, "owner/first");

  writeSettings({ repos: { [repository]: { tracker: "github", repo: "owner/second" } } });
  assert.equal((await trackerSetting(project)).repo, "owner/first");
  forgetLookups();
  assert.equal((await trackerSetting(project)).repo, "owner/second");
});

test("saving the setup view's choices forgets the issues.json it read", async (t) => {
  const repository = createRepository(temporaryFolder(t));
  const project = { root: repository, on: null };
  writeSettings({ repos: {} });
  assert.equal(await trackerSetting(project), null);

  await saveSetupChoices(repository, { tracker: "github", repo: "owner/name" });
  assert.equal((await trackerSetting(project)).repo, "owner/name");
});
