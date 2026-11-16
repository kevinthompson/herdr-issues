import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { byId, callArg } from "./support/gpui.js";
import { issueDetail } from "../mod/detail.js";

const theme = new Proxy({}, { get: () => "#000" });
const issue = { id: "#7", title: "A", status: "todo", priority: 0, order: null, labels: [], blockedBy: [], body: "" };

function render(t, fields, trackerName) {
  stubHerdr(t);
  const opened = [];
  const view = {
    issue: { ...issue, ...fields },
    trackerName,
    onLink: (url) => opened.push(url),
    hasIssue: () => false,
    linkFiles: (text) => text,
    blocking: [],
  };
  return { tree: issueDetail(view, theme), opened };
}

test("an issue with a web address opens it in the browser from its ID", (t) => {
  const url = "https://github.com/o/r/issues/7";
  const { tree, opened } = render(t, { url }, "GitHub");
  const link = byId(tree, "issue-link-#7");

  assert.ok(link);
  assert.equal(callArg(link, "tooltip"), "Open in GitHub");
  assert.ok(link.calls.some(([name]) => name === "cursor_pointer"));
  callArg(link, "on_click")(null, null);
  assert.deepEqual(opened, [url]);
});

test("an issue without a web address shows its ID as plain text", (t) => {
  const { tree } = render(t, {}, "Beads");

  assert.equal(byId(tree, "issue-link-#7"), undefined);
});
