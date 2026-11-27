import assert from "node:assert/strict";
import { test } from "node:test";
import { databaseFolder, watchDatabase } from "../mod/database-watch.js";

const beads = /** @type {any} */ ({ kind: "beads" });
const folder = "/work/repo/.beads";

// A watcher the test feeds batches of changed paths to, one per pending watch call.
function fakeWatcher() {
  /** @type {((paths: string[]) => void)[]} */
  const waiting = [];
  let calls = 0,
    cancels = 0;
  const watch = () => {
    calls += 1;
    /** @type {any} */
    let settle;
    const pending = /** @type {any} */ (new Promise((resolve) => (settle = resolve)));
    waiting.push(settle);
    pending.cancel = () => {
      cancels += 1;
      settle([]);
    };
    return pending;
  };
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return {
    watch,
    get calls() {
      return calls;
    },
    get cancels() {
      return cancels;
    },
    async change(/** @type {string[]} */ paths) {
      await flush();
      waiting.shift()?.(paths);
      await flush();
    },
  };
}

const watching = (watcher, onChange) =>
  watchDatabase(folder, onChange, {
    watch: watcher.watch,
    resolve: async () => "/private/work/repo/.beads",
    sleep: () => new Promise((resolve) => setTimeout(resolve, 5)),
  });
const settled = () => new Promise((resolve) => setTimeout(resolve, 400));

test("a Beads repository on this machine watches its main checkout's .beads folder", () => {
  assert.equal(databaseFolder({ tracker: beads, project: { root: "/work/wt" }, scopeKey: "/work/repo" }), folder);
});

test("no folder is watched for another tracker, a remote repository or nothing listed", () => {
  const github = /** @type {any} */ ({ kind: "github" });
  assert.equal(databaseFolder({ tracker: github, project: { root: "/work/repo" }, scopeKey: "/work/repo" }), null);
  assert.equal(
    databaseFolder({ tracker: beads, project: { root: "/work/repo", on: "box" }, scopeKey: "/work/repo" }),
    null,
  );
  assert.equal(databaseFolder({ tracker: null, project: null, scopeKey: null }), null);
});

test("a write to the database, which touches last-touched, refreshes once", async () => {
  const watcher = fakeWatcher();
  let refreshes = 0;
  const watch = watching(watcher, () => (refreshes += 1));
  await watcher.change([`${folder}/embeddeddolt/r/.dolt/noms/manifest`, `${folder}/last-touched`]);
  await settled();
  assert.equal(refreshes, 1);
  watch.cancel();
});

test("a change reported under the folder's real path counts", async () => {
  const watcher = fakeWatcher();
  let refreshes = 0;
  const watch = watching(watcher, () => (refreshes += 1));
  await watcher.change(["/private/work/repo/.beads/last-touched"]);
  await settled();
  assert.equal(refreshes, 1);
  watch.cancel();
});

test("the store churn a read causes, and a dropped-paths batch, don't refresh", async () => {
  const watcher = fakeWatcher();
  let refreshes = 0;
  const watch = watching(watcher, () => (refreshes += 1));
  await watcher.change([
    `${folder}/embeddeddolt/r/.dolt/noms/manifest`,
    `${folder}/embeddeddolt/r/.dolt/noms/journal.idx`,
    `${folder}/embeddeddolt.gate.lock`,
  ]);
  await watcher.change([folder]);
  await settled();
  assert.equal(refreshes, 0);
  watch.cancel();
});

test("a burst of writes refreshes once", async () => {
  const watcher = fakeWatcher();
  let refreshes = 0;
  const watch = watching(watcher, () => (refreshes += 1));
  for (let i = 0; i < 4; i += 1) await watcher.change([`${folder}/last-touched`]);
  await settled();
  assert.equal(refreshes, 1);
  watch.cancel();
});

test("cancelling releases the pending watch, stops watching and drops a pending refresh", async () => {
  const watcher = fakeWatcher();
  let refreshes = 0;
  const watch = watching(watcher, () => (refreshes += 1));
  await watcher.change([`${folder}/last-touched`]);
  watch.cancel();
  await settled();
  assert.equal(refreshes, 0);
  assert.equal(watcher.cancels, 1);
  assert.equal(watch.running, false);
  assert.equal(watcher.calls, 2);
});

test("a watch the watcher refuses stops running, so the panel can start another", async () => {
  const watch = watchDatabase(folder, () => {}, {
    watch: () => /** @type {any} */ (Promise.reject(new Error("too many watches"))),
    resolve: async () => folder,
    sleep: async () => {},
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(watch.running, false);
});
