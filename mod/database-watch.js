// Refreshes a listed Beads repository the moment its database changes, rather than at the next poll. `bd` rewrites
// its Dolt store under `.beads/embeddeddolt/` on every read as well as every write, so watching that would let the
// panel's own `bd list` set off a refresh in a loop. Only a write or a `bd show` touches `.beads/last-touched`, from
// the main checkout or any worktree, so that file alone counts as a change, and listing issues never runs `bd show`. A batch holding only the folder itself means the
// watcher dropped paths; the reads' churn can cause that, so it's ignored and the poll catches anything missed.
import { exec, watchFolder } from "herdr";

/** @typedef {import("./trackers/index.js").Tracker} Tracker */
/** @typedef {import("./trackers/index.js").Project} Project */

export const SETTLE_MS = 300;

/**
 * The folder to watch for the listed repository, or null when its tracker isn't Beads or it's on another machine.
 * @param {{ tracker: Tracker | null, project: Project | null, scopeKey: string | null }} listed
 */
export function databaseFolder({ tracker, project, scopeKey }) {
  return tracker?.kind === "beads" && project && !project.on && scopeKey ? `${scopeKey}/.beads` : null;
}

/** @param {string} folder */
const realPath = async (folder) => (await exec("pwd", ["-P"], { cwd: folder })).stdout.trim() || folder;

/**
 * Calls `onChange` once a burst of writes to the database in `folder` has been quiet for SETTLE_MS, until cancelled.
 * @param {string} folder
 * @param {() => void} onChange
 * @param {{ sleep: (ms: number) => Promise<unknown>, watch?: typeof watchFolder, resolve?: (folder: string) => Promise<string> }} options
 */
export function watchDatabase(folder, onChange, { sleep, watch = watchFolder, resolve = realPath }) {
  /** @type {import("herdr").FolderWatch | null} */
  let pending = null;
  let cancelled = false,
    stopped = false,
    settling = false,
    changedAt = 0;

  const settle = async () => {
    settling = true;
    do await sleep(SETTLE_MS);
    while (!cancelled && Date.now() - changedAt < SETTLE_MS);
    settling = false;
    if (!cancelled) onChange();
  };

  (async () => {
    // Changes arrive under the folder's real path when the repository is reached through a symlink.
    const stamps = new Set([folder, await resolve(folder)].map((each) => `${each}/last-touched`));
    while (!cancelled) {
      pending = watch(folder);
      const paths = await pending;
      if (cancelled || !paths.some((path) => stamps.has(path))) continue;
      changedAt = Date.now();
      if (!settling) settle();
    }
  })().catch(() => {
    stopped = true;
  });

  return {
    folder,
    // False once cancelled or once the watcher refused the folder, so the next refresh starts it again.
    get running() {
      return !cancelled && !stopped;
    },
    cancel() {
      cancelled = true;
      pending?.cancel();
    },
  };
}
