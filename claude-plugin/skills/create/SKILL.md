---
name: create
description: Write issues as self-contained hand-offs, in Linear, in GitHub Issues or in a local Beads database. Use when asked to create, write, file or add issues, tickets or tasks for work that is already settled, for example "create an issue for …", "file a ticket", "add an issue to …" or "write issues for this plan". To plan work into issues through an interview, use /issues:plan.
argument-hint: <what the work is>
allowed-tools: Bash(issues context:*), Bash(issues setting:*), Bash(issues tracker:*), Bash(git worktree list:*)
---

Write one issue per distinct piece of work described in `$ARGUMENTS` or the conversation. Settle what the work is here, then hand the writing to a background agent, so the person can keep working while the issues are filed.

1. **Check the tracker in one call.** When `issues` isn't installed (`command -v issues` fails), tell the person to run `./setup` from the herdr-issues repository, and stop. Otherwise make one Bash call in the repository: `git worktree list | head -1; issues setting createModel; issues setting createEffort; issues context <words>`, where `<words>` are the request's key words. `issues context` prints, as JSON, the `tracker` (its `kind`, `team` or `repo`) after checking its credentials, its `labels` and its `similarIssues`, the issues whose titles share the most words with the request.
   - When it says the repository has no tracker, ask whether to use Linear, GitHub Issues or a local Beads database, record the answer with `/issues:config`, and run the call again.
   - When the credentials check fails, relay the problem and fix it prints, tell the person to run `/issues:config`, and stop. Any other failure: show what it printed and stop.
   - When a similar issue looks like the same work, ask the person whether to file another before going on.
2. **Pin down the intent.** The person decides what the work is and why; the background agent supplies everything findable. Ask only about what the conversation and the code cannot answer: the outcome they want, or a choice between approaches. Ask every question now: the background agent can't. Creative and product content (story, dialog, art, names, copy) comes from the person: carry what they gave into the brief, and when the work needs content they haven't given, say in the brief that they provide it.
3. **Hand off the writing.** Launch the plugin's issue writer with the Agent tool (`subagent_type: "issues:issue-writer"`, and `run_in_background: true` where the tool takes it); it already knows how to write and file issues. Pass `model` as `createModel` unless it is `inherit`, and `effort` as `createEffort` unless it is `default`; the person chose them in `issues.json`, so they count as the person asking for that model and effort. Its prompt is a brief that stands on its own:
   - the repository's main checkout (the first path `git worktree list` printed) and the folder the session is in;
   - what `issues context` printed, as it printed it;
   - the settled intent: every piece of work, its reason, the approach chosen, the content the person gave, and anything they said about labels, assignees, priority or which issue blocks which, in their words where it matters.

   Then tell the person in one sentence that the issues are being written in the background, naming the model, and end the turn so they can keep working.
4. **Report** once the agent finishes: each issue's ID, title and Linear or GitHub URL (a Beads issue has no URL), any existing issue it found covering the work, and any assumption the person should confirm. When it stopped without filing, say why.
