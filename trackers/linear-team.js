// The Linear team that owns a Planning Center repository with no entry in linear.json: the team of most
// of the issues its recent pull requests are attached to. Saved per repository in the app's data
// folder, so a new space finds it at once; a repository with no answer is asked again a day later.
import { appHome, exec, readTextFile, writeTextFile } from "herdr";

const RECENT_PULL_REQUESTS = 50;
// Fewer attached pull requests than this say too little about who owns the repository.
const MIN_PULL_REQUESTS = 3;
const DETECTED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UNDETECTED_TTL_MS = 24 * 60 * 60 * 1000;

const PULL_REQUEST_TEAMS = `query($prefix: String!, $first: Int!) {
  attachments(first: $first, orderBy: createdAt, filter: { url: { startsWith: $prefix } }) {
    nodes { issue { team { key } } } } }`;

const savedPath = () => `${appHome()}/data/issues/linear-teams.json`;
// root → { team, at }, team null when none was found.
let saved = null;

async function readSaved() {
  if (!saved) {
    try { saved = JSON.parse((await readTextFile(savedPath())) ?? "{}"); } catch { saved = {}; }
  }
  return saved;
}

async function save(root, team) {
  const previous = await readTextFile(savedPath()).catch(() => null);
  let current = {};
  try { current = JSON.parse(previous ?? "{}"); } catch { /* a damaged file is rewritten */ }
  saved = { ...current, [root]: { team, at: Date.now() } };
  await exec("mkdir", ["-p", `${appHome()}/data/issues`]);
  await writeTextFile(savedPath(), JSON.stringify(saved, null, 2), previous);
}

// The repository's name when origin is in the planningcenter GitHub organization, else null.
export async function planningCenterRepoName(root) {
  const origin = await exec("git", ["remote", "get-url", "origin"], { cwd: root }).catch(() => null);
  if (origin?.code !== 0) return null;
  return /github\.com[:/]planningcenter\/([^/\s]+?)(?:\.git)?\s*$/.exec(origin.stdout)?.[1] ?? null;
}

function mostCommonTeam(attachments) {
  const counts = new Map();
  for (const { issue } of attachments) if (issue) counts.set(issue.team.key, (counts.get(issue.team.key) ?? 0) + 1);
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total < MIN_PULL_REQUESTS) return null;
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

// The team key, or null when Linear can't tell. A failed request answers null without saving it.
export async function detectedTeam(root, repoName, linear) {
  const entry = (await readSaved())[root];
  if (entry && Date.now() - entry.at < (entry.team ? DETECTED_TTL_MS : UNDETECTED_TTL_MS)) return entry.team;
  const prefix = `https://github.com/planningcenter/${repoName}/pull/`;
  const answer = await linear(PULL_REQUEST_TEAMS, { prefix, first: RECENT_PULL_REQUESTS }).catch(() => null);
  if (!answer) return entry?.team ?? null;
  const team = mostCommonTeam(answer.attachments.nodes);
  await save(root, team).catch(() => {});
  return team;
}
