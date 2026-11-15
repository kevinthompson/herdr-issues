import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { packageManagers } from "../mod/package-managers.js";
import { bdMissing, ghMissing } from "../mod/trackers/problems.js";

const DEVBOX_GLOBALS = "* git@latest - 2.55.0\n";

// A computer with devbox's global profile listing `devboxGlobals` (null: devbox isn't installed), and Homebrew
// when `brew` is true.
function computerWith(t, { devboxGlobals = null, brew = false } = {}) {
  const missing = () => { throw Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }); };
  stubHerdr(t, {
    exec: async (command, args) => {
      if (command === "devbox" && devboxGlobals !== null && args.join(" ") === "global list") {
        return { code: 0, stdout: devboxGlobals, stderr: "" };
      }
      if (command === "brew" && brew && args[0] === "--version") return { code: 0, stdout: "Homebrew 5.0.0\n", stderr: "" };
      return missing();
    },
  });
}

describe("packageManagers", () => {
  test("is devbox when its global profile lists packages", async (t) => {
    computerWith(t, { devboxGlobals: DEVBOX_GLOBALS });
    assert.deepEqual(await packageManagers(), ["devbox"]);
  });

  test("leaves out devbox when its global profile is empty", async (t) => {
    computerWith(t, { devboxGlobals: "No packages installed in global profile\n" });
    assert.deepEqual(await packageManagers(), []);
  });

  test("is brew when Homebrew is installed", async (t) => {
    computerWith(t, { brew: true });
    assert.deepEqual(await packageManagers(), ["brew"]);
  });

  test("is both when both apply", async (t) => {
    computerWith(t, { devboxGlobals: DEVBOX_GLOBALS, brew: true });
    assert.deepEqual(await packageManagers(), ["devbox", "brew"]);
  });

  test("is none when neither is installed", async (t) => {
    computerWith(t);
    assert.deepEqual(await packageManagers(), []);
  });
});

describe("the fix for a missing tool", () => {
  test("names devbox global add with devbox", async (t) => {
    computerWith(t, { devboxGlobals: DEVBOX_GLOBALS });
    assert.equal((await ghMissing()).fix, "Install it with `devbox global add gh`, then check again.");
    assert.equal((await bdMissing()).fix, "Install it with `devbox global add beads`, then check again.");
  });

  test("names brew install with Homebrew", async (t) => {
    computerWith(t, { brew: true });
    assert.equal((await ghMissing()).fix, "Install it with `brew install gh`, then check again.");
    assert.equal((await bdMissing()).fix, "Install it with `brew install beads`, then check again.");
  });

  test("names both commands when both apply", async (t) => {
    computerWith(t, { devboxGlobals: DEVBOX_GLOBALS, brew: true });
    assert.equal((await ghMissing()).fix, "Install it with `devbox global add gh` or `brew install gh`, then check again.");
    assert.equal((await bdMissing()).fix, "Install it with `devbox global add beads` or `brew install beads`, then check again.");
  });

  test("links to the install instructions without a package manager", async (t) => {
    computerWith(t);
    assert.equal((await ghMissing()).fix, "Install it from [cli.github.com](https://cli.github.com), then check again.");
    assert.equal((await bdMissing()).fix, "Install it as [Beads' README](https://github.com/steveyegge/beads) says, then check again.");
  });
});
