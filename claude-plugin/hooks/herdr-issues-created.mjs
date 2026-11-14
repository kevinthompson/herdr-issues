#!/usr/bin/env node
// PostToolUse hook: after Claude creates a GitHub issue with `gh issue create` or a Linear issue with
// the Linear MCP's save_issue, touches ~/.config/herdr-app/data/issues/created, which every copy of
// the Herdr issues panel watches, so a remote list shows the new issue without waiting for its poll.
// The plugin's hooks.json registers it for PostToolUse with the matcher "Bash|mcp__.*__save_issue". Without the
// plugin, the same entry goes in ~/.claude/settings.json under hooks.PostToolUse:
//   { "matcher": "Bash|mcp__.*__save_issue",
//     "hooks": [{ "type": "command", "command": "node <this script's path>", "timeout": 10 }] }

import { closeSync, mkdirSync, openSync, readFileSync, utimesSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// gh prints the new issue's URL, so one in the output means the command created an issue.
const createdGithubIssue = ({ tool_name, tool_input, tool_response }) =>
  tool_name === "Bash" &&
  /\bgh\s+issue\s+create\b/.test(tool_input?.command ?? "") &&
  /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/[0-9]+/.test(tool_response?.stdout ?? "");

// save_issue updates the issue an id names, and creates one without it.
const createdLinearIssue = ({ tool_name, tool_input }) =>
  /^mcp__.*__save_issue$/.test(tool_name ?? "") && tool_input?.id == null;

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

if (input && (createdGithubIssue(input) || createdLinearIssue(input))) {
  const dataFolder = join(process.env.HERDR_APP_HOME || join(homedir(), ".config/herdr-app"), "data/issues");
  mkdirSync(dataFolder, { recursive: true });
  touch(join(dataFolder, "created"));
}
