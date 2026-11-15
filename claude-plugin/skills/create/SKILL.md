---
name: create
description: Write issues as self-contained hand-offs, in Linear, in GitHub Issues or in a local Beads database. Use when asked to create, write, file or add issues, tickets or tasks for work that is already settled, for example "create an issue for …", "file a ticket", "add an issue to …" or "write issues for this plan". To plan work into issues through an interview, use /issues:plan.
argument-hint: <what the work is>
allowed-tools: Bash(issues context:*), Bash(issues tracker:*), Bash(git worktree list:*)
---

Write one issue per distinct piece of work described in `$ARGUMENTS` or the conversation. Settle what the work is with the person, then write and file the issues here, following `writing.md` beside this skill.

1. **Check the tracker in one call.** When `issues` isn't installed (`command -v issues` fails), tell the person to run `./setup` from the herdr-issues repository, and stop. Otherwise make one Bash call in the repository: `git worktree list | head -1; issues context <words>`, where `<words>` are the request's key words. `issues context` prints, as JSON, the `tracker` (its `kind`, `team` or `repo`) after checking its credentials, its `labels` and its `similarIssues`, the issues whose titles share the most words with the request.
   - When it says the repository has no tracker, ask whether to use Linear, GitHub Issues or a local Beads database, record the answer with `/issues:config`, and run the call again.
   - When the credentials check fails, relay the problem and fix it prints, tell the person to run `/issues:config`, and stop. Any other failure: show what it printed and stop.
   - When a similar issue looks like the same work, ask the person whether to file another before going on.
2. **Pin down the intent.** The person decides what the work is and why; you supply everything findable. Ask only about what the conversation and the code cannot answer: the outcome they want, or a choice between approaches. Creative and product content (story, dialog, art, names, copy) comes from the person: carry what they gave into the issues, and when the work needs content they haven't given, say in the issue that they provide it.
3. **Write and file the issues** as `writing.md` says, with the main checkout and what `issues context` printed from step 1, and anything the person said about labels, assignees, priority or which issue blocks which.
4. **Report** as `writing.md` step 5 says. When nothing was filed, say why.
