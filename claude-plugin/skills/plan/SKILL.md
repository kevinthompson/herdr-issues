---
name: plan
description: Turn a prompt, a brief or a full spec into a series of issues by interviewing the person, then write them in Linear, in GitHub Issues or in a local Beads database. Use when asked to plan work into issues or break something down into tickets, for example "plan this out", "break this spec into issues", "help me plan <feature>" or "/issues:plan <brief or path>".
argument-hint: <a prompt, a brief, or a spec's path or URL>
---

Turn the work described in `$ARGUMENTS` or the conversation into a series of issues, each a hand-off `/issues:create` would accept. The person decides what the work is and why; the interview draws that out, and you supply everything the code and the tracker can answer.

1. **Read the input in full.** It may be a one-line prompt, a brief, or a full spec given as text, a file path or a URL (a Notion page, a Linear document or issue, a Google Doc); fetch it with the matching tool. Note how much it already settles: a full spec needs a short interview, a prompt a longer one.
2. **Settle where the issues go.** Use the main checkout: the first path `git worktree list` prints.
   - **The panel's scope is the default.** When the Herdr issues panel lists a scope for this repository, the context says so, and the panel also writes it to the JSON file in `~/.config/herdr-app/data/issues/scope/` whose `repo` is the main checkout: `{ tracker, team, scope: { id, kind, label, project, milestone } }`. Map it to a destination: a milestone means its project and that milestone; a project means that project; `team`, `triage` and a saved view (`view`) mean the team (a view is a filter, so issues can't be filed into it); `mine` means the team that owns the repository, assigned to the person.
   - **Without a scope**, find the tracker as `/issues:create` step 1 does, with `issues tracker --json`.
   - **Beads** has one destination, the repository's Beads database in the main checkout, and the panel publishes no scope for it. Run `issues auth beads` first; if it fails, relay the problem and fix it prints, tell the person to run `/issues:config`, and stop. Say where the issues go, and skip the confirmation below.
   - **Confirm it** with AskUserQuestion before anything else: the destination you found first, marked Recommended and named in full (for example "Web team, project Checkout redesign, milestone Phase 1"), then the team without a project, and Other for the person to name a team, project or milestone. Check a named project or milestone exists before using it.
3. **Do the legwork before asking.** Read the code the work touches, and the destination's open issues with `issues list <scope id>`, which prints them exactly as the Herdr issues panel lists them: the scope's `id` for the panel's scope, or for another destination its ID from `issues scopes` (a project's or milestone's, or `team` for a team; GitHub and Beads have one list, which `issues list` prints without a scope), so questions are informed, nothing is filed twice, and existing issues can be blockers. Note what the input leaves open that the code can't answer.
4. **Interview.** Ask in rounds of one to four focused multiple-choice questions with AskUserQuestion, each standing on its own and naming what it asks about, with your recommendation first. Cover only what is still open, roughly in this order:
   - the outcome and who it's for, and what done looks like;
   - scope: what's in, what's deliberately out, and what's later;
   - approach, where the code allows more than one and the choice matters;
   - sequencing: what must be merged first, and what can run in parallel;
   - risks the code reveals, such as migrations, feature flags, data backfills or other teams' code.

   Never invent product or creative content (copy, names, designs, features the person hasn't asked for): ask for it, or record in the issue that the person provides it. Stop asking once every issue could meet the bar in step 3 of `../create/writing.md`.

5. **Propose the breakdown.** Each issue is one branch and one pull request, as `../create/writing.md` requires; split anything larger.
   - Write the breakdown as a numbered list in order: one issue per item, with a short imperative title, one sentence of goal and its blockers on their own sub-items.
   - Ask for approval with AskUserQuestion, and put that whole numbered list in the `preview` of the approving option, since a terminal can show the dialog without your response text. Keep the question itself to one line that names what it asks about (for example "Approve these four issues?") and the option labels short; never say the issues were already filed.
   - You may also write the list in your response text, but the dialog must be self-sufficient.
   - When the person asks for revisions, put the revised list in the `preview` the same way, then ask again. Don't write any issue before they approve it.
6. **Write and file the issues** here, as `../create/writing.md` says: run `issues context <words>` in the main checkout, then write the approved breakdown in order, with each issue's goal, blockers and everything the interview settled for its Context, filed in the destination from step 2: in Linear, with the project and milestone set on each issue, and for a `mine` scope, each issue assigned to the person.
7. **Report** each issue's ID, title and link, in order, any existing issue found covering the work, any assumption the person should confirm, and anything still waiting on the person, such as content they will provide.
