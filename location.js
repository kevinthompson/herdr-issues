import { spaces, panes, focused, exec } from "herdr";

// Where the person is working: the focused pane's folder, else the active space's.
// `on` is the machine that folder lives on (null for this computer).
export function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on };
}

// The git repository's top folder, or the folder itself outside a repository.
export async function projectRoot({ cwd, on }) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
  return top?.code === 0 ? top.stdout.trim() : cwd;
}
