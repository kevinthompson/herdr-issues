// Primary buttons, and buttons that turn primary on hover, fill with the theme's accent color so they suit light
// and dark themes alike.
import assert from "node:assert/strict";
import { test } from "node:test";
import { callArg, div } from "./support/gpui.js";
import { button } from "../mod/detail.js";
import { actionButton, textActionButton } from "../mod/action-button.js";

const ACCENT = "#3355ff";
const ACCENT_FOREGROUND = "#fefefe";
const theme = new Proxy(
  {},
  { get: (_, key) => ({ accent: ACCENT, accent_foreground: ACCENT_FOREGROUND })[key] ?? "#000000" },
);
const onClick = () => {};
const hoverStyleOf = (element) => callArg(element, "hover")(div());

test("a primary button fills with the theme's accent and its text uses accent_foreground", () => {
  const save = button("save", "Save", onClick, theme, { primary: true });
  assert.equal(callArg(save, "bg"), ACCENT);
  assert.equal(callArg(save, "text_color"), ACCENT_FOREGROUND);
});

test("a primaryOnHover button turns accent with accent_foreground text on hover", () => {
  const hovered = hoverStyleOf(button("open", "Open", onClick, theme, { primaryOnHover: true }));
  assert.equal(callArg(hovered, "bg"), ACCENT);
  assert.equal(callArg(hovered, "text_color"), ACCENT_FOREGROUND);
});

for (const [name, render] of [
  ["icon", () => actionButton({ id: "open", icon: "arrow-up-right", tooltip: "Open", onClick, primary: true }, theme)],
  ["text", () => textActionButton({ id: "save", label: "Save", onClick, primary: true }, theme)],
]) {
  test(`a primary ${name} action button fills with accent and accent_foreground`, () => {
    const element = render();
    assert.equal(callArg(element, "bg"), ACCENT);
    assert.equal(callArg(element, "text_color"), ACCENT_FOREGROUND);
  });
}
