import { test } from "node:test";
import assert from "node:assert/strict";
import { stillWaitingForSpace } from "../mod/opening-wait.js";

const timeoutMs = 1000;

test("the loading state stays until the issue's space appears", () => {
  assert.equal(stillWaitingForSpace({ failed: false, inSpace: false, waitedMs: 10, timeoutMs }), true);
  assert.equal(stillWaitingForSpace({ failed: false, inSpace: true, waitedMs: 10, timeoutMs }), false);
});

test("a failure ends the loading state at once", () => {
  assert.equal(stillWaitingForSpace({ failed: true, inSpace: false, waitedMs: 0, timeoutMs }), false);
});

test("the loading state ends once the wait reaches the timeout", () => {
  assert.equal(stillWaitingForSpace({ failed: false, inSpace: false, waitedMs: 999, timeoutMs }), true);
  assert.equal(stillWaitingForSpace({ failed: false, inSpace: false, waitedMs: 1000, timeoutMs }), false);
});
