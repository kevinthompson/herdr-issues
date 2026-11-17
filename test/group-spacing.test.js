import assert from "node:assert/strict";
import { test } from "node:test";
import { groupSpacing, OPEN_GROUP_SPACE_PX } from "../mod/group-spacing.js";

const stacked = { above: 0, below: 0 };

test("sets an open card after a collapsed group apart by the same space above as below", () => {
  assert.deepEqual(groupSpacing([false, true]), [stacked, { above: OPEN_GROUP_SPACE_PX, below: OPEN_GROUP_SPACE_PX }]);
});

test("stacks consecutive collapsed groups at the list's gap", () => {
  assert.deepEqual(groupSpacing([false, false]), [stacked, stacked]);
});

test("separates two open cards in a row by the space once", () => {
  assert.deepEqual(groupSpacing([true, true]), [
    { above: 0, below: OPEN_GROUP_SPACE_PX },
    { above: 0, below: OPEN_GROUP_SPACE_PX },
  ]);
});

test("adds no space above the first group", () => {
  assert.equal(groupSpacing([true])[0].above, 0);
});
