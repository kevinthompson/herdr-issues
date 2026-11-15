import { test } from "node:test";
import assert from "node:assert/strict";
import { labelGroups } from "../mod/label-order.js";

test("applied labels come first and the rest follow, each listed once", () => {
  assert.deepEqual(labelGroups(["bug", "docs", "enhancement"], ["enhancement"]), { applied: ["enhancement"], others: ["bug", "docs"] });
});

test("both groups are in case-insensitive alphabetical order", () => {
  assert.deepEqual(labelGroups(["zeta", "Beta", "alpha", "Delta", "Gamma", "charlie"], ["Gamma", "charlie", "Beta"]), {
    applied: ["Beta", "charlie", "Gamma"],
    others: ["alpha", "Delta", "zeta"],
  });
});

test("an applied label the tracker didn't list is still in the applied group", () => {
  assert.deepEqual(labelGroups(["bug"], ["legacy", "bug"]), { applied: ["bug", "legacy"], others: [] });
});

test("an issue with no labels lists every label as not applied", () => {
  assert.deepEqual(labelGroups(["b", "A", "b"], []), { applied: [], others: ["A", "b"] });
});
