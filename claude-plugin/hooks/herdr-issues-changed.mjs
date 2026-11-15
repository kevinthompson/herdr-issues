#!/usr/bin/env node
// PostToolUse hook: after Claude creates or changes a GitHub issue with `gh issue`, merges a pull request
// that may close one, or creates or changes a Linear issue with the Linear MCP's save_issue, touches
// ~/.config/herdr-app/data/issues/changed, which every copy of the Herdr issues panel watches, so a remote
// list shows the change, such as an issue closed once its branch merged, without waiting for its poll.
// The plugin's hooks.json registers it for PostToolUse with the matcher "Bash|mcp__.*__save_issue". Without the
// plugin, the same entry goes in ~/.claude/settings.json under hooks.PostToolUse:
//   { "matcher": "Bash|mcp__.*__save_issue",
//     "hooks": [{ "type": "command", "command": "node <this script's path>", "timeout": 10 }] }

import { closeSync, mkdirSync, openSync, readFileSync, utimesSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const GITHUB_ISSUE_CHANGE = /\bgh\s+(issue\s+(create|close|reopen|edit|delete|transfer)|pr\s+merge)\b/;

const changedGithubIssue = ({ tool_name, tool_input }) =>
  tool_name === "Bash" && GITHUB_ISSUE_CHANGE.test(tool_input?.command ?? "");

const changedLinearIssue = ({ tool_name }) => /^mcp__.*__save_issue$/.test(tool_name ?? "");

function touch(path) {
  closeSync(openSync(path, "a"));
  const now = new Date();
  utimesSync(path, now, now);
}

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

if (input && (changedGithubIssue(input) || changedLinearIssue(input))) {
  const dataFolder = join(process.env.HERDR_APP_HOME || join(homedir(), ".config/herdr-app"), "data/issues");
  mkdirSync(dataFolder, { recursive: true });
  touch(join(dataFolder, "changed"));
}
