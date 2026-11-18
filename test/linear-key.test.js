import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { beforeEach, describe, test } from "node:test";
import { linearClient, linearKeyPath, saveLinearKey } from "../mod/trackers/linear.js";
import { forgetLookups } from "../mod/lookups.js";
import { defaults, stubHerdr } from "./support/herdr.js";
import { clearKeychain, keychainPassword, saveKeychainPassword } from "./support/keychain.js";

// Answers Linear's API as it answers a key it accepts, or with 401 for one it refuses.
function stubLinear(t, { accepts }) {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, authorization: options.headers.Authorization });
    const body = accepts ? { data: { viewer: { id: "me" } } } : { errors: [{ message: "Authentication required" }] };
    return { status: accepts ? 200 : 401, ok: accepts, text: async () => JSON.stringify(body) };
  });
  return requests;
}

// Runs `security` as `answer` says, or as on a system without it when there's no answer.
function stubSecurity(t, answer = null) {
  stubHerdr(t, {
    exec: async (command, ...rest) => {
      if (command !== "security") return defaults.exec(command, ...rest);
      if (answer) return answer;
      throw Object.assign(new Error("spawn security ENOENT"), { code: "ENOENT" });
    },
  });
}

function writeKeyFile(text) {
  mkdirSync(dirname(linearKeyPath()), { recursive: true });
  writeFileSync(linearKeyPath(), text);
}

const keyFile = () => JSON.parse(readFileSync(linearKeyPath(), "utf8"));
const keyFileMode = () => (statSync(linearKeyPath()).mode & 0o777).toString(8);
const keychainKey = () => keychainPassword("herdr-issues", "linear");
const saveKeychainKey = (apiKey) => saveKeychainPassword("herdr-issues", "linear", apiKey);

beforeEach(() => {
  rmSync(linearKeyPath(), { force: true });
  clearKeychain();
  forgetLookups();
});

describe("saveLinearKey", () => {
  test("asks Linear with the key before saving it", async (t) => {
    const requests = stubLinear(t, { accepts: true });
    await saveLinearKey("lin_api_new");
    assert.deepEqual(
      requests.map(({ authorization }) => authorization),
      ["lin_api_new"],
    );
  });

  test("writes a key Linear accepts to the key file, readable only by the person, and not the Keychain", async (t) => {
    stubLinear(t, { accepts: true });
    await saveLinearKey("lin_api_new");
    assert.deepEqual(keyFile(), { apiKey: "lin_api_new" });
    assert.equal(keyFileMode(), "600");
    assert.equal(keychainKey(), null);
  });

  test("keeps the key file's other fields and replaces its key", async (t) => {
    stubLinear(t, { accepts: true });
    writeKeyFile(JSON.stringify({ apiKey: "lin_api_old", note: "kept" }));
    await saveLinearKey("lin_api_new");
    assert.deepEqual(keyFile(), { apiKey: "lin_api_new", note: "kept" });
    assert.equal(keyFileMode(), "600");
  });

  test("replaces a key file that isn't valid JSON", async (t) => {
    stubLinear(t, { accepts: true });
    writeKeyFile("{ not json");
    await saveLinearKey("lin_api_new");
    assert.deepEqual(keyFile(), { apiKey: "lin_api_new" });
  });

  test("saves nothing for a key Linear refuses", async (t) => {
    stubLinear(t, { accepts: false });
    await assert.rejects(saveLinearKey("lin_api_wrong"), /refused this API key/);
    assert.equal(existsSync(linearKeyPath()), false);
  });

  test("leaves the saved key alone when Linear refuses a new one", async (t) => {
    stubLinear(t, { accepts: false });
    writeKeyFile(JSON.stringify({ apiKey: "lin_api_old" }));
    await assert.rejects(saveLinearKey("lin_api_wrong"));
    assert.deepEqual(keyFile(), { apiKey: "lin_api_old" });
  });

  test("makes the saved key the one Linear's client uses at once", async (t) => {
    const requests = stubLinear(t, { accepts: true });
    writeKeyFile(JSON.stringify({ apiKey: "lin_api_old" }));
    await linearClient();
    await saveLinearKey("lin_api_new");
    const linear = await linearClient();
    await linear("query { viewer { id } }");
    assert.equal(requests.at(-1).authorization, "lin_api_new");
  });

  test("saves the key without `security` installed", async (t) => {
    stubLinear(t, { accepts: true });
    stubSecurity(t);
    await saveLinearKey("lin_api_new");
    assert.deepEqual(keyFile(), { apiKey: "lin_api_new" });
  });
});

describe("linearClient", () => {
  const authorizationSent = async (t) => {
    const requests = stubLinear(t, { accepts: true });
    const linear = await linearClient();
    await linear("query { viewer { id } }");
    return requests.at(-1).authorization;
  };

  test("asks Linear with the key in the key file and leaves the file alone", async (t) => {
    writeKeyFile(JSON.stringify({ apiKey: "lin_api_file", note: "kept" }));
    assert.equal(await authorizationSent(t), "lin_api_file");
    assert.deepEqual(keyFile(), { apiKey: "lin_api_file", note: "kept" });
  });

  test("prefers the key file's key to one left in the Keychain", async (t) => {
    writeKeyFile(JSON.stringify({ apiKey: "lin_api_file" }));
    saveKeychainKey("lin_api_keychain");
    assert.equal(await authorizationSent(t), "lin_api_file");
    assert.deepEqual(keyFile(), { apiKey: "lin_api_file" });
  });

  test("reads the key file without `security` installed", async (t) => {
    stubSecurity(t);
    writeKeyFile(JSON.stringify({ apiKey: "lin_api_file" }));
    assert.equal(await authorizationSent(t), "lin_api_file");
  });

  describe("with a key an earlier version saved in the Keychain", () => {
    test("moves it to the key file, readable only by the person, and deletes the Keychain item", async (t) => {
      saveKeychainKey("lin_api_keychain");
      assert.equal(await authorizationSent(t), "lin_api_keychain");
      assert.deepEqual(keyFile(), { apiKey: "lin_api_keychain" });
      assert.equal(keyFileMode(), "600");
      assert.equal(keychainKey(), null);
    });

    test("keeps the key file's other fields", async (t) => {
      writeKeyFile(JSON.stringify({ note: "kept" }));
      saveKeychainKey("lin_api_keychain");
      assert.equal(await authorizationSent(t), "lin_api_keychain");
      assert.deepEqual(keyFile(), { note: "kept", apiKey: "lin_api_keychain" });
    });

    test("leaves a key file that isn't valid JSON and the Keychain item alone", async () => {
      writeKeyFile("{ not json");
      saveKeychainKey("lin_api_keychain");
      await assert.rejects(linearClient(), { message: /isn't valid JSON/ });
      assert.equal(readFileSync(linearKeyPath(), "utf8"), "{ not json");
      assert.equal(keychainKey(), "lin_api_keychain");
    });
  });

  test("reports a missing key in the key file", async () => {
    await assert.rejects(linearClient(), {
      message: "No Linear API key in ~/.config/herdr-app/linear.json",
      fix: /"apiKey"/,
    });
  });

  test("reports a missing key when the Keychain can't be read", async (t) => {
    stubSecurity(t, { code: 51, stdout: "", stderr: "User interaction is not allowed." });
    await assert.rejects(linearClient(), { message: "No Linear API key in ~/.config/herdr-app/linear.json" });
  });

  test("reports a key file that isn't valid JSON", async () => {
    writeKeyFile("{ not json");
    await assert.rejects(linearClient(), {
      message: "Couldn't read the Linear API key from ~/.config/herdr-app/linear.json (it isn't valid JSON)",
    });
  });

  test("reports a key Linear refuses as the one in the key file, never naming the Keychain", async (t) => {
    writeKeyFile(JSON.stringify({ apiKey: "lin_api_wrong" }));
    stubLinear(t, { accepts: false });
    const linear = await linearClient();
    const refused = await linear("query { viewer { id } }").catch((e) => e);
    assert.equal(refused.message, "Linear refused the API key in ~/.config/herdr-app/linear.json");
    assert.doesNotMatch(refused.fix, /Keychain|security add/);
  });
});
