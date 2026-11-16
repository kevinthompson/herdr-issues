import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { ChangeRefusal, setIssueStatus, startIssue } from "../cli/change.js";

// A tracker holding the issue "#1" that records each update and start, and counts the panel announcements.
function recordingTracker(t, overrides = {}) {
  const calls = [];
  const counts = { announcements: 0 };
  stubHerdr(t, {
    setShared: () => {
      counts.announcements++;
      return null;
    },
  });
  const tracker = {
    name: "Test",
    writable: true,
    statuses: ["todo", "in-progress", "done"],
    get: async (id) => (id === "#1" ? { id: "#1", status: "todo" } : null),
    update: async (issue, fields) => {
      calls.push({ update: issue.id, ...fields });
    },
    start: async (issue) => {
      calls.push({ start: issue.id });
    },
    ...overrides,
  };
  return { tracker, calls, counts };
}

test("setIssueStatus saves the status through the tracker and announces the change", async (t) => {
  const { tracker, calls, counts } = recordingTracker(t);
  const issue = await setIssueStatus(tracker, "#1", "done");
  assert.equal(issue.id, "#1");
  assert.deepEqual(calls, [{ update: "#1", status: "done" }]);
  assert.equal(counts.announcements, 1);
});

test("startIssue starts the issue through the tracker and announces the change", async (t) => {
  const { tracker, calls, counts } = recordingTracker(t);
  await startIssue(tracker, "#1");
  assert.deepEqual(calls, [{ start: "#1" }]);
  assert.equal(counts.announcements, 1);
});

test("setIssueStatus refuses a status the tracker can't set, naming the ones it can", async (t) => {
  const { tracker, calls, counts } = recordingTracker(t);
  await assert.rejects(setIssueStatus(tracker, "#1", "in-review"), (error) => {
    assert.ok(error instanceof ChangeRefusal);
    assert.match(error.message, /can't be set to in-review; they can be set to todo, in-progress, done/);
    return true;
  });
  assert.deepEqual(calls, []);
  assert.equal(counts.announcements, 0);
});

for (const [name, change] of [
  ["setIssueStatus", (tracker, id) => setIssueStatus(tracker, id, "done")],
  ["startIssue", startIssue],
]) {
  test(`${name} refuses an unknown issue, changing nothing`, async (t) => {
    const { tracker, calls, counts } = recordingTracker(t);
    await assert.rejects(
      change(tracker, "#2"),
      (error) => error instanceof ChangeRefusal && /#2: not found/.test(error.message),
    );
    assert.deepEqual(calls, []);
    assert.equal(counts.announcements, 0);
  });

  test(`${name} refuses a read-only tracker without reading the issue`, async (t) => {
    let reads = 0;
    const { tracker, calls, counts } = recordingTracker(t, {
      writable: false,
      get: async () => {
        reads++;
        return null;
      },
    });
    await assert.rejects(
      change(tracker, "#1"),
      (error) => error instanceof ChangeRefusal && /can't be changed/.test(error.message),
    );
    assert.equal(reads, 0);
    assert.deepEqual(calls, []);
    assert.equal(counts.announcements, 0);
  });
}
