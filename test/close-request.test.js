import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readyCloseRequests } from "../mod/close-request.js";
import { removesWithoutAsking } from "../mod/removal.js";

const spaceList = [
  { id: "s1", machine: null, tabs: [{ id: "tab-1" }] },
  { id: "s2", machine: "studio", tabs: [{ id: "tab-2" }] },
];
const paneList = [
  { pane: "p1", terminal: "t1", tab: "tab-1" },
  { pane: "p2", terminal: "studio/t2", tab: "tab-2" },
];
const sessionTerminal = (status, labels = { "issues.close": "#124" }, address = "t1") => ({ address, status, labels });
const requestsFor = (...terminalList) => readyCloseRequests(terminalList, spaceList, paneList);

const mergedBranch = { branch: "feature", bases: ["main"], mergedInto: "main", unpushed: 0, pullRequest: null };
const cleanChecks = { dirty: false, submodules: [], branch: mergedBranch };

describe("readyCloseRequests", () => {
  for (const status of ["working", "blocked"]) {
    test(`waits while the session's terminal is ${status}`, () => {
      assert.deepEqual(requestsFor(sessionTerminal(status)), []);
    });
  }

  for (const status of ["done", "idle"]) {
    test(`acts once the session's terminal is ${status}`, () => {
      assert.deepEqual(requestsFor(sessionTerminal(status)), [{ terminal: "t1", space: "s1", ask: false }]);
    });
  }

  test("ignores an idle terminal that didn't ask", () => {
    assert.deepEqual(requestsFor(sessionTerminal("done", { "issues.complete": "#124" })), []);
  });

  test("ignores a terminal no space shows", () => {
    assert.deepEqual(requestsFor(sessionTerminal("done", undefined, "t9")), []);
  });

  test("asks for a space on another machine", () => {
    assert.deepEqual(requestsFor(sessionTerminal("done", undefined, "studio/t2")), [{ terminal: "studio/t2", space: "s2", ask: true }]);
  });
});

describe("a close request's removal", () => {
  const removes = (terminal, checks, nestedSpaceCount = 0) => {
    const [request] = requestsFor(terminal);
    return removesWithoutAsking(checks, nestedSpaceCount, { ask: request.ask });
  };

  test("removes without the dialog when every check passes", () => {
    assert.equal(removes(sessionTerminal("done"), cleanChecks), true);
  });

  test("opens the dialog when a check fails", () => {
    assert.equal(removes(sessionTerminal("done"), { ...cleanChecks, dirty: true }), false);
  });

  test("opens the dialog when spaces nest under the space", () => {
    assert.equal(removes(sessionTerminal("done"), cleanChecks, 1), false);
  });

  test("opens the dialog for a space on another machine, even when every check passes", () => {
    assert.equal(removes(sessionTerminal("done", undefined, "studio/t2"), cleanChecks), false);
  });
});
