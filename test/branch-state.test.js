import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaults, stubHerdr } from "./support/herdr.js";
import { commitFile, createClonedRepository, createRepository, git, temporaryFolder } from "./support/repository.js";
import { branchState, isMergedInto } from "../mod/worktree.js";

describe("isMergedInto", () => {
  // A repository on `feature`, a branch off main with one commit, after main gained a commit of its own.
  function featureBranch(t) {
    const repository = createRepository(temporaryFolder(t));
    git(repository, "switch", "-q", "-c", "feature");
    commitFile(repository, "feature.txt", "feature\n");
    git(repository, "switch", "-q", "main");
    commitFile(repository, "main.txt", "main\n");
    return { top: repository };
  }

  test("is true for a branch merged normally", async (t) => {
    const repo = featureBranch(t);
    git(repo.top, "merge", "-q", "--no-ff", "-m", "merge feature", "feature");
    git(repo.top, "switch", "-q", "feature");
    assert.equal(await isMergedInto(repo, "main", null), true);
  });

  test("is true for a branch squash-merged", async (t) => {
    const repo = featureBranch(t);
    git(repo.top, "merge", "-q", "--squash", "feature");
    git(repo.top, "commit", "-q", "-m", "squash feature");
    git(repo.top, "switch", "-q", "feature");
    assert.equal(await isMergedInto(repo, "main", null), true);
  });

  test("is true for a branch with no commits of its own", async (t) => {
    const repo = featureBranch(t);
    git(repo.top, "switch", "-q", "-c", "untouched", "main~1");
    assert.equal(await isMergedInto(repo, "main", null), true);
  });

  test("is false for a branch with unmerged work", async (t) => {
    const repo = featureBranch(t);
    git(repo.top, "switch", "-q", "feature");
    assert.equal(await isMergedInto(repo, "main", null), false);
  });
});

describe("branchState", () => {
  // gh can't answer for these repositories, as for a repository whose origin isn't on GitHub.
  const withoutGitHub = (t) => stubHerdr(t, {
    exec: (command, args, options) => command === "gh" ? Promise.resolve({ code: 1, stdout: "", stderr: "not a GitHub repository" })
      : defaults.exec(command, args, options),
  });

  function clone(t, options) {
    withoutGitHub(t);
    const { clone: top } = createClonedRepository(temporaryFolder(t), options);
    return { top, main: top };
  }

  test("counts the commits on no origin branch", async (t) => {
    const repo = clone(t);
    git(repo.top, "switch", "-q", "-c", "feature");
    commitFile(repo.top, "one.txt", "one\n");
    commitFile(repo.top, "two.txt", "two\n");
    git(repo.top, "push", "-q", "origin", "feature~1:refs/heads/feature");
    const state = await branchState(repo, null);
    assert.deepEqual(state, { branch: "feature", bases: ["main", "origin/main"], mergedInto: null, unpushed: 1, pullRequest: null });
  });

  test("names the local default branch when it holds the branch", async (t) => {
    const repo = clone(t);
    git(repo.top, "switch", "-q", "-c", "feature");
    commitFile(repo.top, "feature.txt", "feature\n");
    git(repo.top, "switch", "-q", "main");
    git(repo.top, "merge", "-q", "feature");
    git(repo.top, "switch", "-q", "feature");
    const state = await branchState(repo, null);
    assert.equal(state.mergedInto, "main");
    assert.equal(state.unpushed, 1);
  });

  test("names origin's default branch when only it holds the branch", async (t) => {
    const repo = clone(t);
    git(repo.top, "switch", "-q", "-c", "feature");
    commitFile(repo.top, "feature.txt", "feature\n");
    git(repo.top, "push", "-q", "origin", "feature:main");
    git(repo.top, "update-ref", "refs/remotes/origin/main", "main");
    const state = await branchState(repo, null);
    assert.equal(state.mergedInto, "origin/main");
    assert.equal(state.unpushed, 0);
  });

  test("reads origin's default branch from origin/HEAD", async (t) => {
    const repo = clone(t, { branch: "trunk" });
    git(repo.top, "switch", "-q", "-c", "feature");
    const state = await branchState(repo, null);
    assert.deepEqual(state.bases, ["trunk", "origin/trunk"]);
    assert.equal(state.mergedInto, "trunk");
  });

  test("takes origin/main as origin's default branch without origin/HEAD", async (t) => {
    const repo = clone(t, { branch: "trunk" });
    git(repo.top, "push", "-q", "origin", "trunk:main");
    git(repo.top, "branch", "-q", "main", "trunk");
    git(repo.top, "remote", "set-head", "origin", "--delete");
    git(repo.top, "switch", "-q", "-c", "feature");
    const state = await branchState(repo, null);
    assert.deepEqual(state.bases, ["main", "origin/main"]);
  });

  test("compares with main or master, with nothing to push to, without origin", async (t) => {
    withoutGitHub(t);
    const folder = temporaryFolder(t);
    for (const base of ["main", "master"]) {
      const top = createRepository(folder, { name: base, branch: base });
      git(top, "switch", "-q", "-c", "feature");
      const state = await branchState({ top, main: top }, null);
      assert.deepEqual(state, { branch: "feature", bases: [base], mergedInto: base, unpushed: null, pullRequest: null });
    }
  });

  test("is null on a detached HEAD", async (t) => {
    const repo = clone(t);
    git(repo.top, "switch", "-q", "--detach");
    assert.equal(await branchState(repo, null), null);
  });
});
