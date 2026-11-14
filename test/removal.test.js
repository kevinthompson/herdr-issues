import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CAUTION, PASS, checksAnswered, removalFindings, removalVerdict } from "../removal.js";

const mergedBranch = { branch: "feature", bases: ["main", "origin/main"], mergedInto: "main", unpushed: 0, pullRequest: null };
const cleanChecks = { dirty: false, submodules: [], branch: mergedBranch };
const verdictOf = (checks) => removalVerdict(removalFindings(checks)).mark;

describe("checksAnswered", () => {
  test("is false while any check runs", () => {
    assert.equal(checksAnswered({ dirty: false, submodules: [] }), false);
  });

  test("is true once every check answers, failures and a detached HEAD included", () => {
    assert.equal(checksAnswered({ dirty: { error: "no git" }, submodules: [], branch: null }), true);
  });
});

describe("removalFindings", () => {
  test("lists the answered checks in a fixed order", () => {
    const findings = removalFindings({ ...cleanChecks, warning: "Its issue is still open." });
    assert.deepEqual(findings.map((finding) => finding.text), [
      "It has no uncommitted changes.",
      "Its submodules have no commits that aren't pushed.",
      "feature has nothing that isn't on main.",
      "feature is pushed to origin.",
      "Its issue is still open.",
    ]);
  });

  test("leaves out checks still running", () => {
    assert.deepEqual(removalFindings({ submodules: [] }).map((finding) => finding.result), [PASS]);
  });

  test("passes the push of a merged branch with commits never pushed", () => {
    const [, push] = removalFindings({ branch: { ...mergedBranch, unpushed: 2 } });
    assert.equal(push.result, PASS);
  });

  test("reports a branch check that failed rather than a detached HEAD", () => {
    assert.deepEqual(removalFindings({ branch: { error: "fetch failed" } }), [{ result: CAUTION, text: "Couldn't check the branch: fetch failed" }]);
  });
});

describe("removalVerdict", () => {
  test("is ✅ when every check passes", () => {
    assert.equal(verdictOf(cleanChecks), "✅");
  });

  test("is ✅ for a pushed branch with an open pull request", () => {
    assert.equal(verdictOf({ ...cleanChecks, branch: { ...mergedBranch, mergedInto: null, pullRequest: "#7" } }), "✅");
  });

  test("is ❌ with uncommitted changes", () => {
    assert.equal(verdictOf({ ...cleanChecks, dirty: true }), "❌");
  });

  test("is ❌ with unpushed submodule commits", () => {
    assert.equal(verdictOf({ ...cleanChecks, submodules: ["vendor/lib"] }), "❌");
  });

  test("is ❌ with branch commits on no origin branch and not on main", () => {
    assert.equal(verdictOf({ ...cleanChecks, branch: { ...mergedBranch, mergedInto: null, unpushed: 1 } }), "❌");
  });

  test("is ❌ for an unmerged branch with no origin", () => {
    assert.equal(verdictOf({ ...cleanChecks, branch: { ...mergedBranch, mergedInto: null, unpushed: null } }), "❌");
  });

  test("is ⚠️ for a pushed branch neither merged nor in review", () => {
    assert.equal(verdictOf({ ...cleanChecks, branch: { ...mergedBranch, mergedInto: null } }), "⚠️");
  });

  test("is ⚠️ with a warning", () => {
    assert.equal(verdictOf({ ...cleanChecks, warning: "Its issue is still open." }), "⚠️");
  });

  test("is ⚠️ when the branch couldn't be checked", () => {
    assert.equal(verdictOf({ ...cleanChecks, branch: { error: "fetch failed" } }), "⚠️");
  });

  test("is ⚠️ when no branch is checked out", () => {
    assert.equal(verdictOf({ ...cleanChecks, branch: null }), "⚠️");
  });

  test("is ❌ over ⚠️ when a check couldn't run and work would be lost", () => {
    assert.equal(verdictOf({ ...cleanChecks, dirty: true, submodules: { error: "no git" } }), "❌");
  });
});
