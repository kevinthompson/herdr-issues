// Each repository's setup kept by KeptSetups while the panel shows another repository: resumed on return,
// emptied by Cancel, forgotten once saved, and still the one a check that finishes later applies to.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { temporaryFolder } from "./support/repository.js";
import { KeptSetups } from "../mod/setup.js";
import { settingsPath } from "../mod/trackers/setting.js";

// A context whose spawned tasks are collected, so a test can wait for them or hold them part way.
function context() {
  const tasks = [];
  const cx = {
    focus_handle: () => ({ focus() {}, is_focused: () => false }),
    notify() {},
    spawn: (task) => tasks.push(task(cx)),
    settle: async () => {
      while (tasks.length) await tasks.shift();
    },
  };
  return cx;
}

const proposed = { approval: "ask", onApproval: "merge", waitForChecks: "no", pushAfterMerge: "no" };

// Starts a repository's setup, chooses GitHub Issues as though its check passed, presses Next and answers approval.
function advance(setup, approval, cx) {
  setup.settingUp = true;
  setup.tracker.choice = "github";
  setup.ready(proposed, cx);
  setup.leaveTrackerStep(cx);
  setup.chooseApproval("approval", approval, cx);
}

test("a repository's setup resumes on the same step with its answers after another repository is shown", (t) => {
  stubHerdr(t);
  const cx = context();
  const kept = new KeptSetups(() => {});
  advance(kept.forRepository("/a"), "auto", cx);

  kept.forRepository("/b");
  const resumed = kept.forRepository("/a");

  assert.equal(resumed.settingUp, true);
  assert.equal(resumed.step, "approval");
  assert.equal(resumed.tracker.choice, "github");
  assert.equal(resumed.approvalValue("approval"), "auto");
});

test("two repositories set up alternately each keep their own progress", (t) => {
  stubHerdr(t);
  const cx = context();
  const kept = new KeptSetups(() => {});
  advance(kept.forRepository("/a"), "auto", cx);
  const b = kept.forRepository("/b");
  advance(b, "ask", cx);
  b.nextApproval(cx);

  const a = kept.forRepository("/a");
  assert.equal(a.step, "approval");
  assert.equal(a.approvalValue("approval"), "auto");
  assert.equal(kept.forRepository("/b").step, "review");
  assert.equal(kept.forRepository("/b").answers.approval, "ask");
});

test("Cancel returns a kept setup to the blank state, which it shows when the repository comes back", (t) => {
  stubHerdr(t);
  const cx = context();
  const kept = new KeptSetups(() => {});
  const setup = kept.forRepository("/a");
  advance(setup, "auto", cx);
  setup.cancel(cx);

  kept.forRepository("/b");
  const resumed = kept.forRepository("/a");

  assert.equal(resumed.settingUp, false);
  assert.equal(resumed.step, "tracker");
  assert.equal(resumed.tracker.choice, null);
  assert.deepEqual(resumed.answers, {});
});

test("saving a setup forgets it, so the repository's next setup starts fresh", async (t) => {
  stubHerdr(t);
  const cx = context();
  const main = join(temporaryFolder(t), "repo");
  mkdirSync(dirname(settingsPath()), { recursive: true });
  const saved = [];
  const kept = new KeptSetups(() => saved.push(main));
  const setup = kept.forRepository(main);
  advance(setup, "auto", cx);
  setup.nextApproval(cx);
  setup.save(cx);
  await cx.settle();

  assert.equal(JSON.parse(readFileSync(settingsPath(), "utf8")).repos[main].tracker, "github");
  assert.deepEqual(saved, [main]);
  const next = kept.forRepository(main);
  assert.notEqual(next, setup);
  assert.equal(next.settingUp, false);
  assert.equal(next.step, "tracker");
});

test("a tracker check that finishes after another repository is shown applies to its own kept setup", async (t) => {
  let finishCheck;
  const checkHeld = new Promise((resolve) => (finishCheck = resolve));
  stubHerdr(t, {
    exec: async (command, args) => {
      if (command === "gh" && args[0] === "auth") await checkHeld;
      return { code: 0, stdout: "git@github.com:owner/name.git\n", stderr: "" };
    },
  });
  const cx = context();
  const kept = new KeptSetups(() => {});
  const a = kept.forRepository(join(temporaryFolder(t), "a"));
  a.settingUp = true;
  a.tracker.choose("github", cx);

  const b = kept.forRepository("/b");
  finishCheck();
  await cx.settle();

  assert.equal(kept.forRepository(a.main), a);
  assert.equal(a.readyTracker, "github");
  assert.equal(a.tracker.checking, false);
  assert.equal(b.step, "tracker");
  assert.equal(b.tracker.choice, null);
});

test("a repository's kept setup is forgotten once its .git is removed", async (t) => {
  stubHerdr(t);
  const cx = context();
  const kept = new KeptSetups(() => {});
  const removed = temporaryFolder(t),
    remaining = temporaryFolder(t);
  mkdirSync(join(removed, ".git"));
  mkdirSync(join(remaining, ".git"));
  const removedSetup = kept.forRepository(removed),
    remainingSetup = kept.forRepository(remaining);
  advance(removedSetup, "auto", cx);

  rmSync(join(removed, ".git"), { recursive: true });
  await kept.forgetRemoved();

  assert.notEqual(kept.forRepository(removed), removedSetup);
  assert.equal(kept.forRepository(remaining), remainingSetup);
});
