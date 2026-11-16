import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { settingsPath } from "../mod/trackers/setting.js";
import { issueSpaceName } from "../mod/space-name.js";
import { main } from "../cli/main.js";

function writeSettings(settings) {
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings));
}

const githubEntry = (extra = {}) => ({ tracker: "github", repo: "owner/name", ...extra });

const startingFolder = process.cwd();

beforeEach(() => forgetLookups());
afterEach(() => process.chdir(startingFolder));

// Runs `issues setting <key>` in `repository`, returning its exit code and what it printed.
async function setting(t, repository, key) {
  process.chdir(repository);
  forgetLookups();
  const out = [], err = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", (line) => err.push(line));
  const code = await main(["setting", key]);
  t.mock.restoreAll();
  return { code, out: out.join("\n"), err: err.join("\n") };
}

// A repository whose entry holds `entry`'s keys, under a top level holding `topLevel`'s.
function repositoryWith(t, { entry = {}, topLevel = {} }) {
  const repository = createRepository(temporaryFolder(t));
  writeSettings({ ...topLevel, repos: { [repository]: githubEntry(entry) } });
  return repository;
}

describe("close", () => {
  test("the entry's wins over the top level's", async (t) => {
    const repository = repositoryWith(t, { entry: { close: "manual" }, topLevel: { close: "auto" } });
    assert.equal((await setting(t, repository, "close")).out, "manual");
  });

  test("the top level's applies without the entry's", async (t) => {
    const repository = repositoryWith(t, { topLevel: { close: "auto" } });
    assert.equal((await setting(t, repository, "close")).out, "auto");
  });

  test("ask applies without either", async (t) => {
    const repository = repositoryWith(t, {});
    assert.equal((await setting(t, repository, "close")).out, "ask");
  });
});

describe("merge and complete", () => {
  test("the entry's win over the top level's", async (t) => {
    const repository = repositoryWith(t, {
      entry: { merge: "pull-request", complete: "merged" },
      topLevel: { merge: "pull-request", complete: "pull-request-passing" },
    });
    assert.equal((await setting(t, repository, "merge")).out, "pull-request");
    assert.equal((await setting(t, repository, "complete")).out, "merged");
  });

  test("the top level's apply without the entry's", async (t) => {
    const repository = repositoryWith(t, { topLevel: { merge: "pull-request", complete: "pull-request-passing" } });
    assert.equal((await setting(t, repository, "merge")).out, "pull-request");
    assert.equal((await setting(t, repository, "complete")).out, "pull-request-passing");
  });

  test("the top level's complete applies under the entry's pull request merge", async (t) => {
    const repository = repositoryWith(t, { entry: { merge: "pull-request" }, topLevel: { complete: "merged" } });
    assert.equal((await setting(t, repository, "complete")).out, "merged");
  });

  test("the defaults apply without either, review for a repository without a GitHub origin", async (t) => {
    const repository = repositoryWith(t, {});
    assert.equal((await setting(t, repository, "merge")).out, "review");
    assert.equal((await setting(t, repository, "complete")).out, "merged");
  });

  test("a repository's review merge completes once merged under a top-level pull-request-passing", async (t) => {
    const repository = repositoryWith(t, { entry: { merge: "review" }, topLevel: { merge: "pull-request", complete: "pull-request-passing" } });
    assert.equal((await setting(t, repository, "merge")).out, "review");
    assert.equal((await setting(t, repository, "complete")).out, "merged");
  });
});

describe("spaceName", () => {
  const spaceName = (repository) => issueSpaceName({ root: repository, on: null }, "#41");

  test("the entry's wins over the top level's", async (t) => {
    const repository = repositoryWith(t, { entry: { spaceName: "<repo><issueId>" }, topLevel: { spaceName: "<issueId> issue" } });
    assert.equal(await spaceName(repository), "name#41");
  });

  test("the top level's applies without the entry's", async (t) => {
    const repository = repositoryWith(t, { topLevel: { spaceName: "<repo> <issueId>" } });
    assert.equal(await spaceName(repository), "name #41");
  });

  test("the issue's ID applies without either", async (t) => {
    const repository = repositoryWith(t, {});
    assert.equal(await spaceName(repository), "#41");
  });
});

describe("a top level that an entry couldn't hold is refused", () => {
  const cases = [
    { key: "close", topLevel: { close: "always" }, message: /issues\.json needs a close of manual, ask, auto/ },
    { key: "merge", topLevel: { merge: "rebase" }, message: /issues\.json needs a merge of auto, review, pull-request/ },
    { key: "complete", topLevel: { complete: "soon" }, message: /issues\.json needs a complete of merged, pull-request-open, pull-request-passing/ },
    { key: "complete", topLevel: { merge: "auto", complete: "pull-request-open" }, message: /issues\.json merges with auto, so its complete can only be merged/ },
    { key: "close", topLevel: { spaceName: 41 }, message: /issues\.json has a spaceName that isn't text/ },
  ];
  for (const { key, topLevel, message } of cases) {
    test(`${JSON.stringify(topLevel)}`, async (t) => {
      const repository = repositoryWith(t, { topLevel });
      const result = await setting(t, repository, key);
      assert.equal(result.code, 1);
      assert.match(result.err, message);
    });
  }
});
