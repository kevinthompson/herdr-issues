---
name: delegate
description: Hand a Linear issue to Cloud Agent by applying the `cloud-agent > one-shot` label and delegating it to the Cloud Agent app user. Use when asked to send, delegate, hand off or give an issue to Cloud Agent or a cloud agent, or to one-shot it, for example "send this to cloud agent", "delegate to cloud agent", "one shot this" or "one-shot <issue ID>".
argument-hint: [issue ID or URL]
---

Hand the Linear issue named in `$ARGUMENTS`, or the one the conversation is about, to Cloud Agent. The `one-shot` label starts agents working, so apply it only when the person has asked for this hand-off in so many words; never apply it as a side effect of triage, creating an issue or anything else.

1. **Load the Linear tools.** Load `get_issue`, `list_issue_labels` and `save_issue` with ToolSearch, prefixed `mcp__linear__` or `mcp__claude_ai_Linear__`. If they aren't available, stop and say so.
2. **Find the issue.** Use the ID or URL in the arguments, or the issue the conversation is about. If neither names exactly one issue, ask which. Read it with `get_issue`.
3. **Check it is ready.** Cloud Agent works the issue with nobody watching, so it needs what `/issues:create` step 4 asks for (read `../create/SKILL.md` beside this skill): testable acceptance criteria and verification commands. If it falls short, say what's missing and offer `/issues:triage` instead of delegating; delegate anyway only if the person says to.
4. **Find the label in the issue's team.** Look up `one-shot` inside the `cloud-agent` label group with `list_issue_labels` for that team, and use its ID: `cloud-agent/one-shot` doesn't resolve as a name, and each team's label has its own ID. If the team has no such label, stop and say so; never create one.
5. **Delegate it.** Save with `save_issue`: `addLabels` with the label's ID (not `labels`, which replaces the issue's other labels) and `delegate: "Cloud Agent"`. Leave the status alone, since Cloud Agent moves the issue when it starts, and leave the assignee, who owns reviewing its pull request.
6. **Report** the issue's link and that it's delegated. Don't comment on the issue.
