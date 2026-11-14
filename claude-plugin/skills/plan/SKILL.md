---
name: plan
description: Turn a prompt, a brief or a full spec into a series of issues by interviewing the person, then write them in Linear or GitHub Issues. Use when asked to plan work into issues or break something down into tickets, for example "plan this out", "break this spec into issues", "help me plan <feature>" or "/issues:plan <brief or path>".
argument-hint: <a prompt, a brief, or a spec's path or URL>
---

Turn the work described in `$ARGUMENTS` or the conversation into a series of issues, each a hand-off `/issues:create` would accept. The person decides what the work is and why; the interview draws that out, and you supply everything the code and the tracker can answer.

1. **Read the input in full.** It may be a one-line prompt, a brief, or a full spec given as text, a file path or a URL (a Notion page, a Linear document or issue, a Google Doc); fetch it with the matching tool. Note how much it already settles: a full spec needs a short interview, a prompt a longer one.
2. **Settle where the issues go.** Use the main checkout: the first path `git worktree list` prints.
   - **The panel's scope is the default.** When the Herdr issues panel lists a scope for this repository, the context says so, and the panel also writes it to the JSON file in `~/.config/herdr-app/data/issues/scope/` whose `repo` is the main checkout: `{ tracker, team, scope: { kind, label, project, milestone } }`. Map it to a destination: a milestone means its project and that milestone; a project means that project; `team`, `triage` and a saved view (`view`) mean the team (a view is a filter, so issues can't be filed into it); `mine` means the team that owns the repository, assigned to the person.
   - **Without a scope**, find the tracker as `/issues:create` step 1 does, with `issues tracker --json`.
   - **Confirm it** with AskUserQuestion before anything else: the destination you found first, marked Recommended and named in full (for example "Calendar team, project Lock down the legacy iCal feed, milestone Phase 1"), then the team without a project, and Other for the person to name a team, project or milestone. Check a named project or milestone exists before using it.
3. **Do the legwork before asking.** Read the code the work touches, and the destination's open issues (`list_issues` for the team or project, or `gh issue list`), so questions are informed, nothing is filed twice, and existing issues can be blockers. Note what the input leaves open that the code can't answer.
4. **Interview.** Ask in rounds of one to four focused multiple-choice questions with AskUserQuestion, each standing on its own and naming what it asks about, with your recommendation first. Cover only what is still open, roughly in this order:
   - the outcome and who it's for, and what done looks like;
   - scope: what's in, what's deliberately out, and what's later;
   - approach, where the code allows more than one and the choice matters;
   - sequencing: what must land first, and what can run in parallel;
   - risks the code reveals, such as migrations, feature flags, data backfills or other teams' code.

   Never invent product or creative content (copy, names, designs, features the person hasn't asked for): ask for it, or record in the issue that the person provides it. Stop asking once every issue could meet the bar in `../create/SKILL.md` step 4.
5. **Propose the breakdown.** List the issues in order: a short imperative title, one sentence of goal, and its blockers. Each is one branch and one pull request, as `/issues:create` step 4 requires; split anything larger. Revise with the person until they approve it; don't write any issue before then.
6. **Write the issues** by following `../create/SKILL.md` steps 3 to 5 (read it beside this skill), with the destination from step 2 and everything the interview settled in each issue's Context. In Linear, set each issue's project and milestone from the destination, and for a `mine` scope assign each issue to the person. Create blockers first so later issues can link them.
7. **Report** each issue's ID, title and link, in order, and anything still waiting on the person, such as content they will provide.
