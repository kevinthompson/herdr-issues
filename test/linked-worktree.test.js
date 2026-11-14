import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { isLinkedWorktree } from "../mod/worktree.js";
import { createRepository, git, temporaryFolder } from "./support/repository.js";

test("isLinkedWorktree is true in a linked worktree and false in the main checkout", async (t) => {
  const folder = temporaryFolder(t);
  const repository = createRepository(folder);
  const worktree = join(folder, "feature");
  git(repository, "worktree", "add", "-q", "-b", "feature", worktree);

  assert.equal(await isLinkedWorktree(repository), false);
  assert.equal(await isLinkedWorktree(worktree), true);
});

test("isLinkedWorktree is false outside a repository and without a folder", async (t) => {
  assert.equal(await isLinkedWorktree(temporaryFolder(t)), false);
  assert.equal(await isLinkedWorktree(undefined), false);
});
