import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { defaults, stubHerdr } from "./support/herdr.js";
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
    const repository = repositoryWith(t, { entry: { close: "ask" }, topLevel: { close: "auto" } });
    assert.equal((await setting(t, repository, "close")).out, "ask");
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

describe("approval, onApproval and waitForChecks", () => {
  // Every approval setting `issues setting` prints for the repository, as { approval, onApproval, waitForChecks }.
  async function approvalSettings(t, repository) {
    const printed = {};
    for (const key of ["approval", "onApproval", "waitForChecks"]) printed[key] = (await setting(t, repository, key)).out;
    return printed;
  }

  test("the defaults apply without either, merging for a repository without a GitHub origin", async (t) => {
    const repository = repositoryWith(t, {});
    assert.deepEqual(await approvalSettings(t, repository), { approval: "ask", onApproval: "merge", waitForChecks: "false" });
  });

  test("the default onApproval is a pull request for a repository with a GitHub origin", async (t) => {
    stubHerdr(t, {
      exec: (command, args, options) => (command === "gh" ? Promise.resolve({ code: 0, stdout: "owner/name\n", stderr: "" }) : defaults.exec(command, args, options)),
    });
    const repository = repositoryWith(t, {});
    assert.deepEqual(await approvalSettings(t, repository), { approval: "ask", onApproval: "pull-request", waitForChecks: "false" });
  });

  test("the entry's win over the top level's", async (t) => {
    const repository = repositoryWith(t, {
      entry: { approval: "auto", onApproval: "merge", waitForChecks: false },
      topLevel: { approval: "ask", onApproval: "pull-request", waitForChecks: true },
    });
    assert.deepEqual(await approvalSettings(t, repository), { approval: "auto", onApproval: "merge", waitForChecks: "false" });
  });

  test("the top level's apply without the entry's", async (t) => {
    const repository = repositoryWith(t, { topLevel: { approval: "auto", onApproval: "pull-request", waitForChecks: true } });
    assert.deepEqual(await approvalSettings(t, repository), { approval: "auto", onApproval: "pull-request", waitForChecks: "true" });
  });

  const retiredMeanings = [
    [{ merge: "auto" }, { approval: "auto", onApproval: "merge", waitForChecks: "false" }],
    [{ merge: "review" }, { approval: "ask", onApproval: "merge", waitForChecks: "false" }],
    [{ merge: "pull-request" }, { approval: "ask", onApproval: "pull-request", waitForChecks: "false" }],
    [{ merge: "pull-request", complete: "pull-request-passing" }, { approval: "ask", onApproval: "pull-request", waitForChecks: "true" }],
    [{ merge: "pull-request", complete: "pull-request-open" }, { approval: "ask", onApproval: "pull-request", waitForChecks: "false" }],
    [{ merge: "pull-request", complete: "merged" }, { approval: "ask", onApproval: "pull-request", waitForChecks: "false" }],
  ];
  for (const [retired, meaning] of retiredMeanings) {
    test(`an entry's retired ${JSON.stringify(retired)} means ${JSON.stringify(meaning)}`, async (t) => {
      assert.deepEqual(await approvalSettings(t, repositoryWith(t, { entry: retired })), meaning);
    });

    test(`a top level's retired ${JSON.stringify(retired)} means the same`, async (t) => {
      assert.deepEqual(await approvalSettings(t, repositoryWith(t, { topLevel: retired })), meaning);
    });
  }

  test("a place's new keys win over its own retired ones", async (t) => {
    const repository = repositoryWith(t, { entry: { merge: "auto", complete: "pull-request-passing", approval: "ask", onApproval: "pull-request", waitForChecks: false } });
    assert.deepEqual(await approvalSettings(t, repository), { approval: "ask", onApproval: "pull-request", waitForChecks: "false" });
  });

  test("an entry's retired keys win over the top level's new ones", async (t) => {
    const repository = repositoryWith(t, { entry: { merge: "review" }, topLevel: { approval: "auto", onApproval: "pull-request", waitForChecks: true } });
    assert.deepEqual(await approvalSettings(t, repository), { approval: "ask", onApproval: "merge", waitForChecks: "true" });
  });

  test("an entry's retired pull-request merge leaves approval to the top level", async (t) => {
    const repository = repositoryWith(t, { entry: { merge: "pull-request" }, topLevel: { approval: "auto" } });
    assert.deepEqual(await approvalSettings(t, repository), { approval: "auto", onApproval: "pull-request", waitForChecks: "false" });
  });

  test("merge and complete are no longer settings the CLI prints", async (t) => {
    const repository = repositoryWith(t, { entry: { merge: "auto" } });
    for (const key of ["merge", "complete"]) {
      const result = await setting(t, repository, key);
      assert.equal(result.code, 2);
      assert.match(result.err, new RegExp(`has no key ${key}`));
    }
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
    { key: "close", topLevel: { close: "always" }, message: /issues\.json needs a close of ask, auto/ },
    { key: "approval", topLevel: { approval: "sometimes" }, message: /issues\.json needs an approval of ask, auto/ },
    { key: "onApproval", topLevel: { onApproval: "rebase" }, message: /issues\.json needs an onApproval of merge, pull-request/ },
    { key: "waitForChecks", topLevel: { waitForChecks: "yes" }, message: /issues\.json needs a waitForChecks of true or false/ },
    { key: "onApproval", topLevel: { merge: "rebase" }, message: /issues\.json needs a merge of auto, review, pull-request/ },
    { key: "waitForChecks", topLevel: { complete: "soon" }, message: /issues\.json needs a complete of merged, pull-request-open, pull-request-passing/ },
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
