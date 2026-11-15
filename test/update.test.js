import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { commitFile, createClonedRepository, git, temporaryFolder } from "./support/repository.js";
import { availableUpdate, dismissUpdate, finishedUpdate, installTab, modCheckout, modLinkPath, offeredUpdate, updateStatePath } from "../mod/update.js";

// A checkout cloned from a bare origin, with the mod linked to its mod folder as setup links it.
function installedCheckout(t) {
  const folder = temporaryFolder(t);
  const { origin, clone } = createClonedRepository(folder);
  mkdirSync(join(clone, "mod"));
  mkdirSync(dirname(modLinkPath()), { recursive: true });
  symlinkSync(join(clone, "mod"), modLinkPath());
  t.after(() => { rmSync(modLinkPath(), { force: true }); rmSync(updateStatePath(), { force: true }); });
  return { folder, origin, checkout: clone };
}

let pushes = 0;
// Pushes a new commit to origin's main from another clone, returning it.
function pushToOrigin(folder, origin) {
  const other = join(folder, `other-${++pushes}`);
  git(folder, "clone", "-q", origin, other);
  commitFile(other, "CHANGES", `change ${pushes}\n`);
  git(other, "push", "-q", "origin", "main");
  return git(other, "rev-parse", "HEAD");
}

test("the mod's checkout is the one its link points into", async (t) => {
  const { checkout } = installedCheckout(t);
  assert.equal(await modCheckout(), checkout);
});

test("no update is offered when the checkout is up to date", async (t) => {
  installedCheckout(t);
  assert.equal(await offeredUpdate(), null);
});

test("an update is offered when origin's main is ahead of a clean main", async (t) => {
  const { folder, origin, checkout } = installedCheckout(t);
  pushToOrigin(folder, origin);
  const latest = pushToOrigin(folder, origin);
  assert.deepEqual(await offeredUpdate(), { checkout, commit: latest, count: 2 });
});

test("no update is offered on a feature branch", async (t) => {
  const { folder, origin, checkout } = installedCheckout(t);
  pushToOrigin(folder, origin);
  git(checkout, "switch", "-q", "-c", "feature");
  assert.equal(await availableUpdate(checkout), null);
});

test("no update is offered with local changes", async (t) => {
  const { folder, origin, checkout } = installedCheckout(t);
  pushToOrigin(folder, origin);
  writeFileSync(join(checkout, "README"), "edited\n");
  assert.equal(await availableUpdate(checkout), null);
});

test("no update is offered when HEAD has commits origin's main lacks", async (t) => {
  const { folder, origin, checkout } = installedCheckout(t);
  pushToOrigin(folder, origin);
  commitFile(checkout, "LOCAL", "local\n");
  assert.equal(await availableUpdate(checkout), null);
});

test("a fetch from an unreachable origin offers nothing and raises nothing", async (t) => {
  const { folder, origin, checkout } = installedCheckout(t);
  pushToOrigin(folder, origin);
  git(checkout, "remote", "set-url", "origin", join(folder, "missing.git"));
  assert.equal(await offeredUpdate(), null);
});

test("a dismissed update stays hidden until origin's main moves past it", async (t) => {
  const { folder, origin, checkout } = installedCheckout(t);
  pushToOrigin(folder, origin);
  await dismissUpdate(await offeredUpdate());
  assert.equal(await offeredUpdate(), null);
  const newer = pushToOrigin(folder, origin);
  assert.deepEqual(await offeredUpdate(), { checkout, commit: newer, count: 2 });
});

test("Update runs the checkout's install in a tab, then reloads the mod", async (t) => {
  const { folder, origin, checkout } = installedCheckout(t);
  pushToOrigin(folder, origin);
  const tab = await installTab(await offeredUpdate());
  assert.equal(tab.folder, checkout);
  assert.deepEqual(tab.argv.slice(-2), [join(checkout, "install"), modLinkPath()]);
  assert.match(tab.argv[2], /touch -h/);
});

test("the update is reported finished once, after the checkout holds its commit", async (t) => {
  const { folder, origin, checkout } = installedCheckout(t);
  const commit = pushToOrigin(folder, origin);
  await installTab(await offeredUpdate());
  assert.equal(await finishedUpdate(), false);
  git(checkout, "merge", "-q", "--ff-only", "origin/main");
  assert.equal(await finishedUpdate(), true);
  assert.equal(await finishedUpdate(), false);
  assert.equal(JSON.parse(readFileSync(updateStatePath(), "utf8")).updating, null);
  assert.equal(git(checkout, "rev-parse", "HEAD"), commit);
});
