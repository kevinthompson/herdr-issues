#!/bin/bash
# PostToolUse hook: after Claude creates a GitHub issue with `gh issue create` or a Linear issue with
# the Linear MCP's save_issue, touches ~/.config/herdr-app/data/issues/created, which every copy of
# the Herdr issues panel watches, so a remote list shows the new issue without waiting for its poll.
# The plugin's hooks.json registers it for PostToolUse with the matcher "Bash|mcp__.*__save_issue". Without the
# plugin, the same entry goes in ~/.claude/settings.json under hooks.PostToolUse:
#   { "matcher": "Bash|mcp__.*__save_issue",
#     "hooks": [{ "type": "command", "command": "<this script's path>", "timeout": 10 }] }

input=$(cat)

# gh prints the new issue's URL, so one in the output means the command created an issue.
created_github_issue() {
  jq -e '
    .tool_name == "Bash"
    and (.tool_input.command // "" | test("\\bgh\\s+issue\\s+create\\b"))
    and (.tool_response.stdout // "" | test("https://github\\.com/[^/\\s]+/[^/\\s]+/issues/[0-9]+"))
  ' <<<"$input" >/dev/null
}

# save_issue updates the issue an id names, and creates one without it.
created_linear_issue() {
  jq -e '(.tool_name | test("^mcp__.*__save_issue$")) and (.tool_input.id == null)' <<<"$input" >/dev/null
}

created_github_issue || created_linear_issue || exit 0

data_folder="${HERDR_APP_HOME:-$HOME/.config/herdr-app}/data/issues"
mkdir -p "$data_folder" && touch "$data_folder/created"
