#!/bin/bash
# SessionStart hook: passes the Herdr terminal's ID to the commands Claude runs, which
# don't inherit HC_TERMINAL_ID from Claude's process, by exporting it in the file Claude
# Code loads into the Bash tool's environment. The work skill uses it to find and rename
# the session's tab.

[[ -n $HC_TERMINAL_ID && -n $CLAUDE_ENV_FILE ]] || exit 0

printf 'export HC_TERMINAL_ID=%q\n' "$HC_TERMINAL_ID" >>"$CLAUDE_ENV_FILE"
