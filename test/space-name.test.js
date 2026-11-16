import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { createRepository, temporaryFolder } from "./support/repository.js";
import { forgetLookups } from "../mod/lookups.js";
import { settingsPath } from "../mod/trackers/setting.js";
import {
  issueIdInSpaceName,
  issueIdOfSpace,
  issueSpaceName,
  newIssueSpaceName,
  panelIssueSpaceName,
} from "../mod/space-name.js";

beforeEach(() => forgetLookups());

// A repository tracked in GitHub Issues as owner/name, whose issue spaces are named by the template, if any.
function repository(t, spaceName) {
  const root = createRepository(temporaryFolder(t));
  mkdirSync(join(settingsPath(), ".."), { recursive: true });
  const entry = { tracker: "github", repo: "owner/name", ...(spaceName ? { spaceName } : {}) };
  writeFileSync(settingsPath(), JSON.stringify({ repos: { [root]: entry } }));
  return { root, on: null };
}

test("a space named with a bare Linear or GitHub ID names that issue", () => {
  assert.equal(issueIdInSpaceName("ABC-12"), "ABC-12");
  assert.equal(issueIdInSpaceName("A1-7"), "A1-7");
  assert.equal(issueIdInSpaceName("#12"), "#12");
});

test("a space whose name isn't an issue ID names no issue", () => {
  for (const name of ["herdr-issues", "abc-12", "ABC-12 notes", "#12a", "12", "ABC-", "", "abc#123", "#123 later"]) {
    assert.equal(issueIdInSpaceName(name), undefined, name);
  }
});

test("a space whose name ends with an issue ID after whitespace names that issue", () => {
  assert.equal(issueIdInSpaceName("󰄱 #123"), "#123");
  assert.equal(issueIdInSpaceName("anything #123"), "#123");
  assert.equal(issueIdInSpaceName("󰄱 ABC-12"), "ABC-12");
});

test("a space named by the template names the issue in it", () => {
  const named = { template: "<repo> <issueId>", repo: "name" };
  assert.equal(issueIdInSpaceName("name #12", named), "#12");
  assert.equal(issueIdInSpaceName("name ABC-3", named), "ABC-3");
  assert.equal(issueIdInSpaceName("#12", named), "#12");
  assert.equal(issueIdInSpaceName("other#12", named), undefined);
  assert.equal(issueIdInSpaceName("name #12 extra", named), undefined);
});

test("a space whose name ends with the template's name after whitespace names the issue in it", () => {
  const named = { template: "<repo> <issueId>", repo: "herdr-issues" };
  assert.equal(issueIdInSpaceName("󰄱 herdr-issues #76", named), "#76");
  assert.equal(issueIdInSpaceName("󰄱 herdr-issues ABC-3", named), "ABC-3");
});

test("the template's other text is matched literally", () => {
  assert.equal(issueIdInSpaceName("[a.b]#4", { template: "[<repo>]<issueId>", repo: "a.b" }), "#4");
  assert.equal(issueIdInSpaceName("[axb]#4", { template: "[<repo>]<issueId>", repo: "a.b" }), undefined);
});

test("a template naming the issue twice needs the same ID both times", () => {
  const named = { template: "<issueId>/<issueId>" };
  assert.equal(issueIdInSpaceName("#4/#4", named), "#4");
  assert.equal(issueIdInSpaceName("#4/#5", named), undefined);
});

test("issueIdOfSpace reads back the name issueSpaceName gives, with the repository's template", async (t) => {
  const project = repository(t, "<repo> <issueId>");
  const name = await issueSpaceName(project, "#76");
  assert.equal(name, "name #76");
  assert.equal(await issueIdOfSpace(project, name), "#76");
  assert.equal(await issueIdOfSpace(project, "elsewhere"), undefined);
});

test("issueIdOfSpace reads a bare ID in a repository without a template", async (t) => {
  const project = repository(t);
  assert.equal(await issueIdOfSpace(project, "#76"), "#76");
  assert.equal(await issueIdOfSpace(project, "name #76"), "#76");
  assert.equal(await issueIdOfSpace(project, "name#76"), undefined);
});

const WORKING = "\u{F0131}";

test("the panel opens an issue's space with its space name marked working", async (t) => {
  assert.equal(await panelIssueSpaceName(repository(t, "<repo> <issueId>"), "#12"), `${WORKING}   name #12`);
  assert.equal(await panelIssueSpaceName(repository(t), "#12"), `${WORKING}   #12`);
});

test("the panel opens an issue's space marked working when it has no project", async () => {
  assert.equal(await panelIssueSpaceName(null, "#12"), `${WORKING}   #12`);
});

test("a new issue space's name already carrying a mark is marked working once", () => {
  assert.equal(newIssueSpaceName(`${WORKING}   #12`), `${WORKING}   #12`);
  assert.equal(newIssueSpaceName("\u{F0132} #12"), `${WORKING}   #12`);
});
