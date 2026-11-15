import { test } from "node:test";
import assert from "node:assert/strict";
import { openBehindArgs } from "../mod/open-behind.js";

test("Herdr releases after 0.1.15 open the space behind what's shown", () => {
  assert.deepEqual(openBehindArgs("0.1.16"), { focus: false });
  assert.deepEqual(openBehindArgs("0.2.0"), { focus: false });
  assert.deepEqual(openBehindArgs("1.0.0-beta.1"), { focus: false });
});

test("Herdr 0.1.15 and earlier, which refuse focus, get no extra argument", () => {
  assert.deepEqual(openBehindArgs("0.1.15"), {});
  assert.deepEqual(openBehindArgs("0.1.9"), {});
  assert.deepEqual(openBehindArgs("0.0.40"), {});
});

test("an unreadable version gets no extra argument", () => {
  assert.deepEqual(openBehindArgs(undefined), {});
  assert.deepEqual(openBehindArgs("dev"), {});
});
