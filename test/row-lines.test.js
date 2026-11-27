import assert from "node:assert/strict";
import { test } from "node:test";
import { div } from "gpui-kit";
import { callArg } from "./support/gpui.js";
import { idLine, detailLines } from "../mod/row-lines.js";

const theme = { accent: "#3355ff", dim: "#888888" };
const pill = (name) => div().child(name);

test("the ID line shows the ID, then the pills in order, then the button at the right", () => {
  const [priority, pullRequests, button] = [pill("High"), pill("2"), div()];
  const line = idLine("#263", [priority, pullRequests], button, theme);
  const [left, right] = line.kids;
  assert.equal(left.kids[0].kids[0], "#263");
  assert.deepEqual(left.kids.slice(1), [priority, pullRequests]);
  assert.equal(right, button);
});

test("the ID truncates inside a group that shrinks, so the pills and the button stay on the line", () => {
  const [left] = idLine("owner/a-long-repository#12345", [pill("High")], div(), theme).kids;
  assert.equal(callArg(left, "min_w"), 0);
  assert.ok(left.calls.some(([name]) => name === "flex_1"));
  const id = left.kids[0];
  assert.equal(callArg(id, "min_w"), 0);
  assert.ok(id.calls.some(([name]) => name === "truncate"));
});

test("an ID line without pills or a button holds only the ID", () => {
  const line = idLine("#1", [], null, theme);
  assert.equal(line.kids.length, 1);
  assert.equal(line.kids[0].kids.length, 1);
});

test("each detail line holds only its own items, and empty lines are left out", () => {
  const due = pill("Due today");
  const label = pill("bug");
  const blocker = pill("Blocked by #2");
  const lines = detailLines([[due], [], [label], [blocker]], theme);
  assert.deepEqual(
    lines.map((line) => line.kids),
    [[due], [label], [blocker]],
  );
  for (const line of lines) assert.ok(line.calls.some(([name]) => name === "flex_wrap"));
});

test("a row with no details draws no detail lines", () => {
  assert.deepEqual(detailLines([[], [], []], theme), []);
});
