import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { openInEditor, prefetchEditor } from "../mod/editor.js";

const FIELD = "\x1e";
const settle = () => new Promise((resolve) => setImmediate(resolve));

// Answers the login shell's lookup with `editor.value`, a GUI editor, and records each lookup and each file
// the editor was started on, with the editor it was started with.
function stubEditor(t, editor) {
  const calls = { lookups: 0, started: [] };
  stubHerdr(t, {
    exec: async (_command, args) => {
      const [, , , value, , file] = args;
      if (args.length === 4) {
        calls.lookups += 1;
        const described = [
          editor.value,
          editor.value,
          `/Applications/${editor.value}.app/Contents/bin/${editor.value}`,
          "/usr/bin",
        ];
        return { code: 0, stdout: `${FIELD}${described.join(FIELD)}${FIELD}`, stderr: "" };
      }
      calls.started.push({ editor: value, file });
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  return calls;
}

test("opens files with the editor looked up ahead of time, refreshing it in the background once stale", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const editor = { value: "zed" };
  const calls = stubEditor(t, editor);

  prefetchEditor();
  await openInEditor("/repo/a.md", "/repo");
  await openInEditor("/repo/b.md", "/repo");
  assert.equal(calls.lookups, 1);

  editor.value = "code";
  t.mock.timers.tick(61_000);
  await openInEditor("/repo/c.md", "/repo");
  await settle();
  await openInEditor("/repo/d.md", "/repo");

  assert.equal(calls.lookups, 2);
  assert.deepEqual(calls.started, [
    { editor: "zed", file: "/repo/a.md" },
    { editor: "zed", file: "/repo/b.md" },
    { editor: "zed", file: "/repo/c.md" },
    { editor: "code", file: "/repo/d.md" },
  ]);
});
