// The issues whose worktree is opening, from Start or Continue, or whose branch is merging, each with the status the
// footer shows for it. Each issue keeps its own entry until its own work ends it, however many open at once, and the
// footer shows the most recently started.

/** @typedef {{ status: string, merging: boolean, awaitingSince?: number }} Opening */

export class Openings {
  /** @type {Map<string, Opening>} */
  #byIssue = new Map();

  /**
   * @param {string} id
   * @param {string} status
   * @param {{ merging?: boolean }} [options]
   */
  begin(id, status, { merging } = {}) {
    this.#byIssue.delete(id);
    this.#byIssue.set(id, { status, merging: Boolean(merging) });
  }

  /** @param {string} id */
  get(id) {
    return this.#byIssue.get(id);
  }

  /** @param {string} id */
  end(id) {
    this.#byIssue.delete(id);
  }

  // Keeps the issue's opening until a read of the repository shows its space; see settle.
  /**
   * @param {string} id
   * @param {number} now
   */
  awaitSpace(id, now) {
    const opening = this.#byIssue.get(id);
    if (opening) opening.awaitingSince = now;
  }

  // Ends each opening waiting for a space once stillWaiting says its wait is over.
  /** @param {(id: string, awaitingSince: number) => boolean} stillWaiting */
  settle(stillWaiting) {
    for (const [id, { awaitingSince }] of this.#byIssue)
      if (awaitingSince !== undefined && !stillWaiting(id, awaitingSince)) this.#byIssue.delete(id);
  }

  get awaiting() {
    return [...this.#byIssue.values()].some((opening) => opening.awaitingSince !== undefined);
  }

  get latest() {
    return [...this.#byIssue.values()].at(-1);
  }
}
