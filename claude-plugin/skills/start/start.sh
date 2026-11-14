#!/bin/bash
# Opens each issue named in the skill's arguments in its own worktree space,
# before the skill's text reaches the model. "next <N>" is left to Claude.

read -r -a issue_ids <<< "$1"

if ! command -v herdr-app > /dev/null; then
  echo "herdr-app not found: the Herdr app isn't installed, so issues can't be started in worktree spaces."
  exit 0
fi

if ! command -v issues > /dev/null; then
  echo "issues not found: run ./setup from the herdr-issues-mod repository to install the issues CLI."
  exit 0
fi

if [ ${#issue_ids[@]} -eq 0 ]; then
  echo "No issue IDs given."
  exit 0
fi

if [ "${issue_ids[0]}" = "next" ]; then
  echo "Asked for the next ${issue_ids[1]:-?} issues; nothing started yet."
  exit 0
fi

for issue_id in "${issue_ids[@]}"; do
  echo "### $issue_id"
  issues worktree "$issue_id" --claude "/issues:work $issue_id" 2>&1
  echo "exit status: $?"
done
