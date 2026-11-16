# Claude skills

**The Claude plugin** adds the `issues:*` skills, which create, plan, triage and work issues in whichever tracker the repository uses: Linear, GitHub Issues or a local Beads database.

Run these in a Claude Code session in the repository. Each skill takes what follows its name as its request, in plain words or in the forms its section shows, and asks for anything it still needs.

## /issues:config

Use it to choose where a repository's issues are tracked, or to show and change the repository's other settings.

Run without arguments, it asks which tracker to use: a Linear team, GitHub Issues or a local Beads database. It then checks the credentials that tracker needs and asks how finished work is approved and reaches main. With arguments, it changes one setting:

- the tracker: `linear <team key>`, `github [owner/name]` or `beads`;
- a Linear repository's [saved views](configuration.md#views): `view [<name>] <url>` adds one, naming it from Linear when the name is left out, `view clear <name>` removes one, and `views` lists them;
- how work is approved and reaches main: `approval <ask|auto>`, `onApproval <merge|pull-request>` and `waitForChecks <true|false>`;
- whether finished sessions close their worktrees: `close <ask|auto>`;
- the repository's space name: `name <name>`;
- the command run in each new worktree: `worktreeSetup <command>`;
- the model and effort of the sessions that work issues: `workModel <model>` and `workEffort <effort>`.

`clear <setting>` removes a setting, `--all` applies the approval and session settings to every repository, and `show` prints the current settings.

```
/issues:config github
/issues:config linear ENG
/issues:config approval auto
/issues:config view "Checkout bugs" https://linear.app/acme/view/checkout-bugs-a8875271fcf5
/issues:config show
```

## /issues:create

Use it to write issues for work that is already settled. When the work still needs deciding, use `/issues:plan` instead.

Describe the work, with screenshots if they help. It settles any open details with you, checks the tracker for similar issues, and files one issue per distinct piece of work, each a self-contained hand-off with its context, acceptance criteria and verification.

```
/issues:create bug: the save button loses its padding when the window is narrow [screenshot]
/issues:create show a tooltip when hovering the panel toggle button
/issues:create two issues: 1. … 2. …
```

## /issues:plan

Use it to turn an idea, a brief or a full spec into a series of issues by interviewing you. When the work is already settled, use `/issues:create` instead.

It accepts a one-line prompt, a brief, or a spec given as text, a file path or a URL. It reads the input and the code, asks focused questions about direction, scope and approach, answering for itself whatever the code and the tracker can, and then writes the issues in the tracker. A full spec needs a short interview; a one-line prompt needs a longer one.

```
/issues:plan what would it take to make the panel header match the app's native header? [screenshot]
/issues:plan make the collapsed panel show something useful
/issues:plan docs/specs/offline-mode.md
```

## /issues:triage

Use it to make issues small and actionable enough to hand to an agent.

It accepts issue IDs or URLs, a status, or a description of what to triage; without one, it asks which list to triage, such as your issues or Linear's triage queue. For each issue, oldest first, it reads the issue, its comments and the code it names, looks for work already done, duplicates and stale references, and then rewrites the issue with you until it is a self-contained hand-off.

```
/issues:triage #42
/issues:triage todo
/issues:triage this issue again with the context in its comments
```

## /issues:start

Use it to start one or more issues, each in its own Herdr worktree space with a Claude session that works it. To work an issue in the current session instead, use `/issues:work`.

It accepts issue IDs, or `next <N>` to start the N highest-ranked issues that are ready, with nothing blocking them. It opens each issue's worktree on the issue's branch and starts `/issues:work` in it; the session you ran it in does none of the work.

```
/issues:start #42
/issues:start #42 #43
/issues:start next 2
```

## /issues:work

Use it to work an issue from start to finish in the current session. To give an issue its own worktree space, use `/issues:start`.

It accepts an issue ID, or a Linear issue's URL. Run outside the issue's worktree, it starts the issue with `/issues:start` instead. In the worktree, it catches up on any work already on the branch, marks the issue in progress, does the work and verifies it, then follows the repository's approval settings to merge the branch into main or open its pull request.

```
/issues:work #42
/issues:work ENG-123
```
