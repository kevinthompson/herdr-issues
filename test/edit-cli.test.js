import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, test } from "node:test";
import { defaults, stubHerdr } from "./support/herdr.js";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { settingsPath } from "../mod/trackers/setting.js";
import { editIssueBody } from "../cli/change.js";
import { main } from "../cli/main.js";

const startingFolder = process.cwd();

beforeEach(() => forgetLookups());
afterEach(() => process.chdir(startingFolder));

// A repository tracked in Beads holding one issue, whose stubbed `bd` saves each new description into it so a
// later `show` reads it; the panel announcements are counted.
function beadsRepository(t) {
  const repository = createRepository(temporaryFolder(t));
  mkdirSync(join(repository, ".beads"));
  writeFileSync(join(repository, ".beads/metadata.json"), "{}");
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify({ repos: { [repository]: { tracker: "beads" } } }));
  const record = {
    id: "notes-a1b", title: "Something", status: "open", priority: 2, created_at: "2026-01-01T00:00:00Z",
    dependencies: [], description: "- [ ] A criterion",
  };
  const updates = [];
  const counts = { announcements: 0 };
  const ok = (value) => ({ code: 0, stdout: JSON.stringify(value), stderr: "" });
  stubHerdr(t, {
    setShared: () => { counts.announcements++; return null; },
    exec: async (command, args, options) => {
      if (command !== "bd") return defaults.exec(command, args, options);
      if (args[0] === "version") return { code: 0, stdout: "bd version 1.3.4\n", stderr: "" };
      if (args[0] === "show") return args[1] === record.id ? ok([record]) : { code: 1, stdout: "", stderr: "no issue found" };
      if (args[0] === "update") {
        updates.push(args.slice(1, -1));
        const description = args.find((arg) => arg.startsWith("--description="));
        if (description) record.description = description.slice("--description=".length);
      }
      return ok(null);
    },
  });
  process.chdir(repository);
  return { record, updates, counts, bodyFile: (text) => {
    const path = join(temporaryFolder(t), "body.md");
    writeFileSync(path, text);
    return path;
  } };
}

async function run(t, args) {
  const out = [], err = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", (line) => err.push(line));
  const code = await main(args);
  t.mock.restoreAll();
  return { code, out: out.join("\n"), err: err.join("\n") };
}

async function readBodyHash(t, id) {
  const result = await run(t, ["show", id, "--json"]);
  assert.equal(result.code, 0, result.err);
  return JSON.parse(result.out).bodyHash;
}

test("edit saves the body read with show and refreshes the panels", async (t) => {
  const { record, updates, counts, bodyFile } = beadsRepository(t);
  const hash = await readBodyHash(t, record.id);
  const result = await run(t, ["edit", record.id, "--body-file", bodyFile("- [x] A criterion\n"), "--body-hash", hash]);
  assert.equal(result.code, 0, result.err);
  assert.equal(result.out, `Saved the body of ${record.id}`);
  assert.deepEqual(updates, [[record.id, "--description=- [x] A criterion\n"]]);
  assert.equal(counts.announcements, 1);
});

function pipeToStandardInput(t, text) {
  const standardInput = Object.getOwnPropertyDescriptor(process, "stdin");
  Object.defineProperty(process, "stdin", { value: Readable.from([text]), configurable: true });
  t.after(() => Object.defineProperty(process, "stdin", standardInput));
}

test("edit reads the body from standard input when the body file is -", async (t) => {
  const { record, updates } = beadsRepository(t);
  const hash = await readBodyHash(t, record.id);
  pipeToStandardInput(t, "- [x] A criterion\n");
  const result = await run(t, ["edit", record.id, "--body-file", "-", "--body-hash", hash]);
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(updates, [[record.id, "--description=- [x] A criterion\n"]]);
});

test("edit exits 1 for empty standard input, changing nothing", async (t) => {
  const { record, updates } = beadsRepository(t);
  const hash = await readBodyHash(t, record.id);
  pipeToStandardInput(t, " \n");
  const result = await run(t, ["edit", record.id, "--body-file", "-", "--body-hash", hash]);
  assert.equal(result.code, 1);
  assert.match(result.err, /standard input: is empty/);
  assert.deepEqual(updates, []);
});

test("edit refuses, changing nothing, when the body changed after show read it", async (t) => {
  const { record, updates, counts, bodyFile } = beadsRepository(t);
  const hash = await readBodyHash(t, record.id);
  record.description = "- [ ] A criterion\n- [ ] One added meanwhile";
  const result = await run(t, ["edit", record.id, "--body-file", bodyFile("- [x] A criterion\n"), "--body-hash", hash]);
  assert.equal(result.code, 1);
  assert.match(result.err, /notes-a1b: the body changed since it was read/);
  assert.deepEqual(updates, []);
  assert.equal(counts.announcements, 0);
});

test("edit exits 2 without the body hash from show, rather than reading the body itself", async (t) => {
  const { record, updates, bodyFile } = beadsRepository(t);
  const result = await run(t, ["edit", record.id, "--body-file", bodyFile("- [x] A criterion\n")]);
  assert.equal(result.code, 2);
  assert.match(result.err, /edit needs --body-hash <hash>, the bodyHash issues show --json printed/);
  assert.deepEqual(updates, []);
});

test("edit exits 1 for an unknown issue, changing nothing", async (t) => {
  const { updates, counts, bodyFile } = beadsRepository(t);
  const result = await run(t, ["edit", "notes-zzz", "--body-file", bodyFile("A body"), "--body-hash", "abc"]);
  assert.equal(result.code, 1);
  assert.match(result.err, /notes-zzz: not found/);
  assert.deepEqual(updates, []);
  assert.equal(counts.announcements, 0);
});

for (const [name, bodyFileFor] of [
  ["a missing body file", (bodyFile) => `${bodyFile("A body")}.missing`],
  ["an empty body file", (bodyFile) => bodyFile(" \n")],
]) {
  test(`edit exits 1 for ${name}, changing nothing`, async (t) => {
    const { record, updates, bodyFile } = beadsRepository(t);
    const hash = await readBodyHash(t, record.id);
    const result = await run(t, ["edit", record.id, "--body-file", bodyFileFor(bodyFile), "--body-hash", hash]);
    assert.equal(result.code, 1);
    assert.deepEqual(updates, []);
  });
}

test("editing a body refuses a tracker that can't save", async () => {
  const tracker = { name: "Read-only", writable: false, get: async () => assert.fail("read the issue") };
  await assert.rejects(editIssueBody(tracker, "1", { body: "A body", readBodyHash: "abc" }), /Read-only issues can't be changed here/);
});

test("--help lists edit", async (t) => {
  const result = await run(t, ["--help"]);
  assert.match(result.out, /^ {2}edit <id> --body-file <file> --body-hash <hash>$/m);
  assert.match(result.out, /standard input when <file> is -/);
});
