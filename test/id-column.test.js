import assert from "node:assert/strict";
import { test } from "node:test";
import { idColumnWidth } from "../mod/id-column.js";

const sixCharacterWidth = idColumnWidth(["ABCDEF"]);

test("keeps the column six characters wide for short IDs", () => {
  assert.equal(idColumnWidth(["#7", "#223"]), sixCharacterWidth);
});

test("keeps the column six characters wide for an empty list", () => {
  assert.equal(idColumnWidth([]), sixCharacterWidth);
});

test("widens the column to fit the longest ID", () => {
  const nineCharacterWidth = idColumnWidth(["#7", "CAL-12345"]);
  assert.ok(nineCharacterWidth > sixCharacterWidth);
  assert.ok(idColumnWidth(["CAL-12345", "PLATFORM-1234"]) > nineCharacterWidth);
});

test("fits a five-digit Linear ID in at least the column's former 72px", () => {
  assert.ok(idColumnWidth(["CAL-12345"]) >= 72);
});
