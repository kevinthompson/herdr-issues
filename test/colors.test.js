import assert from "node:assert/strict";
import { test } from "node:test";
import { isLightTheme, statusTints, labelTint, rowHover, fieldBar, mixColors } from "../mod/colors.js";

// Colors from Herdr's graphite, paper and win98 presets.
const graphite = {
  background: "#17191d",
  surface: "#17191d",
  raised: "#2c2e31",
  chrome: "#101114",
  hover: "#ffffff0e",
  foreground: "#eeeeef",
};
const paper = {
  background: "#ffffff",
  surface: "#ffffff",
  raised: "#f6f6f6",
  chrome: "#f1f1ee",
  hover: "#0000000c",
  foreground: "#1b1b1e",
};
const win98 = {
  background: "#000000",
  surface: "#c0c0c0",
  raised: "#dfdfdf",
  chrome: "#f1f1ee",
  hover: "#dfdfdf",
  foreground: "#000000",
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

// The lightness (0 to 255) of a #rrggbb or #rrggbbaa color laid over the #rrggbb `backdrop`.
/** @param {string} color @param {string} backdrop */
function lightnessOver(color, backdrop) {
  const read = (/** @type {string} */ hex, /** @type {number} */ at) => parseInt(hex.slice(at, at + 2), 16);
  const opacity = color.length === 9 ? read(color, 7) / 255 : 1;
  const [red, green, blue] = [1, 3, 5].map(
    (at) => read(backdrop, at) + (read(color, at) - read(backdrop, at)) * opacity,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
// The light theme fills statusTints gave when it darkened each color toward the text and laid it on thicker.
const PREVIOUS_LIGHT_FILLS = {
  triage: "#a2533248",
  "in-progress": "#9c833a48",
  "in-review": "#38795a48",
  todo: "#92929448",
  blocked: "#983f4048",
  backlog: "#7d7f8448",
  done: "#434a8a48",
  canceled: "#646c7748",
};
// Laid over the panel, how far a fill is from the panel's own lightness, as a fraction of the way to its text.
/** @param {string} fill @param {Record<string, string>} t */
const stepFromSurface = (fill, t) =>
  (lightnessOver(t.surface, t.surface) - lightnessOver(fill, t.surface)) /
  (lightnessOver(t.surface, t.surface) - lightnessOver(t.foreground, t.surface));

test("statusTints gives each status a light tint in a light theme, lighter than its earlier darkened fill", () => {
  for (const [status, previousFill] of Object.entries(PREVIOUS_LIGHT_FILLS)) {
    const fill = /** @type {string} */ (statusTints(status, paper)?.fill);
    assert.ok(stepFromSurface(fill, paper) < stepFromSurface(previousFill, paper), `${status} is lighter than before`);
    assert.ok(stepFromSurface(fill, paper) <= 0.15, `${status} is within 15% of the way from the panel to its text`);
  }
});

test("statusTints keeps Todo's light theme header apart from the panel and its rows' hover", () => {
  for (const [name, theme] of Object.entries({ paper, win98 })) {
    const step = stepFromSurface(/** @type {string} */ (statusTints("todo", theme)?.fill), theme);
    assert.ok(Math.abs(step) >= 0.08, `${name}: at least 8% of the way between the panel and its text`);
    assert.ok(Math.abs(step - stepFromSurface(theme.hover, theme)) >= 0.04, `${name}: 4% apart from the rows' hover`);
  }
});

test("labelTint gives a grouped label's header the same light tint as a status in a light theme", () => {
  assert.equal(labelTint("#5e6ad2", paper), statusTints("done", paper)?.fill);
  assert.equal(labelTint("#5e6ad2", graphite), "#5e6ad230");
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
