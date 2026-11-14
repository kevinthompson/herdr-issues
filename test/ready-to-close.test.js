import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { commitFile, createClonedRepository, createRepository, git, temporaryFolder } from "./support/repository.js";
import { repositoryState, worktreeWork } from "../mod/worktree.js";
import { readyToClose } from "../mod/issue.js";

const local = { on: null };

// A repository with a linked worktree on `feature`, a fresh branch off main.
function repositoryWithWorktree(t, create = createRepository) {
  const folder = temporaryFolder(t);
  const created = create(folder);
  const repository = typeof created === "string" ? created : created.clone;
  const path = join(folder, "feature");
  git(repository, "worktree", "add", "-q", "-b", "feature", path);
  return { repository, worktree: { path, branch: "feature", on: null }, main: { path: repository, branch: "main" } };
}

describe("worktreeWork", () => {
  test("says a fresh branch hasn't moved, though main contains it", async (t) => {
    const { worktree, main } = repositoryWithWorktree(t);
    assert.deepEqual(await worktreeWork(worktree, main), { dirty: false, moved: false, merged: true, unpushed: null });
  });

  test("says a branch merged into main moved and is merged", async (t) => {
    const { repository, worktree, main } = repositoryWithWorktree(t);
    commitFile(worktree.path, "feature.txt", "feature\n");
    git(repository, "merge", "-q", "--no-ff", "-m", "merge feature", "feature");
    assert.deepEqual(await worktreeWork(worktree, main), { dirty: false, moved: true, merged: true, unpushed: null });
  });

  test("says a branch with work main lacks isn't merged", async (t) => {
    const { worktree, main } = repositoryWithWorktree(t);
    commitFile(worktree.path, "feature.txt", "feature\n");
    assert.equal((await worktreeWork(worktree, main)).merged, false);
  });

  test("counts an untracked file as uncommitted", async (t) => {
    const { worktree, main } = repositoryWithWorktree(t);
    writeFileSync(join(worktree.path, "scratch.txt"), "scratch\n");
    assert.equal((await worktreeWork(worktree, main)).dirty, true);
  });

  test("counts the commits on no origin branch, without fetching", async (t) => {
    const { worktree, main } = repositoryWithWorktree(t, createClonedRepository);
    commitFile(worktree.path, "one.txt", "one\n");
    commitFile(worktree.path, "two.txt", "two\n");
    assert.equal((await worktreeWork(worktree, main)).unpushed, 2);
    git(worktree.path, "push", "-q", "origin", "feature");
    assert.equal((await worktreeWork(worktree, main)).unpushed, 0);
  });

  test("is null without a branch", async (t) => {
    const { worktree, main } = repositoryWithWorktree(t);
    assert.equal(await worktreeWork({ ...worktree, branch: null }, main), null);
  });
});

describe("repositoryState", () => {
  test("gives the repository's complete setting", async (t) => {
    const { repository } = repositoryWithWorktree(t);
    assert.equal((await repositoryState([], { root: repository, ...local })).complete, "merged");
  });
});

describe("readyToClose", () => {
  const finished = { dirty: false, moved: true, merged: true, unpushed: 0 };
  const inReview = { dirty: false, moved: true, merged: false, unpushed: 0 };
  const issue = (fields) => ({ status: "in-progress", branch: "feature", pullRequests: [], ...fields });
  const withPullRequest = (status) => issue({ pullRequests: [{ branch: "feature", status }] });

  test("is true for a clean worktree whose branch is merged into main", () => {
    assert.equal(readyToClose(issue(), finished, "merged"), true);
  });

  test("is false with anything uncommitted", () => {
    assert.equal(readyToClose(issue(), { ...finished, dirty: true }, "merged"), false);
    assert.equal(readyToClose(issue({ status: "canceled" }), { ...finished, dirty: true }, "merged"), false);
  });

  test("is false for a branch that never moved, though main contains it", () => {
    assert.equal(readyToClose(issue(), { ...finished, moved: false }, "merged"), false);
  });

  test("is true for a canceled issue's clean worktree", () => {
    assert.equal(readyToClose(issue({ status: "canceled" }), { dirty: false, moved: false, merged: false, unpushed: 3 }, "merged"), true);
  });

  test("counts a pushed branch with an open pull request only with pull-request-open", () => {
    assert.equal(readyToClose(withPullRequest("open"), inReview, "pull-request-open"), true);
    assert.equal(readyToClose(withPullRequest("draft"), inReview, "pull-request-open"), true);
    assert.equal(readyToClose(withPullRequest("inReview"), inReview, "pull-request-open"), true);
    assert.equal(readyToClose(withPullRequest("open"), inReview, "merged"), false);
  });

  test("needs the pull request open, on the issue's branch, and the branch pushed", () => {
    assert.equal(readyToClose(withPullRequest("closed"), inReview, "pull-request-open"), false);
    assert.equal(readyToClose(issue({ pullRequests: [{ branch: "other", status: "open" }] }), inReview, "pull-request-open"), false);
    assert.equal(readyToClose(withPullRequest("open"), { ...inReview, unpushed: 1 }, "pull-request-open"), false);
    assert.equal(readyToClose(withPullRequest("open"), { ...inReview, unpushed: null }, "pull-request-open"), false);
  });

  test("is false when the worktree's work couldn't be read", () => {
    assert.equal(readyToClose(issue({ status: "canceled" }), null, "merged"), false);
  });
});
