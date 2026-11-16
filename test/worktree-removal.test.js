import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { closeWorktreeSpace, removalInFlight, forgetRemoval } from "../mod/worktree-removal.js";
import { defaults, stubHerdr } from "./support/herdr.js";
import { commitFile, createRepository, git, temporaryFolder } from "./support/repository.js";

const never = () => new Promise(() => {});
const immediately = () => Promise.resolve();

async function waitFor(condition) {
  for (let tries = 0; tries < 500 && !condition(); tries++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(condition(), "timed out waiting");
}

// A repository with a linked worktree on `feature`, a space showing it whose session marked itself done working with
// `issues complete`, and the herdr calls closing it makes. With `unmerged`, the branch has a commit main lacks. With
// `nested`, the space started in the main checkout and another worktree's space nests under it. `holdGit(arg)` holds
// every git command carrying `arg` until the returned release is called.
function worktreeSpace(t, { spaceId, nested = false, unmerged = false }) {
  const folder = temporaryFolder(t);
  const repository = createRepository(folder);
  const worktree = join(folder, "feature");
  git(repository, "worktree", "add", "-q", "-b", "feature", worktree);
  if (unmerged) commitFile(worktree, "work.txt", "unmerged\n");
  const spaceList = [{ id: spaceId, machine: null, folder: nested ? repository : worktree, tabs: [{ id: `${spaceId}-tab` }] }];
  const paneList = [{ pane: `${spaceId}-pane`, terminal: `${spaceId}-terminal`, tab: `${spaceId}-tab`, cwd: worktree }];
  if (nested) {
    const otherWorktree = join(folder, "other");
    git(repository, "worktree", "add", "-q", "-b", "other", otherWorktree);
    spaceList.push({ id: `${spaceId}-other`, machine: null, folder: otherWorktree, tabs: [{ id: "other-tab" }] });
    paneList.push({ pane: "other-pane", terminal: "other-terminal", tab: "other-tab", cwd: otherWorktree });
  }
  const calls = { overlays: [], commands: [], git: [] };
  const holds = new Map();
  stubHerdr(t, {
    spaces: () => spaceList,
    panes: () => paneList,
    terminals: () => [{ address: `${spaceId}-terminal`, labels: { "issues.complete": "#1" } }],
    run: (command, args) => { calls.commands.push([command, args]); },
    openOverlay: (overlay) => { calls.overlays.push(overlay); },
    exec: async (command, args, options) => {
      if (command === "git") {
        calls.git.push(args);
        for (const [arg, hold] of holds) if (args.includes(arg)) await hold;
      }
      return defaults.exec(command, args, options);
    },
  });
  t.after(() => forgetRemoval(spaceId, removalInFlight(spaceId)));
  const holdGit = (arg) => {
    let release;
    holds.set(arg, new Promise((resolve) => { release = resolve; }));
    return release;
  };
  const closes = () => calls.commands.filter(([command]) => command === "space.close");
  const statusRuns = () => calls.git.filter((args) => args.includes("status")).length;
  return { worktree, calls, holdGit, closes, statusRuns };
}

describe("closeWorktreeSpace", () => {
  test("removes a clean worktree and closes its space without opening the dialog", async (t) => {
    const { worktree, calls, closes } = worktreeSpace(t, { spaceId: "clean" });
    await closeWorktreeSpace("clean", { sleep: never });
    assert.deepEqual(calls.overlays, []);
    assert.deepEqual(closes(), [["space.close", { id: "clean", confirmed: true }]]);
    assert.equal(existsSync(worktree), false);
    assert.equal(removalInFlight("clean"), undefined);
  });

  test("checks the branch of a space whose session ran issues complete, and asks when it isn't merged", async (t) => {
    const { worktree, calls, closes } = worktreeSpace(t, { spaceId: "handed-off", unmerged: true });
    await closeWorktreeSpace("handed-off", { sleep: never });
    assert.equal(removalInFlight("handed-off").checks.branch.mergedInto, null);
    assert.equal(calls.overlays.length, 1);
    assert.deepEqual(closes(), []);
    assert.equal(existsSync(worktree), true);
  });

  test("opens the dialog on the running checks once they outlast the delay", async (t) => {
    const { calls, holdGit, closes, statusRuns } = worktreeSpace(t, { spaceId: "slow" });
    const release = holdGit("status");
    const closing = closeWorktreeSpace("slow", { sleep: immediately });
    await waitFor(() => calls.overlays.length === 1);
    assert.deepEqual(calls.overlays[0].props, { space: "slow", action: "remove", ask: false });
    const removal = removalInFlight("slow");
    assert.equal(removal.checks.dirty, undefined);
    release();
    await closing;
    assert.equal(removalInFlight("slow"), removal, "the dialog carries on with the same removal");
    assert.equal(removal.checks.dirty, false);
    assert.equal(statusRuns(), 1);
    assert.deepEqual(closes(), [], "the dialog removes it, not the silent close");
  });

  test("opens the dialog at once when a check fails", async (t) => {
    const { worktree, calls, holdGit } = worktreeSpace(t, { spaceId: "dirty" });
    writeFileSync(join(worktree, "notes.txt"), "unsaved\n");
    const release = holdGit("--absolute-git-dir");
    const closing = closeWorktreeSpace("dirty", { sleep: never });
    await waitFor(() => calls.overlays.length === 1);
    const removal = removalInFlight("dirty");
    assert.equal(removal.checks.dirty, true);
    assert.equal(removal.checks.submodules, undefined, "it didn't wait for the other checks");
    release();
    await closing;
    assert.equal(calls.overlays.length, 1);
  });

  test("opens the dialog at once with ask", async (t) => {
    const { calls, holdGit, closes } = worktreeSpace(t, { spaceId: "ask" });
    const release = holdGit("status");
    const closing = closeWorktreeSpace("ask", { ask: true, sleep: never });
    await waitFor(() => calls.overlays.length === 1);
    assert.equal(calls.overlays[0].props.ask, true);
    assert.equal(removalInFlight("ask").checks.dirty, undefined);
    release();
    await closing;
    assert.deepEqual(closes(), []);
  });

  test("opens the dialog at once when spaces nest under this one", async (t) => {
    const { calls, holdGit, closes } = worktreeSpace(t, { spaceId: "nested", nested: true });
    const release = holdGit("status");
    const closing = closeWorktreeSpace("nested", { sleep: never });
    await waitFor(() => calls.overlays.length === 1);
    const removal = removalInFlight("nested");
    assert.deepEqual(removal.nestedSpaces.map((space) => space.id), ["nested-other"]);
    assert.equal(removal.checks.dirty, undefined);
    release();
    await closing;
    assert.deepEqual(closes(), []);
  });

  test("starts no second removal while one is running", async (t) => {
    const { calls, closes } = worktreeSpace(t, { spaceId: "twice" });
    await Promise.all([closeWorktreeSpace("twice", { sleep: never }), closeWorktreeSpace("twice", { sleep: never })]);
    assert.equal(calls.git.filter((args) => args.includes("--show-toplevel")).length, 1);
    assert.equal(closes().length, 1);
    assert.deepEqual(calls.overlays, []);
  });
});
