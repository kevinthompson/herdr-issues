import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { defaults, stubHerdr } from "./support/herdr.js";
import { clearKeychain, saveKeychainPassword } from "./support/keychain.js";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { settingsPath } from "../mod/trackers/setting.js";
import { main } from "../cli/main.js";

const startingFolder = process.cwd();
const BODY = "## Acceptance criteria\n\n- [ ] First\n- [x] Already done\n- [ ] Second\n  * [ ] Nested third";

beforeEach(() => forgetLookups());
afterEach(() => process.chdir(startingFolder));

function trackedRepository(t, setting) {
  const repository = createRepository(temporaryFolder(t), { name: "web-app" });
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify({ repos: { [repository]: setting } }));
  process.chdir(repository);
}

const ok = (value) => ({ code: 0, stdout: JSON.stringify(value), stderr: "" });

// Each tracker holds one issue whose body starts as BODY; saved() reads the bodies it was sent, and the panel
// announcements are counted.
const TRACKERS = {
  beads(t) {
    const record = {
      id: "notes-a1b",
      title: "Something",
      status: "open",
      priority: 2,
      created_at: "2026-01-01T00:00:00Z",
      dependencies: [],
      description: BODY,
    };
    const saved = [],
      counts = { announcements: 0 };
    stubHerdr(t, {
      setShared: () => {
        counts.announcements++;
        return null;
      },
      exec: async (command, args, options) => {
        if (command !== "bd") return defaults.exec(command, args, options);
        if (args[0] === "version") return { code: 0, stdout: "bd version 1.3.4\n", stderr: "" };
        if (args[0] === "show")
          return args[1] === record.id ? ok([record]) : { code: 1, stdout: "", stderr: "no issue found" };
        const description = args.find((arg) => arg.startsWith("--description="));
        if (args[0] === "update" && description)
          saved.push((record.description = description.slice("--description=".length)));
        return ok(null);
      },
    });
    trackedRepository(t, { tracker: "beads" });
    mkdirSync(".beads");
    writeFileSync(".beads/metadata.json", "{}");
    return { id: record.id, saved, counts };
  },

  github(t) {
    const repo = "owner/name";
    const node = {
      number: 7,
      title: "Something",
      url: `https://github.com/${repo}/issues/7`,
      body: BODY,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      closedAt: null,
      state: "OPEN",
      stateReason: null,
      milestone: null,
      labels: { nodes: [] },
      assignees: { nodes: [] },
      blockedBy: { nodes: [] },
      closedByPullRequestsReferences: { nodes: [] },
    };
    const saved = [],
      counts = { announcements: 0 };
    stubHerdr(t, {
      setShared: () => {
        counts.announcements++;
        return null;
      },
      exec: async (command, args, options) => {
        if (command !== "gh") return defaults.exec(command, args, options);
        if (args.includes("PATCH")) {
          saved.push((node.body = args.find((arg) => arg.startsWith("body=")).slice("body=".length)));
          return ok({});
        }
        return ok({ data: { repository: { issue: args.includes("number=7") ? node : null } } });
      },
    });
    trackedRepository(t, { tracker: "github", repo });
    return { id: "#7", saved, counts };
  },

  linear(t) {
    clearKeychain();
    saveKeychainPassword("herdr-issues", "linear", "lin_api_test");
    const node = {
      id: "uuid-1",
      identifier: "WEB-1",
      title: "Something",
      team: { id: "team-1" },
      state: { type: "started", name: "In Progress" },
      priority: 2,
      sortOrder: 1,
      branchName: "web-1-something",
      labels: { nodes: [] },
      inverseRelations: { nodes: [] },
      attachments: { nodes: [] },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      description: BODY,
    };
    const saved = [],
      counts = { announcements: 0 };
    t.mock.method(globalThis, "fetch", async (_url, options) => {
      const { query, variables } = JSON.parse(options.body);
      let data = {};
      if (query.startsWith("mutation")) {
        if (variables.input?.description !== undefined) saved.push((node.description = variables.input.description));
      } else if (query.includes("issue(id")) data = { issue: variables.id === "WEB-1" ? node : null };
      else data = { team: { name: "Web", projects: { nodes: [] } } };
      return { status: 200, ok: true, text: async () => JSON.stringify({ data }) };
    });
    stubHerdr(t, {
      setShared: () => {
        counts.announcements++;
        return null;
      },
    });
    trackedRepository(t, { tracker: "linear", team: "WEB" });
    return { id: "WEB-1", saved, counts };
  },
};

async function run(t, args) {
  const out = [],
    err = [];
  const consoleMocks = [
    t.mock.method(console, "log", (line) => out.push(line)),
    t.mock.method(console, "error", (line) => err.push(line)),
  ];
  const code = await main(args);
  for (const consoleMock of consoleMocks) consoleMock.mock.restore();
  return { code, out: out.join("\n"), err: err.join("\n") };
}

for (const [kind, issueIn] of Object.entries(TRACKERS)) {
  test(`check checks every unchecked item in a ${kind} issue and refreshes the panels`, async (t) => {
    const { id, saved, counts } = issueIn(t);
    const result = await run(t, ["check", id]);
    assert.equal(result.code, 0, result.err);
    assert.equal(result.out, `Checked in ${id}:\n  - First\n  - Second\n  - Nested third`);
    assert.deepEqual(saved, [
      "## Acceptance criteria\n\n- [x] First\n- [x] Already done\n- [x] Second\n  * [x] Nested third",
    ]);
    assert.equal(counts.announcements, 1);
  });

  test(`check --except leaves the numbered unchecked items of a ${kind} issue unchecked`, async (t) => {
    const { id, saved } = issueIn(t);
    const result = await run(t, ["check", id, "--except", "2", "--except", "3"]);
    assert.equal(result.code, 0, result.err);
    assert.equal(result.out, `Checked in ${id}:\n  - First\nLeft unchecked:\n  - Second\n  - Nested third`);
    assert.deepEqual(saved, [
      "## Acceptance criteria\n\n- [x] First\n- [x] Already done\n- [ ] Second\n  * [ ] Nested third",
    ]);
  });

  test(`check leaves a ${kind} issue with nothing to check unchanged, saying so`, async (t) => {
    const { id, saved, counts } = issueIn(t);
    await run(t, ["check", id]);
    const result = await run(t, ["check", id]);
    assert.equal(result.code, 0, result.err);
    assert.equal(result.out, `${id} has no unchecked items to check; its body is unchanged`);
    assert.equal(saved.length, 1);
    assert.equal(counts.announcements, 1);
  });

  test(`check exits 2 for a ${kind} issue without the item --except names, changing nothing`, async (t) => {
    const { id, saved, counts } = issueIn(t);
    const result = await run(t, ["check", id, "--except", "4"]);
    assert.equal(result.code, 2);
    assert.equal(result.err, `issues: check: ${id} has 3 unchecked items, so none is number 4`);
    assert.deepEqual(saved, []);
    assert.equal(counts.announcements, 0);
  });
}

test("check exits 1 for an unknown issue, changing nothing", async (t) => {
  const { saved, counts } = TRACKERS.beads(t);
  const result = await run(t, ["check", "notes-zzz"]);
  assert.equal(result.code, 1);
  assert.match(result.err, /notes-zzz: not found/);
  assert.deepEqual(saved, []);
  assert.equal(counts.announcements, 0);
});

for (const args of [
  [],
  ["notes-a1b", "--except"],
  ["notes-a1b", "--except", "0"],
  ["notes-a1b", "--except", "first"],
  ["notes-a1b", "--all"],
]) {
  test(`check exits 2 for ${JSON.stringify(args)}`, async (t) => {
    const { saved } = TRACKERS.beads(t);
    const result = await run(t, ["check", ...args]);
    assert.equal(result.code, 2);
    assert.deepEqual(saved, []);
  });
}

test("--help lists check", async (t) => {
  const result = await run(t, ["--help"]);
  assert.match(result.out, /^ {2}check <id> \[--except <n>\]\.\.\.$/m);
});
