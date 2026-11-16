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
  assert.deepEqual(
    filters.map(({ id, heading, shown }) => ({ id, heading, shown })),
    [
      { id: "issues-milestone", heading: "Milestone", shown: "All milestones" },
      { id: "issues-label", heading: "Label", shown: "All labels" },
    ],
  );
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
  assert.deepEqual(
    { shown: labels.shown, menu: labels.menu, options: labels.options, selected: labels.selected },
    { shown: "bug", menu: "label", options: ["bug"], selected: "bug" },
  );
});

const scopes = [{ id: "mine", label: "My issues" }, { id: "triage", label: "Triage" }, project];

test("a tracker without scopes shows no View filter", () => {
  assert.deepEqual(
    listFilters({ project }, ["bug"], null).map(({ heading }) => heading),
    ["Milestone", "Label"],
  );
});

test("a tracker with scopes shows View first, then Milestone and Label", () => {
  const filters = listFilters({ scopes, scope: scopes[1], project: null, milestone: null }, ["bug"], null);
  assert.deepEqual(
    filters.map(({ heading }) => heading),
    ["View", "Label"],
  );
  const [view] = filters;
  assert.deepEqual(view, {
    id: "issues-scope",
    heading: "View",
    shown: "Triage",
    menu: "scope",
    options: scopes,
    selected: "triage",
  });
  assert.deepEqual(
    listFilters({ scopes, scope: scopes[0], project, milestone: null }, ["bug"], null).map(({ heading }) => heading),
    ["View", "Milestone", "Label"],
  );
});

test("the View filter shows and selects a milestone's project", () => {
  const [view] = listFilters({ scopes, scope: scopes[0], project, milestone: project.milestones[0] }, [], null);
  assert.equal(view.shown, "Checkout");
  assert.equal(view.selected, "p1");
});
