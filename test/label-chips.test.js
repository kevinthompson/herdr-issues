import assert from "node:assert/strict";
import { test } from "node:test";
import { callArg, texts } from "./support/gpui.js";
import { labelChips } from "../mod/detail.js";
import { labelTint } from "../mod/colors.js";

const darkTheme = { foreground: "#e0e0e0", hover: "#ffffff14", border: "#333333", muted: "#999999" };
const lightTheme = { ...darkTheme, surface: "#ffffff", foreground: "#202020", hover: "#00000010" };

const parts = (chip) => chip.kids.filter((kid) => typeof kid === "object");

test("draws a label in a group as one bordered chip, its group on a tint of the label's color", () => {
  const [chip] = labelChips(
    {
      labels: ["cloud-agent > one-shot"],
      labelColors: { "cloud-agent > one-shot": "#4ea7fc" },
      labelParts: { "cloud-agent > one-shot": { group: "cloud-agent", value: "one-shot" } },
    },
    darkTheme,
  );

  assert.equal(callArg(chip, "border_color"), darkTheme.border);
  assert.deepEqual(texts(chip), ["cloud-agent", "one-shot"]);
  const [group, value] = parts(chip);
  assert.match(callArg(group, "bg"), /^#4ea7fc[0-9a-f]{2}$/);
  assert.equal(callArg(value, "bg"), undefined);
});

test("tints the group part in a light theme too, as the label's color mixed into the panel's", () => {
  const [chip] = labelChips(
    {
      labels: ["cloud-agent > one-shot"],
      labelColors: { "cloud-agent > one-shot": "#4ea7fc" },
      labelParts: { "cloud-agent > one-shot": { group: "cloud-agent", value: "one-shot" } },
    },
    lightTheme,
  );
  const [group] = parts(chip);
  assert.equal(callArg(group, "bg"), labelTint("#4ea7fc", lightTheme));
  assert.match(callArg(group, "bg"), /^#[0-9a-f]{6}$/);
});

test("gives a grouped label without a color the theme's neutral shade", () => {
  const [chip] = labelChips(
    { labels: ["cloud-agent > plan"], labelParts: { "cloud-agent > plan": { group: "cloud-agent", value: "plan" } } },
    darkTheme,
  );
  assert.equal(callArg(parts(chip)[0], "bg"), darkTheme.hover);
});

test("draws a label outside a group, even one named with ' > ', as one part", () => {
  const [chip] = labelChips({ labels: ["area > web"], labelColors: { "area > web": "#eb5757" } }, darkTheme);
  assert.deepEqual(texts(chip), ["area > web"]);
});

test("draws an issue's project first, as a two-part chip tinted with the project's color", () => {
  const chips = labelChips(
    { labels: ["Bug"], project: { id: "project-1", name: "Calendar N+1", color: "#5e6ad2" } },
    darkTheme,
  );
  assert.deepEqual(chips.map(texts), [["Project", "Calendar N+1"], ["Bug"]]);
  assert.match(callArg(parts(chips[0])[0], "bg"), /^#5e6ad2[0-9a-f]{2}$/);
});

test("leaves out the project chip when asked, and draws none for an issue without a project", () => {
  const project = { id: "project-1", name: "Calendar N+1", color: "#5e6ad2" };
  assert.deepEqual(labelChips({ labels: ["Bug"], project }, darkTheme, { withProject: false }).map(texts), [["Bug"]]);
  assert.deepEqual(labelChips({ labels: ["Bug"], project: null }, darkTheme).map(texts), [["Bug"]]);
  assert.deepEqual(labelChips({ labels: ["Bug"] }, darkTheme).map(texts), [["Bug"]]);
});
