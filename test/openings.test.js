import assert from "node:assert/strict";
import { test } from "node:test";
import { Openings } from "../mod/openings.js";

test("starting a second issue keeps the first issue's opening", () => {
  const openings = new Openings();
  openings.begin("A", "Opening A");
  openings.begin("B", "Opening B");
  assert.equal(openings.get("A")?.status, "Opening A");
  assert.equal(openings.get("B")?.status, "Opening B");
});

test("ending one issue's opening leaves the other's, including its wait for a space", () => {
  const openings = new Openings();
  openings.begin("A", "Opening A");
  openings.begin("B", "Opening B");
  openings.awaitSpace("A", 100);
  openings.end("B");
  assert.equal(openings.get("B"), undefined);
  assert.deepEqual(openings.get("A"), { status: "Opening A", merging: false, awaitingSince: 100 });
});

test("settling ends only the openings whose wait is over", () => {
  const openings = new Openings();
  openings.begin("A", "Opening A");
  openings.begin("B", "Opening B");
  openings.begin("C", "Opening C");
  openings.awaitSpace("A", 100);
  openings.awaitSpace("B", 200);
  openings.settle((id) => id === "B");
  assert.equal(openings.get("A"), undefined);
  assert.deepEqual(openings.get("B"), { status: "Opening B", merging: false, awaitingSince: 200 });
  assert.deepEqual(openings.get("C"), { status: "Opening C", merging: false });
});

test("only openings waiting for a space count as awaiting", () => {
  const openings = new Openings();
  openings.begin("A", "Opening A");
  assert.equal(openings.awaiting, false);
  openings.awaitSpace("A", 100);
  assert.equal(openings.awaiting, true);
});

test("the footer's opening is the most recently started one still open", () => {
  const openings = new Openings();
  assert.equal(openings.latest, undefined);
  openings.begin("A", "Opening A");
  openings.begin("B", "Merging B", { merging: true });
  assert.equal(openings.latest?.status, "Merging B");
  openings.end("B");
  assert.equal(openings.latest?.status, "Opening A");
  openings.begin("B", "Opening B");
  openings.begin("A", "Opening A again");
  assert.equal(openings.latest?.status, "Opening A again");
});

test("waiting for a space applies only to an issue still opening", () => {
  const openings = new Openings();
  openings.awaitSpace("A", 100);
  assert.equal(openings.get("A"), undefined);
});
