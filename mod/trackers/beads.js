// Issues in the repository's own Beads database (https://github.com/steveyegge/beads), for repositories whose
// entry in issues.json says { "tracker": "beads" } (setting.js). Every request runs the `bd` CLI in the main
// checkout, so every worktree reads and writes the same database in its `.beads/` folder. Beads keeps that
// database out of git, so no change made here makes a commit.
//
// Beads statuses map onto STATUSES (issue.js):
//   open → todo, in_progress → in-progress, blocked → todo (its blockers in blockedBy), deferred → backlog,
//   in_review → in-review, closed → done
// and the panel sets backlog, todo, in-progress and done as deferred, open, in_progress and closed.
// `in_review` isn't built into Beads: only a database whose `bd config set status.custom` names it lists its
// issues and offers In review, which the panel then sets as in_review.
// Beads priorities P0–P4 map onto the panel's scale as P0 → Urgent (1), P1 → High (2), P2 → Medium (3),
// P3 → Low (4) and P4 → None (0). An issue blocks another through a `blocks` dependency.
// A database with epics that aren't closed offers them as scopes after the default one, which lists every issue:
// an epic's scope lists only its own children, not theirs.
import { exec, readTextFile } from "herdr";
import { mainCheckout } from "../location.js";
import { cachedLookup } from "../lookups.js";
import { bdMissing, bdFailed, beadsNotInitialized } from "./problems.js";
import { refuseUnknownLabels } from "./labels.js";

/** @typedef {import("./index.js").Issue} Issue */
/** @typedef {import("./index.js").Tracker} Tracker */
/** @typedef {import("./index.js").IssueChanges} IssueChanges */
/** @typedef {import("./index.js").Project} Project */

/**
 * @typedef {object} BeadsDependency
 * @property {string} id
 * @property {string} [dependency_type]
 * @property {string} [status]
 */

/**
 * A record `bd list` or `bd show` prints as JSON.
 * @typedef {object} BeadsRecord
 * @property {string} id
 * @property {string} title
 * @property {string} status
 * @property {number} priority
 * @property {string[]} [labels]
 * @property {string} created_at
 * @property {string} [created_by]
 * @property {string} updated_at
 * @property {string | null} [closed_at]
 * @property {string | null} [description]
 * @property {string | null} [due_at]
 * @property {number} [dependency_count]
 * @property {BeadsDependency[]} [dependencies]
 */

/** @type {() => null} */
const noResult = () => null;

const RECENTLY_CLOSED = 20;
const BRANCH_SLUG_LENGTH = 50;
const UNFINISHED_STATUSES = "open,in_progress,blocked,deferred";
const BD_INIT_TIMEOUT_MS = 120_000;
const ALL_ISSUES_SCOPE = { id: "all", label: "All issues" };
const EPIC_SCOPE_PREFIX = "epic:";

/** @type {Record<string, string>} */
const STATUS_FROM_BEADS = {
  open: "todo",
  in_progress: "in-progress",
  blocked: "todo",
  deferred: "backlog",
  in_review: "in-review",
  closed: "done",
};
/** @type {Record<string, string>} */
const STATUS_TO_BEADS = { backlog: "deferred", todo: "open", "in-progress": "in_progress", done: "closed" };
const REVIEW_STATUS = "in_review";
const PRIORITY_FROM_BEADS = [1, 2, 3, 4, 0];
const PRIORITY_TO_BEADS = [4, 0, 1, 2, 3];

// The issue's ID, then its title as a slug, as github.js names a GitHub issue's branch.
/** @param {{ id: string, title: string }} issue */
function suggestedBranch({ id, title }) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, BRANCH_SLUG_LENGTH)
    .replace(/^-+|-+$/g, "");
  return slug ? `${id}-${slug}` : id;
}

/** @param {BeadsDependency[]} [dependencies] */
const openBlockers = (dependencies = []) =>
  dependencies
    .filter((dependency) => dependency.dependency_type === "blocks" && dependency.status !== "closed")
    .map((dependency) => dependency.id);

// A record from `bd show` carries its body; one from `bd list` leaves it null until tracker.get loads it.
/**
 * @param {BeadsRecord} record
 * @param {string[]} blockedBy
 * @param {{ detailed?: boolean }} [options]
 * @returns {Issue}
 */
function toIssue(record, blockedBy, { detailed = false } = {}) {
  return {
    id: record.id,
    title: record.title,
    status: STATUS_FROM_BEADS[record.status] ?? record.status,
    priority: PRIORITY_FROM_BEADS[record.priority] ?? 0,
    order: null,
    labels: record.labels ?? [],
    blockedBy,
    branch: suggestedBranch(record),
    created: record.created_at,
    creator: record.created_by || null,
    creatorAvatar: null,
    updated: record.updated_at,
    completed: record.closed_at ?? null,
    body: detailed ? (record.description ?? "").trim() : null,
    due: record.due_at?.slice(0, 10) ?? null,
  };
}

// Whether the database's custom statuses, `bd config get status.custom`, name in_review. Each entry is a name,
// optionally followed by a colon and its category, such as "in_review:frozen"; the entries are separated by commas.
/** @param {(args: string[]) => Promise<any>} bd */
async function hasReviewStatus(bd) {
  const config = await bd(["config", "get", "status.custom"]).catch(noResult);
  /** @type {string} */
  const value = typeof config?.value === "string" ? config.value : "";
  return value.split(",").some((entry) => entry.split(":")[0].trim() === REVIEW_STATUS);
}

// Runs `bd` in the main checkout `root`, resolving with its parsed JSON output.
/** @param {string} root */
const bdIn = (root) => async (/** @type {string[]} */ args) => {
  const result = await exec("bd", [...args, "--json"], { cwd: root }).catch(noResult);
  if (!result || result.code === 127) throw await bdMissing();
  if (result.code !== 0) throw bdFailed(result.stderr.trim().split("\n").pop() || `bd ${args[0]} failed`);
  return JSON.parse(result.stdout || "null");
};

// Whether each main checkout can run `bd`, checked once while the mod runs and again after the setup view checks.
const cachedInstalls = cachedLookup();
/** @param {string} root */
export const checkBeadsInstalled = (root) =>
  cachedInstalls(root, async () => {
    const result = await exec("bd", ["version"], { cwd: root }).catch(noResult);
    if (!result || result.code === 127) throw await bdMissing();
  });

// Throws bdMissing when the main checkout `root` can't run `bd`, and beadsNotInitialized when it has no database.
/** @param {string} root */
export async function checkBeads(root) {
  await checkBeadsInstalled(root);
  await checkBeadsDatabase(root);
}

/** @param {string} root */
export async function checkBeadsDatabase(root) {
  const metadata = await readTextFile(`${root}/.beads/metadata.json`).catch(noResult);
  if (metadata === null) throw beadsNotInitialized();
}

// Makes a Beads database in the main checkout `root`, kept out of git through .git/info/exclude, without the
// agent instructions or git hooks `bd init` adds by default.
/** @param {string} root */
export async function initializeBeads(root) {
  const args = ["init", "--non-interactive", "--quiet", "--skip-agents", "--skip-hooks", "--setup-exclude"];
  const result = await exec("bd", args, { cwd: root, timeout: BD_INIT_TIMEOUT_MS }).catch(noResult);
  if (!result || result.code === 127) throw await bdMissing();
  if (result.code !== 0) throw bdFailed(result.stderr.trim().split("\n").pop() || "bd init failed");
}

/**
 * @param {Project} project
 * @returns {Promise<Tracker | null>}
 */
export async function beadsTracker({ root: projectRoot, on }) {
  if (on != null) return null;
  const root = await mainCheckout(projectRoot, on);
  await checkBeads(root);
  const bd = bdIn(root);
  const reviewable = await hasReviewStatus(bd);
  /** @type {Record<string, string>} */
  const toBeads = reviewable ? { ...STATUS_TO_BEADS, "in-review": REVIEW_STATUS } : STATUS_TO_BEADS;
  const unfinished = reviewable ? `${UNFINISHED_STATUSES},${REVIEW_STATUS}` : UNFINISHED_STATUSES;
  /** @type {BeadsRecord[]} */
  const epics = (await bd(["list", "--type", "epic", "--status", unfinished, "--limit", "0"])) ?? [];
  const scopes = epics.length
    ? [ALL_ISSUES_SCOPE, ...epics.map((epic) => ({ id: `${EPIC_SCOPE_PREFIX}${epic.id}`, label: epic.title }))]
    : undefined;

  // Each record's open blockers, read with `bd show` only for the records that have dependencies.
  /** @param {BeadsRecord[]} records */
  async function withBlockers(records) {
    const dependent = records.filter((record) => record.dependency_count > 0).map((record) => record.id);
    /** @type {BeadsRecord[]} */
    const details = dependent.length ? await bd(["show", ...dependent]) : [];
    const blockers = new Map(details.map((detail) => [detail.id, openBlockers(detail.dependencies)]));
    return records.map((record) => toIssue(record, blockers.get(record.id) ?? []));
  }

  /** @param {string} id */
  async function get(id) {
    /** @type {BeadsRecord[]} */
    const details = (await bd(["show", String(id)]).catch(() => /** @type {BeadsRecord[]} */ ([]))) ?? [];
    const [detail] = details;
    return detail ? toIssue(detail, openBlockers(detail.dependencies), { detailed: true }) : null;
  }

  // Beads keeps no list of labels apart from its issues', and `bd label add` takes any name, so the labels on
  // some issue are the ones it has.
  /**
   * @param {Issue} issue
   * @param {string[]} addLabels
   * @param {string[]} removeLabels
   */
  async function changeLabels(issue, addLabels, removeLabels) {
    /** @type {{ label: string }[]} */
    const entries = (await bd(["label", "list-all"])) ?? [];
    const known = entries.map((entry) => entry.label);
    refuseUnknownLabels([...addLabels, ...removeLabels], known, "Beads");
    for (const label of addLabels) await bd(["label", "add", issue.id, label]);
    for (const label of removeLabels) await bd(["label", "remove", issue.id, label]);
  }

  return {
    kind: "beads",
    name: "Beads",
    writable: true,
    prioritized: true,
    statuses: reviewable ? ["backlog", "todo", "in-progress", "in-review", "done"] : Object.keys(STATUS_TO_BEADS),
    scopes,
    // Every issue in the scope that isn't closed, and once Done is expanded, the most recently closed ones. An
    // unknown scope, such as an epic closed since, lists the default.
    async list(scopeId, loads = new Set()) {
      const epic = scopes?.find((scope) => scope.id === scopeId && scope !== ALL_ISSUES_SCOPE);
      const parent = epic ? ["--parent", epic.id.slice(EPIC_SCOPE_PREFIX.length)] : [];
      const lists = await Promise.all([
        bd(["list", "--status", unfinished, ...parent, "--limit", "0"]),
        loads.has("done")
          ? bd(["list", "--status", "closed", ...parent, "--sort", "closed", "--limit", String(RECENTLY_CLOSED)])
          : [],
      ]);
      return withBlockers(lists.flatMap((list) => list ?? []));
    },
    deferred: () => ["done"],
    recentlyClosed: RECENTLY_CLOSED,
    get,
    // A new body only saves over the body `issue` was read with, so edits made with `bd` meanwhile are never
    // overwritten. Order has nowhere to go.
    async update(issue, { status, priority, body, addLabels = [], removeLabels = [] }) {
      if (status !== undefined && !toBeads[status]) throw new Error(`Beads issues can't be set to ${status}`);
      if (addLabels.length || removeLabels.length) await changeLabels(issue, addLabels, removeLabels);
      if (body !== undefined) {
        const current = await get(issue.id);
        if (!current) throw new Error(`${issue.id} no longer exists`);
        if (current.body !== issue.body) throw new Error(`${issue.id} changed in Beads while you were editing it`);
      }
      const args = [
        ...(status !== undefined ? ["--status", toBeads[status]] : []),
        ...(priority !== undefined ? ["--priority", String(PRIORITY_TO_BEADS[priority])] : []),
        ...(body !== undefined ? [`--description=${body}`] : []),
      ];
      if (args.length) await bd(["update", issue.id, ...args]);
    },
    async start(issue) {
      await bd(["update", issue.id, "--status", "in_progress"]);
    },
  };
}
