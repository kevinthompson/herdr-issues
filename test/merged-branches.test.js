import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import { commitFile, createRepository, git, temporaryFolder } from "./support/repository.js";
import { deleteMergedBranches, repositoryState } from "../worktree.js";

const local = { on: null };
const branches = (repository) => git(repository, "branch", "--format=%(refname:short)").split("\n").sort();

// A branch off main with one commit, merged back into main unless `merged` is false; main stays checked out.
function addBranch(repository, branch, { merged = true } = {}) {
  git(repository, "switch", "-q", "-c", branch, "main");
  commitFile(repository, `${branch}.txt`, `${branch}\n`);
  git(repository, "switch", "-q", "main");
  if (merged) git(repository, "merge", "-q", "--no-ff", "-m", `merge ${branch}`, branch);
}

describe("repositoryState", () => {
  test("lists only done issues' merged branches that no checkout has out", async (t) => {
    const folder = temporaryFolder(t);
    const repository = createRepository(folder);
    for (const branch of ["finished", "checked-out", "underway"]) addBranch(repository, branch);
    addBranch(repository, "unmerged", { merged: false });
    git(repository, "worktree", "add", "-q", join(folder, "checked-out"), "checked-out");
    const issues = [
      { status: "done", branch: "finished" },
      { status: "done", branch: "checked-out" },
      { status: "in-progress", branch: "underway" },
      { status: "done", branch: "unmerged" },
      { status: "done", branch: "main" },
    ];
    const state = await repositoryState(issues, { root: repository, ...local });
    assert.deepEqual(state.mergedFinished, ["finished"]);
  });

  test("lists the linked worktrees", async (t) => {
    const folder = temporaryFolder(t);
    const repository = createRepository(folder);
    git(repository, "worktree", "add", "-q", "-b", "feature", join(folder, "feature"));
    const state = await repositoryState([], { root: repository, ...local });
    assert.deepEqual(state.main, { path: repository, branch: "main" });
    assert.deepEqual(state.worktrees, [{ path: join(folder, "feature"), branch: "feature", on: null }]);
  });

  test("is null when the main checkout isn't on main or master", async (t) => {
    const folder = temporaryFolder(t);
    const onTrunk = createRepository(folder, { name: "trunk", branch: "trunk" });
    assert.equal(await repositoryState([], { root: onTrunk, ...local }), null);
    const onFeature = createRepository(folder, { name: "feature" });
    git(onFeature, "switch", "-q", "-c", "feature");
    assert.equal(await repositoryState([], { root: onFeature, ...local }), null);
    const onMaster = createRepository(folder, { name: "master", branch: "master" });
    assert.notEqual(await repositoryState([], { root: onMaster, ...local }), null);
  });

  test("is null outside a repository", async (t) => {
    assert.equal(await repositoryState([], { root: temporaryFolder(t), ...local }), null);
  });
});

describe("deleteMergedBranches", () => {
  test("deletes merged branches, leaves unmerged ones, and returns those deleted", async (t) => {
    const repository = createRepository(temporaryFolder(t));
    addBranch(repository, "merged");
    addBranch(repository, "unmerged", { merged: false });
    const deleted = await deleteMergedBranches(["merged", "unmerged"], { main: { path: repository }, ...local });
    assert.deepEqual(deleted, ["merged"]);
    assert.deepEqual(branches(repository), ["main", "unmerged"]);
  });
});
