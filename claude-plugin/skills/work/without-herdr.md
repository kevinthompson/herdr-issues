# Getting on the issue's branch without the Herdr app

Read this beside `SKILL.md` when the Herdr app isn't installed, so no worktree was opened for the issue. Continue in the current folder on the `branch` that `issues branch <issue ID> --json` prints, and once on it read its pull request as `SKILL.md`'s first batch does.

First check whether the branch already exists, locally (`git rev-parse --verify --quiet <branch>`) or on origin (`git fetch origin <branch>`). Always continue on an existing branch; never create a second branch from main.

- **If it exists**: check it out (`git switch <branch>`). In a worktree on a temporary `worktree-<name>` branch with nothing uncommitted or committed on it, switch to the existing branch and delete the temporary one (`git branch -D worktree-<name>`). If the temporary branch has its own changes or commits, or the existing branch is checked out in another worktree, stop and ask.
- **If it doesn't exist**: run `git fetch origin main` and create the branch from `origin/main` (`git switch -c <branch> origin/main`); on a temporary `worktree-<name>` branch, rename it to that branch before committing.
- **If origin has the branch** and the local branch is behind it with nothing uncommitted, fast-forward it (`git merge --ff-only origin/<branch>`). If the two have diverged, stop and ask.
