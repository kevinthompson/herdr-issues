import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { spaceShowing } from "../worktree.js";

const space = { id: "s1", machine: null, folder: "/elsewhere", tabs: [{ id: "t1" }] };

test("a test can replace the spaces, panes and exec the mod's modules see", async (t) => {
  stubHerdr(t, {
    spaces: () => [space],
    panes: () => [{ tab: "t1", cwd: "/work/repo/src" }],
    exec: async () => ({ code: 0, stdout: "stubbed", stderr: "" }),
  });
  assert.equal(spaceShowing("/work/repo", null), space);
  const { exec } = await import("herdr");
  assert.deepEqual(await exec("anything"), { code: 0, stdout: "stubbed", stderr: "" });
});

test("other tests see the shim's defaults", async () => {
  assert.equal(spaceShowing("/work/repo", null), null);
  const { exec } = await import("herdr");
  const result = await exec("git", ["--version"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^git version/);
});
