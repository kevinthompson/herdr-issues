// Temporary git repositories for one test, removed when it ends.
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// A folder for the test's repositories, removed when the test ends.
export function temporaryFolder(t) {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "herdr-issues-test-")));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  return folder;
}

// A repository at <folder>/<name> on `branch`, with one commit.
export function createRepository(folder, { name = "repo", branch = "main" } = {}) {
  const path = join(folder, name);
  git(folder, "init", "-q", "-b", branch, path);
  commitFile(path, "README", "first\n");
  return path;
}

export function commitFile(repository, file, text, message = `change ${file}`) {
  writeFileSync(join(repository, file), text);
  git(repository, "add", file);
  git(repository, "commit", "-q", "-m", message);
}

// A bare repository holding `branch`, and a clone of it whose origin/HEAD names that branch.
export function createClonedRepository(folder, { branch = "main" } = {}) {
  const seed = createRepository(folder, { name: "seed", branch });
  const origin = join(folder, "origin.git");
  git(folder, "clone", "-q", "--bare", seed, origin);
  const clone = join(folder, "clone");
  git(folder, "clone", "-q", origin, clone);
  return { origin, clone };
}
