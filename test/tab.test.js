import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { defaults, stubHerdr } from "./support/herdr.js";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { settingsPath } from "../mod/trackers/setting.js";
import { main } from "../cli/main.js";

const listing = (tabName, spaceName = "#72") => ({
  spaces: [
    { name: "elsewhere", tabs: [{ id: "tab-other", name: "1", terminals: [{ terminal: "t9" }] }] },
    { name: spaceName, tabs: [{ id: "tab-session", name: tabName, terminals: [{ terminal: "t1" }, { terminal: "t2" }] }] },
  ],
});

// Stubs `herdr-app ls` with the listing and records each `herdr-app do` call; other programs, such as git, run.
function stubApp(t, layout) {
  const calls = [];
  stubHerdr(t, {
    exec: async (command, args, options) => {
      if (command !== "herdr-app") return defaults.exec(command, args, options);
      if (args[0] === "ls") return { code: 0, stdout: JSON.stringify(layout), stderr: "" };
      calls.push(args);
      return { code: 0, stdout: "{\"ok\":true}", stderr: "" };
    },
  });
  return calls;
}

async function run(t, args, { terminal = "t2" } = {}) {
  const previous = process.env.HC_TERMINAL_ID;
  process.env.HC_TERMINAL_ID = terminal;
  t.after(() => { process.env.HC_TERMINAL_ID = previous ?? ""; });
  const out = [];
  const err = [];
  t.mock.method(console, "log", (line) => out.push(line));
  t.mock.method(console, "error", (line) => err.push(line));
  const code = await main(args);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

// Runs the command in a repository whose issue spaces are named by the template, if any.
function inRepository(t, spaceName) {
  const repository = createRepository(temporaryFolder(t));
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  const entry = { tracker: "github", repo: "owner/name", ...(spaceName ? { spaceName } : {}) };
  writeFileSync(settingsPath(), JSON.stringify({ repos: { [repository]: entry } }));
  const previous = process.cwd();
  process.chdir(repository);
  t.after(() => process.chdir(previous));
}

beforeEach(() => forgetLookups());

test("tab prints the session tab's ID, name and space name, separated by tabs", async (t) => {
  stubApp(t, listing("Claude"));
  const { code, out } = await run(t, ["tab"]);
  assert.equal(code, 0);
  assert.equal(out, "tab-session\tClaude\t#72");
});

test("tab --json prints the session tab as an object", async (t) => {
  stubApp(t, listing("Claude"));
  const { code, out } = await run(t, ["tab", "--json"]);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(out), { id: "tab-session", name: "Claude", space: "#72" });
});

for (const args of [["tab"], ["tab", "--json"], ["tab", "rename", "#72", "Tab names"]]) {
  test(`${args.join(" ")} fails when HC_TERMINAL_ID is empty`, async (t) => {
    const calls = stubApp(t, listing("Claude"));
    const { code, err } = await run(t, args, { terminal: "" });
    assert.equal(code, 1);
    assert.match(err, /HC_TERMINAL_ID is empty/);
    assert.deepEqual(calls, []);
  });

  test(`${args.join(" ")} fails when no tab holds the terminal`, async (t) => {
    const calls = stubApp(t, listing("Claude"));
    const { code, err } = await run(t, args, { terminal: "t404" });
    assert.equal(code, 1);
    assert.match(err, /no Herdr tab holds terminal t404/);
    assert.deepEqual(calls, []);
  });
}

for (const unnamed of ["Claude", "3"]) {
  test(`tab rename renames a tab named ${unnamed}, without the ID in the issue's own space`, async (t) => {
    inRepository(t);
    const calls = stubApp(t, listing(unnamed));
    const { code, out } = await run(t, ["tab", "rename", "#72", "Tab names"]);
    assert.equal(code, 0);
    assert.deepEqual(calls, [["do", "tab.rename", "--id", "tab-session", "--name", "Tab names"]]);
    assert.match(out, /Tab names/);
  });
}

test("tab rename prefixes the issue ID when the space isn't named after the issue", async (t) => {
  inRepository(t);
  const calls = stubApp(t, listing("Claude", "herdr-issues-mod"));
  const { code } = await run(t, ["tab", "rename", "#72", "Tab names"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, [["do", "tab.rename", "--id", "tab-session", "--name", "#72 Tab names"]]);
});

test("tab rename compares the space with the name the repository's spaceName template gives", async (t) => {
  inRepository(t, "<repo> <issueId>");
  const calls = stubApp(t, listing("Claude", "name #72"));
  const { code } = await run(t, ["tab", "rename", "#72", "Tab names"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, [["do", "tab.rename", "--id", "tab-session", "--name", "Tab names"]]);
});

test("tab rename leaves a tab the person named", async (t) => {
  inRepository(t);
  const calls = stubApp(t, listing("Review"));
  const { code, out } = await run(t, ["tab", "rename", "#72", "Tab names"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, []);
  assert.equal(out, "The tab keeps its name: Review");
});

test("tab rename needs an issue ID and a name", async (t) => {
  const calls = stubApp(t, listing("Claude"));
  const { code, err } = await run(t, ["tab", "rename", "#72"]);
  assert.equal(code, 2);
  assert.match(err, /needs an issue ID and a name/);
  assert.deepEqual(calls, []);
});

test("--help lists both tab commands", async (t) => {
  const { code, out } = await run(t, ["--help"]);
  assert.equal(code, 0);
  assert.match(out, /^ {2}tab \[--json\] /m);
  assert.match(out, /^ {2}tab rename <id> <name> /m);
});
