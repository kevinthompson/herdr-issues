import { spaces, panes, focused, exec } from "herdr";
import { cachedLookup } from "./lookups.js";

// Where the person is working: the focused pane's folder, else the active space's.
// `on` is the machine that folder lives on (null for this computer).
export function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on };
}

// A folder's repository and a checkout's main checkout don't change, so each is looked up once. A folder found
// outside a repository is asked again, since it may become one.
const cachedRoot = cachedLookup((root) => root !== null);
const cachedMainCheckout = cachedLookup((main) => main !== null);

// Makes `folder` on this computer a git repository, throwing git's last error line when it can't.
export async function initializeRepository(folder) {
  const result = await exec("git", ["init"], { cwd: folder }).catch((e) => ({ code: 1, stderr: e.message ?? "" }));
  if (result.code !== 0) throw new Error(result.stderr.trim().split("\n").pop() || "git init failed");
}

// The git repository's top folder, or null outside a repository.
export function repositoryRoot({ cwd, on }) {
  return cachedRoot(`${on}\n${cwd}`, async () => {
    const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
    return top?.code === 0 ? top.stdout.trim() : null;
  });
}

// The repository's main checkout: the first `git worktree list` entry, which a linked worktree is not.
export async function mainCheckout(projectRoot, on) {
  const main = await cachedMainCheckout(`${on}\n${projectRoot}`, async () => {
    const listing = await exec("git", ["worktree", "list", "--porcelain"], { cwd: projectRoot, on }).catch(() => null);
    return (listing?.code === 0 && /^worktree (.*)$/m.exec(listing.stdout)?.[1]) || null;
  });
  return main ?? projectRoot;
}
