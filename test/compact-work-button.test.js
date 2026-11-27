import assert from "node:assert/strict";
import { test } from "node:test";
import { callArg, texts, walk } from "./support/gpui.js";
import { workButton } from "../mod/detail.js";
import { SPIN_MS } from "../mod/action-button-state.js";

const theme = {
  accent: "#3355ff",
  accent_foreground: "#ffffff",
  raised: "#222222",
  foreground: "#e0e0e0",
  dim: "#888888",
};
const idle = {
  finishable: false,
  startable: true,
  inSpace: false,
  inActiveSpace: false,
  opening: false,
  loading: false,
};
const handlers = { onStart: () => {}, onContinue: () => {} };

const compactButton = (state) =>
  workButton("row-1", { ...idle, ...handlers, ...state }, theme, { primary: false, compact: true });
const icons = (tree) => [...walk(tree)].filter((node) => node.tag === "svg");

for (const [name, state] of [
  ["Start", {}],
  ["Continue", { finishable: true }],
]) {
  test(`a compact ${name} button spins rotate-cw while loading instead of an ellipsis`, () => {
    const button = compactButton({ ...state, opening: true, loading: true });
    const [spinner] = icons(button);
    assert.equal(callArg(spinner, "path"), "mods/issues/icons/rotate-cw.svg");
    assert.equal(callArg(spinner, "spin"), SPIN_MS);
    assert.deepEqual(texts(button), []);
  });
}

test("a compact work button keeps one width whether idle, loading or switching to its space", () => {
  const widths = [
    compactButton({}),
    compactButton({ opening: true, loading: true }),
    compactButton({ finishable: true }),
    compactButton({ finishable: true, opening: true, loading: true }),
    compactButton({ inSpace: true }),
  ].map((button) => callArg(button, "w"));
  assert.equal(typeof widths[0], "number");
  assert.deepEqual(new Set(widths), new Set([widths[0]]));
});

test("a compact work button's loading tooltips are unchanged", () => {
  assert.equal(callArg(compactButton({ opening: true, loading: true }), "tooltip"), "Starting work…");
  assert.equal(
    callArg(compactButton({ finishable: true, opening: true, loading: true }), "tooltip"),
    "Opening this issue's worktree…",
  );
});

test("a compact work button is 20px tall and 24px wide with a 12px icon", () => {
  for (const button of [
    compactButton({}),
    compactButton({ opening: true, loading: true }),
    compactButton({ inSpace: true }),
  ]) {
    assert.equal(callArg(button, "h"), 20);
    assert.equal(callArg(button, "w"), 24);
    for (const svg of icons(button)) assert.equal(callArg(svg, "size"), 12);
  }
});

test("the detail view's work button keeps its 26px height", () => {
  const button = workButton("issue", { ...idle, ...handlers }, theme);
  assert.equal(callArg(button, "h"), 26);
});
