#!/bin/bash
# UserPromptSubmit hook: in a Herdr terminal, tells Claude which issues the Herdr
# issues panel lists for the session's repository, as the panel publishes them in
# ~/.config/herdr-app/data/issues/scope, and which issue the panel has open in the
# session's checkout, as it publishes it in shared.json. It speaks only when one of
# them differs from what it last told this session.

[[ -n $HC_TERMINAL_ID ]] || exit 0

input=$(cat)
session=$(jq -r '.session_id // empty' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
[[ -n $session && -n $cwd ]] || exit 0

common=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
repo=$(dirname "$common")
checkout=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
app_home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

scope_folder="$app_home/data/issues/scope"
scope=""
compgen -G "$scope_folder/*.json" >/dev/null && scope=$(jq -rs --arg repo "$repo" '
  first(.[] | select(.repo == $repo)) // empty
  | .scope as $scope
  | ($scope.project | if . then "the project \"\(.name)\"\(if .url then " (\(.url))" else "" end)" else null end) as $project
  | (if $scope.kind == "milestone" then "the milestone \"\($scope.milestone.name)\" of \($project)"
     elif $scope.kind == "project" then $project
     elif $scope.kind == "mine" then "the open issues assigned to me, across every team"
     elif $scope.kind == "team" then "the \(.team) team'"'"'s open issues outside its Triage state"
     elif $scope.kind == "triage" then "the \(.team) team'"'"'s issues in its Triage state"
     else "the saved view \"\($scope.label)\"" end) as $what
  | "The Herdr issues panel for this repository lists \($what) in \(.tracker | ascii_upcase[0:1] + .[1:])\(if .team and $scope.kind != "mine" then ", team \(.team)" else "" end). Open means not completed, canceled, a duplicate or in a state named Merged. When I refer to the issues, the project or the milestone without naming one, or ask to start the next issues, I mean this scope."
' "$scope_folder"/*.json 2>/dev/null)

open_issue=$(jq -r --arg checkout "$checkout" '
  ."issues.open" // empty | select(.root == $checkout)
  | "The Herdr issues panel has \(.id) open: \"\(.title)\"\(if .link then " (\(.link))" else "" end). When I say \"this issue\" without naming one, I mean \(.id)."
' "$app_home/shared.json" 2>/dev/null)

state_folder="${TMPDIR:-/tmp}/claude-herdr-issues-scope"
mkdir -p "$state_folder"

# Prints the text when it differs from what this session was last told under the name, and remembers it.
announce() {
  local state_file="$state_folder/$session.$1" text=$2 closed=$3
  [[ $(cat "$state_file" 2>/dev/null) == "$text" ]] && return
  [[ -n $text ]] && printf '%s\n' "$text" || { [[ -s $state_file && -n $closed ]] && printf '%s\n' "$closed"; }
  printf %s "$text" >"$state_file"
}

announce scope "$scope"
announce open "$open_issue" "The Herdr issues panel no longer has an issue open, so \"this issue\" no longer refers to one from it."
