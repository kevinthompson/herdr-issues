// The `herdr` module for the issues CLI (bin/issues), which runs the panel's modules in Node rather than in
// the app. It exports every name those modules import, following the app's contract in gpui-kit.d.ts, for
// this computer only: a call with a machine (`on`) rejects, and there are no spaces or panes until readLayout
// reads them from the running app.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

function refuseRemote(on) {
  if (on != null) throw new Error(`the issues CLI can't reach another machine (${on})`);
}

export const home = () => homedir();
export const appHome = () => process.env.HERDR_APP_HOME || join(homedir(), ".config/herdr-app");

// Resolves with the exit code and output, even when the program fails; rejects when it can't start or runs too long.
export function exec(command, args = [], { cwd, on = null, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    refuseRemote(on);
    const options = { cwd, timeout: Math.min(timeout, MAX_TIMEOUT_MS), maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" };
    execFile(command, args, options, (error, stdout, stderr) => {
      if (!error) return resolve({ code: 0, stdout, stderr });
      if (typeof error.code === "number") return resolve({ code: error.code, stdout, stderr });
      reject(error);
    });
  });
}

export async function readTextFile(path, { on = null } = {}) {
  refuseRemote(on);
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// Writes only when the file still holds `expected` (null: when it doesn't exist), replacing it atomically.
export async function writeTextFile(path, text, expected) {
  const current = await readTextFile(path);
  if (current !== expected) throw new Error(`${path} changed since it was read`);
  const temporary = join(dirname(path), `.${randomBytes(6).toString("hex")}.tmp`);
  await writeFile(temporary, text, "utf8");
  await rename(temporary, path);
  return null;
}

let layout = { spaces: [], panes: [] };

async function listJson(command, args) {
  const result = await exec(command, args);
  if (result.code !== 0) throw new Error(`${command} ${args.join(" ")}: ${(result.stderr || result.stdout).trim().split("\n").pop()}`);
  return JSON.parse(result.stdout);
}

// The app's spaces and panes are live, so `spaces` and `panes` answer synchronously; the CLI reads them
// from the running app here, before calling a module that needs them.
export async function readLayout() {
  const [listing, terminals] = await Promise.all([listJson("herdr-app", ["ls"]), listJson("hc", ["ls", "--json"])]);
  const folderOf = new Map(terminals.terminals.map((terminal) => [terminal.address, terminal.cwd]));
  const panes = listing.spaces.flatMap((space) => space.tabs.flatMap((tab) => tab.terminals.map((terminal) => ({
    pane: terminal.pane, terminal: terminal.terminal, tab: tab.id, cwd: folderOf.get(terminal.terminal) ?? null,
  }))));
  layout = { spaces: listing.spaces, panes };
}

export const spaces = () => layout.spaces;
export const panes = () => layout.panes;
export const focused = () => null;
