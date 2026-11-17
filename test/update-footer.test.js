import assert from "node:assert/strict";
import { test } from "node:test";
import { byId, callArg, texts, walk } from "./support/gpui.js";
import { updateFooter } from "../mod/update-footer.js";

const theme = { accent: "#3355ff", dim: "#888888", border: "#333333", hover: "#444444" };
const offer = (handlers = {}) =>
  updateFooter(theme, {
    updateAvailable: true,
    onUpdate: () => {},
    onDismissUpdate: () => {},
    onDismissUpdated: () => {},
    ...handlers,
  });

test("offers an update as one line with a link instead of an Update button", () => {
  const footer = offer();
  assert.deepEqual(texts(footer), ["New version available.", "Click here to update", "×"]);
  assert.equal(byId(footer, "issues-update").kids[0], "Click here to update");
});

test("starts the update when the link is pressed", () => {
  let started = 0;
  const link = byId(
    offer({
      onUpdate: () => {
        started += 1;
      },
    }),
    "issues-update",
  );
  callArg(link, "on_click")(null, {});
  assert.equal(started, 1);
});

test("styles the link like the panel's other links", () => {
  const link = byId(offer(), "issues-update");
  assert.equal(callArg(link, "text_color"), theme.accent);
  assert.ok(link.calls.some(([name]) => name === "cursor_pointer"));
  const hovered = { underlined: false, underline: () => ((hovered.underlined = true), hovered) };
  callArg(link, "hover")(hovered);
  assert.equal(hovered.underlined, true);
});

test("puts a notice icon in the footer's text color before the text", () => {
  const nodes = [...walk(offer())];
  const icon = nodes.find((node) => node.tag === "svg");
  assert.equal(callArg(icon, "path"), "mods/issues/icons/info.svg");
  assert.equal(callArg(icon, "size"), 11);
  assert.equal(callArg(icon, "text_color"), theme.dim);
  const firstText = nodes.findIndex((node) => node.kids.includes("New version available."));
  assert.ok(nodes.indexOf(icon) < firstText);
});

test("still dismisses the offer from its ×", () => {
  let dismissed = 0;
  const footer = offer({
    onDismissUpdate: () => {
      dismissed += 1;
    },
  });
  callArg(byId(footer, "issues-update-dismiss"), "on_click")(null, {});
  assert.equal(dismissed, 1);
});
