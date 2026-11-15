import assert from "node:assert/strict";
import { test } from "node:test";
import { isLightTheme, statusTints, rowHover, fieldBar, mixColors } from "../mod/colors.js";

// Colors from Herdr's graphite, paper and win98 presets.
const graphite = {
  background: "#17191d", surface: "#17191d", raised: "#2c2e31", chrome: "#101114", hover: "#ffffff0e", foreground: "#eeeeef",
};
const paper = {
  background: "#ffffff", surface: "#ffffff", raised: "#f6f6f6", chrome: "#f1f1ee", hover: "#0000000c", foreground: "#1b1b1e",
};
const win98 = {
  background: "#000000", surface: "#c0c0c0", raised: "#dfdfdf", chrome: "#f1f1ee", hover: "#dfdfdf", foreground: "#000000",
};

test("isLightTheme tells a light theme by its dark text", () => {
  assert.equal(isLightTheme(graphite), false);
  assert.equal(isLightTheme(paper), true);
  assert.equal(isLightTheme(win98), true);
});

test("isLightTheme takes a theme whose text color it can't read as dark", () => {
  assert.equal(isLightTheme({ foreground: "white" }), false);
  assert.equal(isLightTheme({}), false);
});

test("statusTints lays a status color on thinly in a dark theme", () => {
  assert.deepEqual(statusTints("todo", graphite), { fill: "#e2e2e230", hover: "#e2e2e248", border: "#e2e2e260" });
});

test("statusTints darkens a status color toward the text and lays it on thicker in a light theme", () => {
  assert.deepEqual(statusTints("todo", paper), { fill: "#92929448", hover: "#9292946c", border: "#92929490" });
});

test("statusTints is null for a group without a status color", () => {
  assert.equal(statusTints("unknown", paper), null);
});

test("rowHover halves a dark theme's hover", () => {
  assert.equal(rowHover(graphite), "#ffffff07");
  assert.equal(rowHover({ ...graphite, hover: "#2c2e31" }), mixColors(graphite.surface, "#2c2e31", 0.5));
});

test("rowHover keeps a light theme's hover whole", () => {
  assert.equal(rowHover(paper), paper.hover);
  assert.equal(rowHover(win98), win98.hover);
});

test("fieldBar is a shade lighter than a dark panel, and the theme's bar color in a light one", () => {
  assert.equal(fieldBar(graphite), mixColors(graphite.background, graphite.raised, 0.35));
  assert.equal(fieldBar(paper), paper.chrome);
});

