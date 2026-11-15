import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { beforeEach, describe, test } from "node:test";
import { linearClient, linearKeyPath, saveLinearKey } from "../mod/trackers/linear.js";
import { forgetLookups } from "../mod/lookups.js";

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

function writeKeyFile(text) {
  mkdirSync(dirname(linearKeyPath()), { recursive: true });
  writeFileSync(linearKeyPath(), text);
}

const keyFile = () => JSON.parse(readFileSync(linearKeyPath(), "utf8"));
const keyFileMode = () => (statSync(linearKeyPath()).mode & 0o777).toString(8);

beforeEach(() => {
  rmSync(linearKeyPath(), { force: true });
  forgetLookups();
});

describe("saveLinearKey", () => {
  test("asks Linear with the key before saving it", async (t) => {
    const requests = stubLinear(t, { accepts: true });
    await saveLinearKey("lin_api_new");
    assert.deepEqual(requests.map(({ authorization }) => authorization), ["lin_api_new"]);
  });

  test("writes a key Linear accepts, readable only by the person", async (t) => {
    stubLinear(t, { accepts: true });
    await saveLinearKey("lin_api_new");
    assert.deepEqual(keyFile(), { apiKey: "lin_api_new" });
    assert.equal(keyFileMode(), "600");
  });

  test("keeps the file's other fields and replaces its key", async (t) => {
    stubLinear(t, { accepts: true });
    writeKeyFile(JSON.stringify({ apiKey: "lin_api_old", note: "kept" }));
    await saveLinearKey("lin_api_new");
    assert.deepEqual(keyFile(), { apiKey: "lin_api_new", note: "kept" });
    assert.equal(keyFileMode(), "600");
  });

  test("replaces a file that isn't valid JSON", async (t) => {
    stubLinear(t, { accepts: true });
    writeKeyFile("{ not json");
    await saveLinearKey("lin_api_new");
    assert.deepEqual(keyFile(), { apiKey: "lin_api_new" });
  });

  test("writes nothing for a key Linear refuses", async (t) => {
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
});
