// Issues as Markdown files in the project's issues/ folder, one per file, with YAML frontmatter.
import { exec, readTextFile, writeTextFile, watchFolder } from "herdr";
import { mainCheckout } from "../location.js";
import { STATUSES } from "../issue.js";

const ISSUE_FILE = /^[A-Z][A-Z0-9]*-\d+.*\.md$/;
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;

const unquote = (text) => text.trim().replace(/^(["'])(.*)\1$/, "$2");
const asList = (value) => (Array.isArray(value) ? value : value ? [value] : []);

function parseValue(raw) {
  const value = raw.replace(/\s+#.*$/, "").trim();
  if (value.startsWith("[") && value.endsWith("]")) return value.slice(1, -1).split(",").map(unquote).filter(Boolean);
  return unquote(value);
}

function parseFields(frontmatter) {
  const fields = {};
  for (const line of frontmatter.split("\n")) {
    const match = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (match) fields[match[1]] = parseValue(match[2]);
  }
  return fields;
}

export function parseIssue(text, file) {
  const match = FRONTMATTER.exec(text);
  const fields = match ? parseFields(match[1]) : {};
  return {
    id: fields.id || file.replace(/\.md$/, ""),
    title: fields.title || file,
    status: fields.status || "backlog",
    priority: Number(fields.priority) || 0,
    order: Number.isFinite(parseFloat(fields.order)) ? parseFloat(fields.order) : null,
    labels: asList(fields.labels),
    blockedBy: asList(fields.blocked_by),
    branch: fields.branch || null,
    created: fields.created || null,
    body: (match ? text.slice(match[0].length) : text).trim(),
    file,
  };
}

// Replaces each field's line in the frontmatter, or adds it at the end.
export function withFields(text, fields) {
  const match = FRONTMATTER.exec(text);
  if (!match) throw new Error("The issue has no frontmatter");
  let frontmatter = match[1];
  for (const [key, value] of Object.entries(fields)) {
    const line = `${key}: ${value}`, existing = new RegExp(`^${key}:.*$`, "m");
    frontmatter = existing.test(frontmatter) ? frontmatter.replace(existing, () => line) : `${frontmatter}\n${line}`;
  }
  return `---\n${frontmatter}${text.slice(4 + match[1].length)}`;
}

// Replaces everything after the frontmatter, leaving one blank line between them.
export function withBody(text, body) {
  const match = FRONTMATTER.exec(text);
  if (!match) throw new Error("The issue has no frontmatter");
  return `---\n${match[1]}\n---\n\n${body.trim()}\n`;
}

// Every worktree of a repository shares its main checkout's issues/, so all of them show the same
// state and issue changes are committed on main.
export async function localTracker({ root: projectRoot, on }) {
  const root = await mainCheckout(projectRoot, on);
  const folder = `${root}/issues`;
  const exists = await exec("test", ["-d", folder], { on }).catch(() => null);
  if (exists?.code !== 0) return null;

  async function issueFiles() {
    const listing = await exec("ls", ["-1", folder], { on });
    if (listing.code !== 0) throw new Error(listing.stderr.trim());
    return listing.stdout.split("\n").filter((name) => ISSUE_FILE.test(name));
  }

  async function readIssue(file) {
    const text = await readTextFile(`${folder}/${file}`, { on });
    return text === null ? null : { ...parseIssue(text, file), path: `${folder}/${file}` };
  }

  async function list() {
    return (await Promise.all((await issueFiles()).map(readIssue))).filter(Boolean);
  }

  async function commitIssues(issues, message) {
    const files = issues.map((issue) => `issues/${issue.file}`);
    const commit = await exec("git", ["commit", "-m", message, "--", ...files], { cwd: root });
    if (commit.code !== 0) throw new Error(commit.stderr.trim() || `git commit failed for ${files.join(", ")}`);
  }

  // Changes undone before their commit leave nothing to commit, so only changed files go in.
  async function changedIssues(issues) {
    const changed = [];
    for (const issue of issues) {
      const diff = await exec("git", ["diff", "--quiet", "HEAD", "--", `issues/${issue.file}`], { cwd: root });
      if (diff.code === 1) changed.push(issue);
    }
    return changed;
  }

  const sortedIds = (issues) => issues.map((issue) => issue.id).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  async function commitStatus(issue, status, verb) {
    await tracker.update(issue, { status });
    await commitIssues([issue], `docs(issues): ${verb} ${issue.id}`);
  }

  const tracker = {
    kind: "local",
    name: "issues/",
    writable: on == null,
    // issues/ files have no review state: review happens on the branch.
    statuses: STATUSES.filter((status) => status !== "in-review"),
    list,
    async get(id) {
      return (await list()).find((issue) => issue.id === id) ?? null;
    },
    // A new body only saves over the body `issue` was read with, so edits made on disk meanwhile
    // are never overwritten.
    async update(issue, { body, ...fields }) {
      const path = `${folder}/${issue.file}`, text = await readTextFile(path);
      if (text === null) throw new Error(`${issue.file} no longer exists`);
      let next = Object.keys(fields).length ? withFields(text, fields) : text;
      if (body !== undefined) {
        if (parseIssue(text, issue.file).body !== issue.body) throw new Error(`${issue.id} changed on disk while you were editing it`);
        next = withBody(next, body);
      }
      await writeTextFile(path, next, text);
    },
    // Committed, so the worktree branched next starts with the status too and merging it back
    // never meets an uncommitted change to the issue file.
    async start(issue) {
      await commitStatus(issue, "in-progress", "start");
    },
    async finish(issue) {
      await commitStatus(issue, "done", "finish");
    },
    async commitChecklists(issues) {
      const changed = await changedIssues(issues);
      if (!changed.length) return;
      const ids = sortedIds(changed);
      await commitIssues(changed, `docs(issues): update the ${ids.join(", ")} checklist${ids.length > 1 ? "s" : ""}`);
    },
    changed: on == null ? () => watchFolder(folder) : null,
  };
  return tracker;
}
