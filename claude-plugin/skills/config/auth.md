# Checking a tracker's access

Read this beside `SKILL.md` in step 3, for the tracker chosen in step 2. Never print a secret, and never ask for one in chat: tell the person where to put it.

- **Linear**: the panel reads the API key from the macOS Keychain, where its setup view saves it. Check the key is present with `issues auth linear`, which never prints it. If it fails, relay the problem and fix it prints: the person pastes the key in the panel's setup view, or saves it in the Keychain themselves with `security add-generic-password -U -s herdr-issues -a linear -w`, which asks for it. Never ask for the key in chat. The skills reach Linear through its MCP server instead. When neither `mcp__linear__` nor `mcp__claude_ai_Linear__` tools are available, tell the person to add the server once for every project by running this command, suggesting the `! ` prefix so it runs in this session:

  ```sh
  claude mcp add --transport http --scope user linear https://mcp.linear.app/mcp
  ```

  Then they start a new Claude Code session, since a server added mid-session isn't available until one starts, run `/mcp`, choose `linear` and sign in to Linear in the browser window it opens. Say that a Linear connection on their Claude account at claude.ai works too.

- **GitHub**: the panel and the skills run the GitHub CLI as the person. Check `issues auth github`; if it fails, relay the problem and fix it prints, suggesting `! gh auth login` when gh isn't logged in. When gh isn't installed and the fix names install commands (`devbox global add gh`, `brew install gh`), offer to run one with AskUserQuestion, one option per command the fix names and one to install it themselves; on a yes, run that command and check again. If gh still isn't found after `devbox global add gh`, tell the person to make sure their shell profile evaluates `devbox global shellenv` and to start a new shell (and restart Claude Code from it), since devbox's global packages are on PATH only then. Then check the account can see the repository's issues (`gh issue list --repo <repo> --limit 1`).
- **Beads**: Beads needs no credentials, only the `bd` CLI and a database in the main checkout. Check both with `issues auth beads`; if it fails, relay the problem and fix it prints. When `bd` isn't installed and the fix names install commands (`devbox global add beads`, `brew install beads`), offer to run one as for gh, and check again. When the repository has no Beads database, offer with AskUserQuestion to make one, or to make it themselves; on a yes, run this in the main checkout, as the panel's setup view does, so the database stays out of git and `bd` adds no agent instructions or git hooks, then check again:

  ```sh
  bd init --non-interactive --quiet --skip-agents --skip-hooks --setup-exclude
  ```
