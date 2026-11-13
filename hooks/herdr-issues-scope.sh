#!/bin/bash
# UserPromptSubmit hook: in a Herdr terminal, tells Claude which issues the Herdr
# issues panel lists for the session's repository, as the panel publishes them in
# ~/.config/herdr-app/data/issues/scope. It speaks only when the scope differs
# from what it last told this session.

[[ -n $HC_TERMINAL_ID ]] || exit 0

input=$(cat)
session=$(jq -r '.session_id // empty' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
[[ -n $session && -n $cwd ]] || exit 0

common=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
repo=$(dirname "$common")

scope_folder="${HERDR_APP_HOME:-$HOME/.config/herdr-app}/data/issues/scope"
compgen -G "$scope_folder/*.json" >/dev/null || exit 0
description=$(jq -rs --arg repo "$repo" '
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
[[ -n $description ]] || exit 0

state_folder="${TMPDIR:-/tmp}/claude-herdr-issues-scope"
state_file="$state_folder/$session"
[[ -f $state_file && $(cat "$state_file") == "$description" ]] && exit 0
mkdir -p "$state_folder"
printf %s "$description" >"$state_file"
printf '%s\n' "$description"
