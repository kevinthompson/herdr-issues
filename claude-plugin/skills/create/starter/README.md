# Issues

This folder tracks the project's work. Each issue is one Markdown file that
holds everything needed to complete it without further context.

## Files

- One issue per file, named `<ID>-<slug>.md`, for example `PREFIX-001-short-slug.md`.
- IDs are sequential: `PREFIX-` followed by a zero-padded number. Use the next
  number after the highest existing ID.
- Files never move or get deleted. Status lives in the frontmatter, so paths
  and links stay stable.
- Start new issues from [TEMPLATE.md](TEMPLATE.md).

## Frontmatter

| Field        | Values                                                     |
| ------------ | ---------------------------------------------------------- |
| `id`         | `PREFIX-001`; matches the filename prefix                  |
| `title`      | Short imperative sentence                                  |
| `status`     | `backlog`, `todo`, `in-progress`, `done`, `canceled`       |
| `priority`   | `0` none, `1` urgent, `2` high, `3` medium, `4` low        |
| `labels`     | List of short tags, for example `[input, ui]`              |
| `blocked_by` | List of issue IDs that must be `done` before starting      |
| `branch`     | Lowercase `id` plus slug, for example `prefix-001-short-slug` |
| `created`    | ISO date the issue was written                             |
| `completed`  | ISO 8601 UTC time it became `done`, like Linear's `completedAt`, for example `2026-11-11T16:08:39.358Z`; removed if it leaves `done`. Leave it out when writing an issue |
| `order`      | Position in the issue list, set by reordering in the Herdr issues panel; leave it out when writing an issue |

An issue is **ready** when its status is `todo` and every issue in
`blocked_by` is `done`.

Within each status, issues with an `order` come first, lowest number first.
The rest follow by priority, then by ID.
`done` is the exception: most recently `completed` first.

## Sections

- **Context**: why the work matters, and the files, functions and earlier
  decisions it touches.
- **Goal**: the outcome in one or two sentences.
- **Acceptance criteria**: checkboxes, each one verifiable by a test, a
  command's output, or observed behavior in the running program.
- **Out of scope**: what must not change.
- **Verification**: exact commands to run and what to check.
- **Notes**: findings and decisions recorded while working.

## Working an issue

Issues are tracked on `main`: every change to this folder is made in the main
checkout (the first path `git worktree list` prints) and committed on `main`,
even while the work happens in a worktree on the issue's branch. Each issue is
one branch, merged into `main` once; work that needs more is split into issues
joined by `blocked_by`. An issue is
`in-progress` while it's worked, and its criteria are checked off as they're
met. It's `done` once its branch is merged into `main` and **Verification**
passes there. A criterion only a person can check by hand, such as playing it
in the running program, may stay unchecked with a note under **Notes** saying
it wasn't run.
