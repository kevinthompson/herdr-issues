// The last list each scope of a polled tracker showed, so the panel can show it at once while a fresh
// one loads. Kept in memory and in the app's data folder, so it outlives a restart of Herdr.
import { appHome, exec, readTextFile, writeTextFile } from "herdr";
import { fileKey } from "./file-key.js";

// A list fetched this recently is reused rather than asked for again.
const REUSE_LIST_MS = 10 * 1000;

const folder = () => `${appHome()}/data/issues/lists`;
const pathFor = (key) => `${folder()}/${fileKey(key)}.json`;

// key → { issues, text, fetchedAt }: the list, the JSON last written for it, and when it was fetched.
// Module state is shared by every copy of the panel, so they reuse each other's lists.
const lists = new Map();
// key → the list request under way, which copies asking at the same time share.
const requests = new Map();

export async function lastList(key) {
  if (!lists.has(key)) {
    const text = await readTextFile(pathFor(key)).catch(() => null);
    let issues = null;
    try {
      issues = text ? JSON.parse(text) : null;
    } catch {
      /* a damaged cache is no cache */
    }
    lists.set(key, { issues, text, fetchedAt: 0 });
  }
  return lists.get(key).issues;
}

// The list last fetched or read for the key in this run of Herdr, or null, without waiting on anything.
export const rememberedList = (key) => lists.get(key)?.issues ?? null;

// Writes only a list that changed, so polling an unchanged scope touches nothing on disk.
export async function rememberList(key, issues) {
  const text = JSON.stringify(issues),
    unchanged = lists.get(key)?.text === text;
  lists.set(key, { issues, text, fetchedAt: Date.now() });
  if (unchanged) return;
  await exec("mkdir", ["-p", folder()]);
  const path = pathFor(key);
  await writeTextFile(path, text, await readTextFile(path).catch(() => null));
}

// Lists the scope and remembers the list. With `reuse`, a list fetched in the last REUSE_LIST_MS, or one
// still being fetched, is used instead of asking the tracker again.
export function fetchList(key, list, reuse) {
  const fetchedAt = lists.get(key)?.fetchedAt ?? 0;
  if (reuse && requests.has(key)) return requests.get(key);
  if (reuse && Date.now() - fetchedAt < REUSE_LIST_MS) return Promise.resolve(lists.get(key).issues);
  const request = list().then((issues) => {
    rememberList(key, issues).catch(() => {});
    return issues;
  });
  requests.set(key, request);
  request
    .catch(() => {})
    .finally(() => {
      if (requests.get(key) === request) requests.delete(key);
    });
  return request;
}
