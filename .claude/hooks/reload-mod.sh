#!/bin/bash
# PostToolUse hook: after Claude edits a file of the mod Herdr loads, touches
# the mod's link in ~/.config/herdr-app/mods so Herdr reloads it. Herdr
# watches its mods folder, and macOS reports a save under the folder a link
# points to, not under the link, so saves to this repository alone never
# reach Herdr.
#
# Registered in this repository's .claude/settings.json for Edit, Write,
# MultiEdit and NotebookEdit. Edits in a worktree do nothing: the link points
# at the main checkout.

link="${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods/issues"
[[ -L $link ]] || exit 0
loaded=$(cd "$link" 2>/dev/null && pwd -P) || exit 0

file=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
[[ -n $file ]] || exit 0
folder=$(cd "$(dirname "$file")" 2>/dev/null && pwd -P) || exit 0

[[ $folder == "$loaded" || $folder == "$loaded"/* ]] && touch -h "$link"
exit 0
