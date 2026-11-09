// The last list each scope of a polled tracker showed, so the panel can show it at once while a fresh
// one loads. Kept in memory and in the app's data folder, so it outlives a restart of Herdr.
import { appHome, exec, readTextFile, writeTextFile } from "herdr";
import { fileKey } from "./file-key.js";

const folder = () => `${appHome()}/data/issues/lists`;
const pathFor = (key) => `${folder()}/${fileKey(key)}.json`;

// key → { issues, text }: the list and the JSON last written for it.
const lists = new Map();

export async function lastList(key) {
  if (!lists.has(key)) {
    const text = await readTextFile(pathFor(key)).catch(() => null);
    let issues = null;
    try { issues = text ? JSON.parse(text) : null; } catch { /* a damaged cache is no cache */ }
    lists.set(key, { issues, text });
  }
  return lists.get(key).issues;
}

// Writes only a list that changed, so polling an unchanged scope touches nothing on disk.
export async function rememberList(key, issues) {
  const text = JSON.stringify(issues);
  if (lists.get(key)?.text === text) return;
  lists.set(key, { issues, text });
  await exec("mkdir", ["-p", folder()]);
  const path = pathFor(key);
  await writeTextFile(path, text, await readTextFile(path).catch(() => null));
}
