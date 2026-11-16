import assert from "node:assert/strict";
import { test } from "node:test";
import { BUTTON_HEIGHT_PX } from "../mod/action-button.js";
import { DROPDOWN_HEIGHT_PX, ROW_BORDER_PX, ROW_HEIGHT_PX } from "../mod/filter-row.js";

const MIN_VERTICAL_ROOM_PX = 6;
const roomAboveAndBelow = (contentHeight) => (ROW_HEIGHT_PX - ROW_BORDER_PX - contentHeight) / 2;

test("a row beneath a view's header leaves room above and below an action button", () => {
  assert.ok(roomAboveAndBelow(BUTTON_HEIGHT_PX) >= MIN_VERTICAL_ROOM_PX);
});

test("a row beneath a view's header leaves room above and below a dropdown", () => {
  assert.ok(roomAboveAndBelow(DROPDOWN_HEIGHT_PX) >= MIN_VERTICAL_ROOM_PX);
});
