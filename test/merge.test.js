import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, test } from "node:test";
import { commitFile, createRepository, git, temporaryFolder } from "./support/repository.js";
import { stubHerdr } from "./support/herdr.js";
import { forgetLookups } from "../mod/lookups.js";
import { settingsPath } from "../mod/trackers/setting.js";
import { canOfferMerge, checkMerge, mergeIssue, MergeRefusal } from "../mod/merge.js";

beforeEach(() => forgetLookups());

// A repository on main with a worktree on `feature` holding one commit main lacks, and a tracker that records
// its updates; announcements counts the panel refreshes asked for.
function setUp(t) {
  const folder = temporaryFolder(t);
  const repository = createRepository(folder);
  const worktree = join(folder, "feature");
  git(repository, "worktree", "add", "-q", "-b", "feature", worktree);
  commitFile(worktree, "feature.txt", "work\n");
  const updates = [];
  const tracker = { update: async (issue, fields) => { updates.push({ id: issue.id, ...fields }); } };
  const counts = { announcements: 0 };
  stubHerdr(t, { setShared: () => { counts.announcements++; return null; } });
  const issue = { id: "#7", branch: "feature" };
  return { repository, worktree, tracker, updates, counts, issue, project: { root: repository, on: null } };
}

const head = (repository) => git(repository, "rev-parse", "HEAD");

// Runs the merge expecting a refusal matching `pattern`, and checks it left main and the tracker alone.
async function assertRefuses({ repository, tracker, updates, issue, project }, pattern) {
  const before = { head: head(repository), status: git(repository, "status", "--porcelain") };
  await assert.rejects(mergeIssue(issue, tracker, project), (error) => {
    assert.ok(error instanceof MergeRefusal, error.message);
    assert.match(error.message, pattern);
    return true;
  });
  assert.deepEqual({ head: head(repository), status: git(repository, "status", "--porcelain") }, before);
  assert.deepEqual(updates, []);
}

describe("mergeIssue", () => {
  test("merges the branch into main with a merge commit and marks the issue done", async (t) => {
    const setup = setUp(t);
    const { repository, tracker, updates, counts, issue, project } = setup;

    assert.equal(await mergeIssue(issue, tracker, project), "main");

    assert.equal(git(repository, "log", "-1", "--format=%s"), "Merge branch 'feature'");
    assert.equal(git(repository, "rev-list", "--count", "--merges", "-1", "HEAD"), "1");
    assert.equal(git(repository, "rev-list", "--count", "main..feature"), "0");
    assert.deepEqual(updates, [{ id: "#7", status: "done" }]);
    assert.equal(counts.announcements, 1);
  });

  test("refuses when the main checkout isn't on main", async (t) => {
    const setup = setUp(t);
    git(setup.repository, "switch", "-q", "-c", "elsewhere");
    await assertRefuses(setup, /is on elsewhere, not main/);
  });

  test("refuses when the main checkout has uncommitted changes to tracked files", async (t) => {
    const setup = setUp(t);
    writeFileSync(join(setup.repository, "README"), "edited\n");
    await assertRefuses(setup, /main checkout .* has uncommitted changes/);
  });

  test("merges past untracked files in the main checkout", async (t) => {
    const setup = setUp(t);
    writeFileSync(join(setup.repository, "scratch.txt"), "notes\n");
    assert.equal(await mergeIssue(setup.issue, setup.tracker, setup.project), "main");
  });

  test("refuses when the branch's worktree has uncommitted changes", async (t) => {
    const setup = setUp(t);
    writeFileSync(join(setup.worktree, "unsaved.txt"), "draft\n");
    await assertRefuses(setup, /feature's worktree .* has uncommitted changes/);
  });

  test("refuses when the branch has no commits main lacks", async (t) => {
    const setup = setUp(t);
    git(setup.repository, "merge", "-q", "--no-ff", "-m", "merged already", "feature");
    await assertRefuses(setup, /feature has no commits that main lacks/);
  });

  test("refuses a conflicting merge, aborting it so the main checkout is as it was", async (t) => {
    const setup = setUp(t);
    commitFile(setup.worktree, "README", "from the branch\n");
    commitFile(setup.repository, "README", "from main\n");
    await assertRefuses(setup, /doesn't merge cleanly into main, so nothing was merged: README/);
  });

  for (const landing of [{ onApproval: "pull-request" }, { merge: "pull-request" }]) {
    test(`refuses a repository with ${JSON.stringify(landing)}, pointing to the pull request`, async (t) => {
      const setup = setUp(t);
      mkdirSync(join(settingsPath(), ".."), { recursive: true });
      writeFileSync(settingsPath(), JSON.stringify({ repos: { [setup.repository]: { tracker: "beads", ...landing } } }));
      await assertRefuses(setup, /merges through pull requests: merge feature's pull request instead/);
    });
  }
});

describe("canOfferMerge", () => {
  test("offers a clean worktree with commits main lacks", async (t) => {
    const { project } = setUp(t);
    assert.equal(await canOfferMerge("feature", project), true);
  });

  test("doesn't offer a worktree with uncommitted changes", async (t) => {
    const { worktree, project } = setUp(t);
    writeFileSync(join(worktree, "unsaved.txt"), "draft\n");
    assert.equal(await canOfferMerge("feature", project), false);
  });

  test("doesn't offer a branch main already has", async (t) => {
    const { repository, project } = setUp(t);
    git(repository, "merge", "-q", "--no-ff", "-m", "merged already", "feature");
    assert.equal(await canOfferMerge("feature", project), false);
  });

  test("doesn't offer a branch without a worktree", async (t) => {
    const { repository, project } = setUp(t);
    git(repository, "branch", "-q", "elsewhere", "feature");
    assert.equal(await canOfferMerge("elsewhere", project), false);
  });
});

describe("checkMerge", () => {
  // Every ref, and both checkouts' HEADs and statuses, so a test can show the check changed none of them.
  const snapshot = ({ repository, worktree }) => ({
    refs: git(repository, "for-each-ref", "--format=%(refname) %(objectname)"),
    heads: [head(repository), head(worktree)],
    statuses: [git(repository, "status", "--porcelain"), git(worktree, "status", "--porcelain")],
  });

  test("passes a branch that merges cleanly, changing nothing", async (t) => {
    const setup = setUp(t);
    commitFile(setup.repository, "other.txt", "from main\n");
    const before = snapshot(setup);
    assert.equal((await checkMerge(setup.issue, setup.project)).branch, "main");
    assert.deepEqual(snapshot(setup), before);
  });

  test("refuses a branch that conflicts with main, naming the files, changing nothing", async (t) => {
    const setup = setUp(t);
    commitFile(setup.worktree, "README", "from the branch\n");
    commitFile(setup.repository, "README", "from main\n");
    const before = snapshot(setup);
    await assert.rejects(checkMerge(setup.issue, setup.project), (error) => {
      assert.ok(error instanceof MergeRefusal, error.message);
      assert.equal(error.message, "feature doesn't merge cleanly into main, so nothing was merged: README");
      return true;
    });
    assert.deepEqual(snapshot(setup), before);
  });

  test("refuses when the main checkout has uncommitted changes, changing nothing", async (t) => {
    const setup = setUp(t);
    writeFileSync(join(setup.repository, "README"), "edited\n");
    const before = snapshot(setup);
    await assert.rejects(checkMerge(setup.issue, setup.project), /main checkout .* has uncommitted changes/);
    assert.deepEqual(snapshot(setup), before);
  });
});
