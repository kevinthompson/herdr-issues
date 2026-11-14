// `issues worktree`: opens a branch in a worktree of the repository holding a folder and, in Herdr, shows it
// in a space nested under the repository's space. The worktree is the branch's existing one, else a new
// checkout at ~/.herdr/worktrees/<repository>/<branch>, where the Herdr app makes its own.
import { spawn } from "node:child_process";
import { access, mkdir, readFile, rename, rmdir, stat, writeFile } from "node:fs/promises";
import { rmdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { exec, home, readLayout } from "./herdr.js";
import { spaceShowing, worktreeFor } from "../mod/worktree.js";
import { trackerSetting } from "../mod/trackers/setting.js";

const GIT_TIMEOUT_MS = 10 * 60 * 1000;
const RECENT_FETCH_MS = 60 * 1000;
const FETCH_RETRY_DELAY_MS = 2000;
const LOCK_POLL_MS = 200;
const FETCHED_MARKER = "issues-worktree-fetched";
const SPACES_LOCK = "issues-worktree-spaces.lock";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lastLine = (text) => text.trim().split("\n").pop();
const exists = (path) => access(path).then(() => true, () => false);
const warn = (message) => console.error(`issues: ${message}`);

async function git(cwd, args) {
  const result = await exec("git", args, { cwd, timeout: GIT_TIMEOUT_MS });
  return { ok: result.code === 0, out: result.stdout.trim(), err: result.stderr.trim() };
}

async function gitOrFail(cwd, args) {
  const result = await git(cwd, args);
  if (!result.ok) throw new Error(lastLine(result.err) || `git ${args[0]} failed`);
  return result.out;
}

const hasRef = async (cwd, ref) => (await git(cwd, ["show-ref", "--quiet", "--verify", ref])).ok;

async function isInstalled(command) {
  const result = await exec("sh", ["-c", 'command -v "$1"', "sh", command]).catch(() => null);
  return result?.code === 0;
}

const branchFolderName = (branch) => branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

function timestamp(date) {
  const parts = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
  return parts.map((part) => String(part).padStart(2, "0")).join("");
}

// A removed worktree's background setup can recreate its folder after the removal. No checkout lives there.
async function trashLeftover(path) {
  if (!(await exists(path)) || await exists(join(path, ".git"))) return;
  const trashed = join(home(), ".Trash", `${basename(path)}-${timestamp(new Date())}`);
  await rename(path, trashed);
  console.log(`moved ${path}, left over from a removed worktree, to ${trashed}`);
}

async function fetchedRecently(marker) {
  const marked = await stat(marker).catch(() => null);
  return Boolean(marked) && Date.now() - marked.mtimeMs < RECENT_FETCH_MS;
}

// Concurrent fetches in one repository can fail to lock refs, so a failure waits for the other fetch and
// retries once. A repository without origin, such as one tracked in Beads, has nothing to fetch.
async function fetchOrigin(main, marker) {
  if (await fetchedRecently(marker)) return;
  if (!(await git(main, ["remote", "get-url", "origin"])).ok) return;
  let fetch = await git(main, ["fetch", "-q", "origin"]);
  if (!fetch.ok) {
    await sleep(FETCH_RETRY_DELAY_MS);
    if (await fetchedRecently(marker)) return;
    fetch = await git(main, ["fetch", "-q", "origin"]);
    if (!fetch.ok) throw new Error(`couldn't fetch origin: ${lastLine(fetch.err)}`);
  }
  await writeFile(marker, "");
}

// The newer of the local default branch and origin's copy, by ancestry: where others push, origin's is
// ahead; where branches merge locally first, the local one is.
async function newerDefault(main, localDefault, originDefault) {
  if (!(await hasRef(main, `refs/remotes/${originDefault}`))) return localDefault;
  if ((await git(main, ["merge-base", "--is-ancestor", localDefault, originDefault])).ok) return originDefault;
  if (!(await git(main, ["merge-base", "--is-ancestor", originDefault, localDefault])).ok) {
    warn(`${localDefault} and ${originDefault} have diverged; starting from ${localDefault}`);
  }
  return localDefault;
}

// A new branch starts from origin's default branch, fetched unless that happened in the last minute. A
// branch that can't be on origin yet (isNew) skips the fetch, and it and a branch in a repository without
// origin start from whichever of the local default branch and origin's copy from the last fetch is newer.
async function createWorktree({ branch, isNew, main, common, path }) {
  await trashLeftover(path);
  if (!isNew) await fetchOrigin(main, join(common, FETCHED_MARKER));
  const originDefault = (await git(main, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])).out || "origin/main";
  const localDefault = originDefault.replace(/^origin\//, "");
  if (await hasRef(main, `refs/heads/${branch}`)) {
    return gitOrFail(main, ["worktree", "add", path, branch]);
  }
  if (await hasRef(main, `refs/remotes/origin/${branch}`)) {
    return gitOrFail(main, ["worktree", "add", "--track", "-b", branch, path, `origin/${branch}`]);
  }
  let start = originDefault;
  const originHasDefault = await hasRef(main, `refs/remotes/${originDefault}`);
  if ((isNew || !originHasDefault) && await hasRef(main, `refs/heads/${localDefault}`)) {
    start = await newerDefault(main, localDefault, originDefault);
  }
  return gitOrFail(main, ["worktree", "add", "--no-track", "-b", branch, path, start]);
}

async function checkoutFolder({ branch, isNew, main, common }) {
  if ((await git(main, ["branch", "--show-current"])).out === branch) {
    throw new Error(`${branch} is checked out in the main checkout; switch it to main first`);
  }
  const existing = await worktreeFor(branch, { root: main, on: null });
  if (existing) {
    console.log(`reusing ${existing.path}`);
    return { path: existing.path, created: false };
  }
  const path = join(home(), ".herdr/worktrees", basename(main), branchFolderName(branch));
  await createWorktree({ branch, isNew, main, common, path });
  return { path, created: true };
}

// The Herdr app starts commands without the person's shell profile, so the login shell supplies its PATH.
function runInLoginShell(command, cwd) {
  return new Promise((resolve) => {
    const shell = spawn(process.env.SHELL || "/bin/sh", ["-lc", command], { cwd, stdio: "inherit" });
    shell.on("error", () => resolve(false));
    shell.on("exit", (code) => resolve(code === 0));
  });
}

// A failed setup keeps the worktree, so the person can finish it by hand.
async function runWorktreeSetup(path, main) {
  const command = (await trackerSetting({ root: main, on: null }))?.worktreeSetup;
  if (!command) return;
  console.log(`running worktreeSetup: ${command}`);
  if (!(await runInLoginShell(command, path))) {
    throw new Error(`worktreeSetup \`${command}\` failed in ${path}; kept the worktree without opening a space`);
  }
}

// A space's shell loads .envrc as soon as it opens. Content already allowed in the main checkout is trusted.
async function allowEnvrc(path, main) {
  if (!(await exists(join(path, ".envrc"))) || !(await isInstalled("direnv"))) return;
  const [worktreeEnvrc, mainEnvrc] = await Promise.all([path, main].map((folder) => readFile(join(folder, ".envrc")).catch(() => null)));
  if (!mainEnvrc || !worktreeEnvrc.equals(mainEnvrc)) {
    console.log(`${path}/.envrc differs from the main checkout's; review it, then run \`direnv allow\` there`);
    return;
  }
  const status = await exec("direnv", ["status", "--json"], { cwd: main });
  const allowed = status.code === 0 ? JSON.parse(status.stdout)?.state?.foundRC?.allowed : null;
  if (allowed === 0) await exec("direnv", ["allow", path]);
}

async function withLock(lock, work) {
  while (!(await mkdir(lock).then(() => true, (error) => { if (error.code === "EEXIST") return false; throw error; }))) {
    await sleep(LOCK_POLL_MS);
  }
  const releaseOnExit = () => { try { rmdirSync(lock); } catch { /* already released */ } };
  const exitOnSignal = () => process.exit(1);
  process.on("exit", releaseOnExit).on("SIGINT", exitOnSignal).on("SIGTERM", exitOnSignal);
  try {
    return await work();
  } finally {
    process.off("exit", releaseOnExit).off("SIGINT", exitOnSignal).off("SIGTERM", exitOnSignal);
    await rmdir(lock).catch(() => null);
  }
}

async function herdrDo(action, params) {
  const result = await exec("herdr-app", ["do", action, JSON.stringify(params)]);
  if (result.code !== 0) throw new Error(`herdr-app do ${action}: ${lastLine(result.stderr || result.stdout)}`);
}

// Selects the space already showing the worktree, or opens one on it, after a space on the main checkout,
// which the Herdr sidebar nests worktree spaces under. Concurrent runs would each see no space on the main
// checkout and open one, so they take turns.
async function showInSpace({ branch, path, main, common, name, claudeMessage }) {
  await withLock(join(common, SPACES_LOCK), async () => {
    await readLayout();
    const worktreeSpace = spaceShowing(path, null);
    if (worktreeSpace) {
      await herdrDo("space.select", { id: worktreeSpace.id });
      console.log(`switched to the space already open on ${branch}`);
      return;
    }
    if (!spaceShowing(main, null)) {
      await herdrDo("space.new", { folder: main });
      console.log(`opened a space on ${main}`);
    }
    const claudeTab = claudeMessage ? { tab: "Claude", argv: ["claude"], task: claudeMessage } : {};
    await herdrDo("space.new", { folder: path, name, ...claudeTab });
    console.log(`opened ${branch} in a Herdr space${claudeMessage ? " with Claude" : ""}`);
  });
}

export async function openWorktree({ cwd, branch, isNew = false, name = branch, claudeMessage = null }) {
  const commonDir = await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!commonDir.ok) throw new Error("not in a git repository");
  const common = commonDir.out, main = dirname(common);
  const { path, created } = await checkoutFolder({ branch, isNew, main, common });
  if (created) await runWorktreeSetup(path, main);
  await allowEnvrc(path, main);
  if (await isInstalled("herdr-app") && await isInstalled("hc")) await showInSpace({ branch, path, main, common, name, claudeMessage });
  console.log(`cd ${path}`);
}
