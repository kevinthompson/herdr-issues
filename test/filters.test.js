import assert from "node:assert/strict";
import { test } from "node:test";
import { listFilters } from "../mod/filters.js";

const project = { id: "p1", label: "Checkout", milestones: [{ id: "m1", label: "Milestone 1" }] };

test("a scope without milestones and issues without labels show no filters", () => {
  assert.deepEqual(listFilters({}, [], null), []);
  assert.deepEqual(listFilters({ project: { ...project, milestones: [] } }, [], null), []);
});

test("a project's milestones and the listed labels are each their own filter", () => {
  const filters = listFilters({ project, milestone: null }, ["bug", "docs"], null);
  assert.deepEqual(filters.map(({ id, heading, shown }) => ({ id, heading, shown })), [
    { id: "issues-milestone", heading: "Milestone", shown: "All milestones" },
    { id: "issues-label", heading: "Label", shown: "All labels" },
  ]);
});

test("the milestone filter offers every milestone after All milestones and selects the project without one", () => {
  const [milestones] = listFilters({ project }, [], null);
  assert.equal(milestones.menu, "scope");
  assert.deepEqual(milestones.options, [{ id: "p1", label: "All milestones" }, ...project.milestones]);
  assert.equal(milestones.selected, "p1");
});

test("a picked milestone and label are shown and selected", () => {
  const [milestones, labels] = listFilters({ project, milestone: project.milestones[0] }, ["bug"], "bug");
  assert.equal(milestones.shown, "Milestone 1");
  assert.equal(milestones.selected, "m1");
  assert.deepEqual({ shown: labels.shown, menu: labels.menu, options: labels.options, selected: labels.selected },
    { shown: "bug", menu: "label", options: ["bug"], selected: "bug" });
});
