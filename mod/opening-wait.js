// When the Start and Continue buttons stop showing their loading state. Opening an issue's worktree returns before its
// space shows in the panel's last read of the repository, so the button waits for the space rather than for the call.

/**
 * @param {{ failed: boolean, inSpace: boolean, waitedMs: number, timeoutMs: number }} wait
 * @returns {boolean} whether the button should still show its loading state
 */
export function stillWaitingForSpace({ failed, inSpace, waitedMs, timeoutMs }) {
  return !failed && !inSpace && waitedMs < timeoutMs;
}
