// Close requests from finished sessions: `issues close` labels the session's terminal issues.close=<issue ID>, and
// the panel closes that terminal's space through the remove-worktree dialog (worktree-dialog.js) once the terminal
// is idle. Closing the space ends the session in it, so acting while it still works would cut off its final message.
// The dialog removes the worktree without asking only where removesWithoutAsking (removal.js) allows; a space on
// another machine always asks.

export const CLOSE_LABEL = "issues.close";
// Agent statuses of a terminal whose turn has ended: done until the person looks at it, idle after.
const IDLE_STATUSES = new Set(["done", "idle"]);

// The requests ready to act on, { terminal, space, ask }: each labeled terminal that is idle and shown in a space,
// from herdr's terminals(), spaces() and panes().
export function readyCloseRequests(terminalList, spaceList, paneList) {
  return terminalList
    .filter((terminal) => terminal.labels?.[CLOSE_LABEL] !== undefined && IDLE_STATUSES.has(terminal.status))
    .flatMap((terminal) => {
      const tab = paneList.find((pane) => pane.terminal === terminal.address)?.tab;
      const space = spaceList.find((candidate) => (candidate.tabs ?? []).some((held) => held.id === tab));
      return space ? [{ terminal: terminal.address, space: space.id, ask: space.machine != null }] : [];
    });
}
