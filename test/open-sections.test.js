import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { isSectionOpen, setSectionOpen } from "../mod/open-sections.js";

const COLLAPSED_BY_DEFAULT = ["backlog", "done", "canceled"];
const group = (id) => ({ id, collapsed: COLLAPSED_BY_DEFAULT.includes(id) });

function storedValues(t, values = {}) {
  stubHerdr(t, { shared: (key) => values[key], setShared: (key, value) => { values[key] = value; } });
  return values;
}

test("with nothing stored, sections follow their defaults", (t) => {
  storedValues(t);
  assert.equal(isSectionOpen("/code/app", group("todo")), true);
  assert.equal(isSectionOpen("/code/app", group("done")), false);
});

test("a stored state overrides a section's default", (t) => {
  storedValues(t);
  setSectionOpen("/code/app", "done", true);
  setSectionOpen("/code/app", "todo", false);
  assert.equal(isSectionOpen("/code/app", group("done")), true);
  assert.equal(isSectionOpen("/code/app", group("todo")), false);
  assert.equal(isSectionOpen("/code/app", group("canceled")), false);
});

test("each repository keeps its own sections", (t) => {
  storedValues(t);
  setSectionOpen("/code/app", "done", true);
  setSectionOpen("/code/site", "backlog", true);
  assert.equal(isSectionOpen("/code/app", group("done")), true);
  assert.equal(isSectionOpen("/code/app", group("backlog")), false);
  assert.equal(isSectionOpen("/code/site", group("done")), false);
  assert.equal(isSectionOpen("/code/site", group("backlog")), true);
});

test("setting a section to the state it has stores nothing new", (t) => {
  let writes = 0;
  const values = {};
  stubHerdr(t, { shared: (key) => values[key], setShared: (key, value) => { writes++; values[key] = value; } });
  setSectionOpen("/code/app", "done", true);
  setSectionOpen("/code/app", "done", true);
  assert.equal(writes, 1);
});

test("without a repository, nothing is stored", (t) => {
  const values = storedValues(t);
  setSectionOpen(null, "done", true);
  assert.deepEqual(values, {});
});
