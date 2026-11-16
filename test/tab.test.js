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
    { id: "space-other", name: "elsewhere", tabs: [{ id: "tab-other", name: "1", terminals: [{ terminal: "t9" }] }] },
    {
      id: "space-session",
      name: spaceName,
      tabs: [{ id: "tab-session", name: tabName, terminals: [{ terminal: "t1" }, { terminal: "t2" }] }],
    },
  ],
});

// Stubs `herdr-app ls` with the listing and records each `herdr-app do` call, and each `hc` call with its command
// first; other programs, such as git, run.
function stubApp(t, layout) {
  const calls = [];
  stubHerdr(t, {
    exec: async (command, args, options) => {
      if (command === "hc") {
        calls.push([command, ...args]);
        return { code: 0, stdout: "", stderr: "" };
      }
      if (command !== "herdr-app") return defaults.exec(command, args, options);
      if (args[0] === "ls") return { code: 0, stdout: JSON.stringify(layout), stderr: "" };
      calls.push(args);
      return { code: 0, stdout: '{"ok":true}', stderr: "" };
    },
  });
  return calls;
}

async function run(t, args, { terminal = "t2" } = {}) {
  const previous = process.env.HC_TERMINAL_ID;
  process.env.HC_TERMINAL_ID = terminal;
  t.after(() => {
    process.env.HC_TERMINAL_ID = previous ?? "";
  });
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

for (const args of [["tab"], ["tab", "--json"]]) {
  test(`${args.join(" ")} fails when HC_TERMINAL_ID is empty`, async (t) => {
    const calls = stubApp(t, listing("Claude"));
    const { code, err } = await run(t, args, { terminal: "" });
    assert.equal(code, 1);
    assert.match(err, /HC_TERMINAL_ID is empty/);
    assert.deepEqual(calls, []);
  });
}

const SESSION_COMMANDS = [
  ["tab", "rename", "#72", "Tab names"],
  ["mark", "working", "#72"],
  ["complete", "#72"],
  ["complete", "--cancel", "#72"],
  ["close", "#72"],
  ["close", "--cancel", "#72"],
];

// Stubs exec as it behaves when herdr-app and hc aren't on the PATH, recording each attempt to run them.
function stubWithoutHerdrApp(t) {
  const attempts = [];
  stubHerdr(t, {
    exec: async (command, args, options) => {
      if (command !== "herdr-app" && command !== "hc") return defaults.exec(command, args, options);
      attempts.push([command, ...args]);
      throw Object.assign(new Error(`spawn ${command} ENOENT`), { code: "ENOENT" });
    },
  });
  return attempts;
}

for (const args of SESSION_COMMANDS) {
  test(`${args.join(" ")} does nothing and prints nothing when HC_TERMINAL_ID is empty`, async (t) => {
    inRepository(t);
    const calls = stubApp(t, listing("Claude"));
    const { code, out, err } = await run(t, args, { terminal: "" });
    assert.deepEqual({ code, out, err }, { code: 0, out: "", err: "" });
    assert.deepEqual(calls, []);
  });

  test(`${args.join(" ")} does nothing and prints nothing when herdr-app isn't installed`, async (t) => {
    inRepository(t);
    const attempts = stubWithoutHerdrApp(t);
    const { code, out, err } = await run(t, args);
    assert.deepEqual({ code, out, err }, { code: 0, out: "", err: "" });
    assert.deepEqual(attempts, [["herdr-app", "ls"]]);
  });
}

for (const args of [["tab"], ["tab", "--json"], ["tab", "rename", "#72", "Tab names"], ["complete", "#72"]]) {
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
  const calls = stubApp(t, listing("Claude", "herdr-issues"));
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

for (const [template, space] of [
  [undefined, "󰄱 #72"],
  ["<repo> <issueId>", "󰄱 name #72"],
]) {
  test(`tab rename leaves out the ID in a space named ${space}, which ends with the issue's space name`, async (t) => {
    inRepository(t, template);
    const calls = stubApp(t, listing("Claude", space));
    const { code } = await run(t, ["tab", "rename", "#72", "Tab names"]);
    assert.equal(code, 0);
    assert.deepEqual(calls, [["do", "tab.rename", "--id", "tab-session", "--name", "Tab names"]]);
  });
}

test("tab rename prefixes the ID when the issue's space name ends the space's name without whitespace before it", async (t) => {
  inRepository(t);
  const calls = stubApp(t, listing("Claude", "abc#72"));
  const { code } = await run(t, ["tab", "rename", "#72", "Tab names"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, [["do", "tab.rename", "--id", "tab-session", "--name", "#72 Tab names"]]);
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

const MARKS = { working: "\u{F0131}", waiting: "\u{F051F}", done: "\u{F0132}" };

for (const [state, mark] of Object.entries(MARKS)) {
  test(`mark ${state} starts the issue's space name with its mark`, async (t) => {
    inRepository(t);
    const calls = stubApp(t, listing("Claude", "#72"));
    const { code, out } = await run(t, ["mark", state, "#72"]);
    assert.equal(code, 0);
    assert.deepEqual(calls, [["do", "space.rename", "--id", "space-session", "--name", `${mark}   #72`]]);
    assert.equal(out, `Marked the space ${state}: ${mark}   #72`);
  });
}

test("mark replaces a mark already on the space's name", async (t) => {
  inRepository(t, "<repo> <issueId>");
  const calls = stubApp(t, listing("Claude", `${MARKS.waiting} name #72`));
  const { code } = await run(t, ["mark", "done", "#72"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, [["do", "space.rename", "--id", "space-session", "--name", `${MARKS.done}   name #72`]]);
});

test("mark leaves a space not named after the issue as it is", async (t) => {
  inRepository(t);
  const calls = stubApp(t, listing("Claude", "herdr-issues"));
  const { code, out } = await run(t, ["mark", "working", "#72"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, []);
  assert.equal(out, "The space keeps its name, since it isn't named after #72: herdr-issues");
});

test("mark changes nothing when the space already has the state's mark", async (t) => {
  inRepository(t);
  const calls = stubApp(t, listing("Claude", `${MARKS.done}   #72`));
  const { code, out } = await run(t, ["mark", "done", "#72"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, []);
  assert.equal(out, `The space is already marked done: ${MARKS.done}   #72`);
});

for (const args of [["mark"], ["mark", "finished", "#72"], ["mark", "done"], ["mark", "done", "#72", "#73"]]) {
  test(`${args.join(" ")} fails with a usage error`, async (t) => {
    const calls = stubApp(t, listing("Claude"));
    const { code, err } = await run(t, args);
    assert.equal(code, 2);
    assert.match(err, /mark needs a state \(working, waiting, done\) and one issue ID/);
    assert.deepEqual(calls, []);
  });
}

test("--help lists mark", async (t) => {
  const { out } = await run(t, ["--help"]);
  assert.match(out, /^ {2}mark <working\|waiting\|done> <id>/m);
});

test("complete labels the session's terminal and leaves the tab's name as it is", async (t) => {
  const calls = stubApp(t, listing("Review"));
  const { code, out } = await run(t, ["complete", "#72"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, [["hc", "label", "t2", "issues.complete=#72"]]);
  assert.equal(out, "Marked #72 complete in the tab Review");
});

test("complete --cancel removes the complete label and the ✅ from the tab's name", async (t) => {
  const calls = stubApp(t, listing("✅ Review ✅"));
  const { code, out } = await run(t, ["complete", "--cancel", "#72"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, [
    ["hc", "label", "t2", "issues.complete="],
    ["do", "tab.rename", "--id", "tab-session", "--name", "Review ✅"],
  ]);
  assert.equal(out, "Withdrew #72's completion in the tab Review ✅");
});

test("complete --cancel on a tab without ✅ only removes the complete label", async (t) => {
  const calls = stubApp(t, listing("Review"));
  const { code } = await run(t, ["complete", "--cancel", "#72"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, [["hc", "label", "t2", "issues.complete="]]);
});

for (const args of [
  ["complete", "--cancel"],
  ["complete", "--cancel", "--all"],
  ["complete", "--cancel", "#72", "#73"],
]) {
  test(`${args.join(" ")} fails with a usage error`, async (t) => {
    const calls = stubApp(t, listing("✅ Review"));
    const { code, err } = await run(t, args);
    assert.equal(code, 2);
    assert.match(err, /complete --cancel needs one issue ID/);
    assert.deepEqual(calls, []);
  });
}

test("close labels the session's terminal so the panel closes its space, and changes nothing else", async (t) => {
  const calls = stubApp(t, listing("✅ Review"));
  const { code, out } = await run(t, ["close", "#72"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, [["hc", "label", "t2", "issues.close=#72"]]);
  assert.match(out, /cmd\+shift\+w/);
});

test("close needs one issue ID", async (t) => {
  const calls = stubApp(t, listing("Claude"));
  const { code, err } = await run(t, ["close"]);
  assert.equal(code, 2);
  assert.match(err, /close needs one issue ID/);
  assert.deepEqual(calls, []);
});

test("close --cancel removes the close request label from the session's terminal", async (t) => {
  const calls = stubApp(t, listing("✅ Review"));
  const { code, out } = await run(t, ["close", "--cancel", "#72"]);
  assert.equal(code, 0);
  assert.deepEqual(calls, [["hc", "label", "t2", "issues.close="]]);
  assert.equal(out, "Withdrew the request to close #72's space; the worktree stays open");
});

for (const args of [
  ["close", "--cancel"],
  ["close", "--cancel", "--all"],
  ["close", "--cancel", "#72", "#73"],
]) {
  test(`${args.join(" ")} fails with a usage error`, async (t) => {
    const calls = stubApp(t, listing("Claude"));
    const { code, err } = await run(t, args);
    assert.equal(code, 2);
    assert.match(err, /close --cancel needs one issue ID/);
    assert.deepEqual(calls, []);
  });
}

for (const args of [
  ["close", "--keep", "#72"],
  ["close", "#72", "#73"],
]) {
  test(`${args.join(" ")} fails with a usage error`, async (t) => {
    const calls = stubApp(t, listing("Claude"));
    const { code, err } = await run(t, args);
    assert.equal(code, 2);
    assert.match(err, /close needs one issue ID/);
    assert.deepEqual(calls, []);
  });
}

test("--help lists close and close --cancel", async (t) => {
  const { out } = await run(t, ["--help"]);
  assert.match(out, /^ {2}close <id> /m);
  assert.match(out, /^ {2}close --cancel <id> /m);
});

test("complete never renames the space", async (t) => {
  const calls = stubApp(t, listing("Claude"));
  await run(t, ["complete", "#72"]);
  assert.ok(calls.every((call) => !call.some((arg) => String(arg).startsWith("space."))));
});

test("complete needs an issue ID", async (t) => {
  const calls = stubApp(t, listing("Claude"));
  const { code, err } = await run(t, ["complete"]);
  assert.equal(code, 2);
  assert.match(err, /needs an issue ID/);
  assert.deepEqual(calls, []);
});

test("--help lists complete", async (t) => {
  const { code, out } = await run(t, ["--help"]);
  assert.equal(code, 0);
  assert.match(out, /^ {2}complete <id> /m);
  assert.match(out, /^ {2}complete --cancel <id> /m);
});
