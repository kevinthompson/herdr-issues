import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { beforeEach, describe, test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { clearKeychain, keychainPassword, saveKeychainPassword } from "./support/keychain.js";
import { forgetLookups } from "../mod/lookups.js";
import { linearKeyPath } from "../mod/trackers/linear.js";
import { main } from "../cli/main.js";

const API_KEY = "lin_api_secret";

function writeLinearKey(text) {
  mkdirSync(dirname(linearKeyPath()), { recursive: true });
  writeFileSync(linearKeyPath(), text);
}

// Runs `issues auth …`, resolving with its exit code and everything it printed.
async function auth(t, ...args) {
  const printed = [];
  const capture = (...parts) => {
    printed.push(parts.join(" "));
  };
  t.mock.method(console, "log", capture);
  t.mock.method(console, "error", capture);
  const code = await main(["auth", ...args]);
  return { code, output: printed.join("\n") };
}

// A `gh` whose `--version` and `auth status` exit with these codes, or that isn't installed when `installed` is false,
// on a computer with Homebrew and no devbox.
function stubGh(t, { installed = true, loggedIn = true } = {}) {
  stubHerdr(t, {
    exec: async (command, args) => {
      if (command === "brew")
        return { code: 0, stdout: "Homebrew 4.4.0", stderr: "" };
      if (command === "devbox")
        throw Object.assign(new Error("spawn devbox ENOENT"), {
          code: "ENOENT",
        });
      assert.equal(command, "gh");
      if (!installed)
        throw Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" });
      const code = args[0] === "auth" && !loggedIn ? 1 : 0;
      return { code, stdout: "", stderr: "" };
    },
  });
}

const keychainKey = () => keychainPassword("herdr-issues", "linear");

beforeEach(() => {
  rmSync(linearKeyPath(), { force: true });
  clearKeychain();
  forgetLookups();
});

describe("issues auth linear", () => {
  test("passes silently when the Keychain holds an API key", async (t) => {
    saveKeychainPassword("herdr-issues", "linear", API_KEY);
    const { code, output } = await auth(t, "linear");
    assert.equal(code, 0);
    assert.ok(!output.includes(API_KEY));
  });

  test("moves a key in linear.json to the Keychain and passes silently", async (t) => {
    writeLinearKey(JSON.stringify({ apiKey: API_KEY }));
    const { code, output } = await auth(t, "linear");
    assert.equal(code, 0);
    assert.ok(!output.includes(API_KEY));
    assert.equal(keychainKey(), API_KEY);
    assert.equal(existsSync(linearKeyPath()), false);
  });

  for (const [situation, text] of [
    ["linear.json is missing", null],
    ["linear.json has no apiKey", "{}"],
    ["the apiKey is empty", JSON.stringify({ apiKey: "" })],
    ["linear.json isn't valid JSON", `{ "apiKey": "${API_KEY}"`],
  ]) {
    test(`reports the missing key in the Keychain and its fix when ${situation}`, async (t) => {
      if (text !== null) writeLinearKey(text);
      const { code, output } = await auth(t, "linear");
      assert.equal(code, 1);
      assert.match(output, /No Linear API key in the macOS Keychain/);
      assert.match(output, /Settings → Account → Security & access/);
      assert.match(output, /security add-generic-password -U -s herdr-issues -a linear -w/);
      assert.ok(!output.includes(API_KEY));
    });
  }
});

describe("issues auth github", () => {
  test("passes when gh is logged in", async (t) => {
    stubGh(t);
    assert.equal((await auth(t, "github")).code, 0);
  });

  test("reports gh missing and how to install it", async (t) => {
    stubGh(t, { installed: false });
    const { code, output } = await auth(t, "github");
    assert.equal(code, 1);
    assert.match(output, /isn't installed/);
    assert.match(output, /brew install gh/);
  });

  test("reports gh logged out and how to log in", async (t) => {
    stubGh(t, { loggedIn: false });
    const { code, output } = await auth(t, "github");
    assert.equal(code, 1);
    assert.match(output, /isn't logged in/);
    assert.match(output, /gh auth login/);
  });
});

describe("issues auth usage", () => {
  for (const args of [[], ["jira"], ["github", "extra"]]) {
    test(`exits with the usage status for ${JSON.stringify(args)}`, async (t) => {
      assert.equal((await auth(t, ...args)).code, 2);
    });
  }

  test("is listed in --help", async (t) => {
    const printed = [];
    t.mock.method(console, "log", (text) => printed.push(text));
    await main(["--help"]);
    assert.match(printed.join("\n"), /auth <tracker>/);
  });
});
