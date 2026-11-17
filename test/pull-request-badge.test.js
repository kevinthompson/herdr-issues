import assert from "node:assert/strict";
import { test } from "node:test";
import { pullRequestBadgeColor } from "../mod/pull-request-status.js";

const pullRequest = (status, checksFailing = null) => ({
  url: `https://github.com/owner/name/pull/${status}`,
  title: "Fix",
  repo: "name",
  number: 1,
  status,
  branch: "fix",
  checksFailing,
});

test("a draft is gray, an open pull request green and one with failing checks red", () => {
  assert.equal(pullRequestBadgeColor([pullRequest("draft")]), "dim");
  assert.equal(pullRequestBadgeColor([pullRequest("open", false)]), "ansi2");
  assert.equal(pullRequestBadgeColor([pullRequest("open", true)]), "ansi1");
});

test("failing checks turn a draft red", () => {
  assert.equal(pullRequestBadgeColor([pullRequest("draft", true)]), "ansi1");
});

test("an in-review or approved pull request is green", () => {
  assert.equal(pullRequestBadgeColor([pullRequest("inReview")]), "ansi2");
  assert.equal(pullRequestBadgeColor([pullRequest("approved")]), "ansi2");
});

test("merged and closed pull requests stay gray, even with failing checks", () => {
  assert.equal(pullRequestBadgeColor([pullRequest("merged", true)]), "dim");
  assert.equal(pullRequestBadgeColor([pullRequest("closed")]), "dim");
});

test("several pull requests take the most urgent color: red, then green, then gray", () => {
  assert.equal(pullRequestBadgeColor([pullRequest("draft"), pullRequest("open", true), pullRequest("open")]), "ansi1");
  assert.equal(pullRequestBadgeColor([pullRequest("merged"), pullRequest("open"), pullRequest("draft")]), "ansi2");
  assert.equal(pullRequestBadgeColor([pullRequest("merged"), pullRequest("draft")]), "dim");
});
