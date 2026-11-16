import assert from "node:assert/strict";
import { test } from "node:test";
import { callArg, texts } from "./support/gpui.js";
import { labelChips } from "../mod/detail.js";

const darkTheme = { foreground: "#e0e0e0", hover: "#ffffff14", border: "#333333", muted: "#999999" };
const lightTheme = { ...darkTheme, foreground: "#202020", hover: "#00000010" };

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

test("tints the group part in a light theme too, darkened toward the text", () => {
  const [chip] = labelChips(
    {
      labels: ["cloud-agent > one-shot"],
      labelColors: { "cloud-agent > one-shot": "#4ea7fc" },
      labelParts: { "cloud-agent > one-shot": { group: "cloud-agent", value: "one-shot" } },
    },
    lightTheme,
  );
  const [group] = parts(chip);
  assert.match(callArg(group, "bg"), /^#[0-9a-f]{8}$/);
  assert.doesNotMatch(callArg(group, "bg"), /^#4ea7fc/);
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
