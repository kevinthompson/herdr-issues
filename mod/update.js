// Whether the panel offers to update the checkout the issues mod runs from, such as the README install command's
// ~/.local/share/herdr-issues, which only running its ./install updates. The checkout is found through the mod's
// link in Herdr's mods folder. The offer stands only when ./install would succeed: the checkout is on main with no
// local changes, origin's main, fetched again, has commits it lacks, and its HEAD is an ancestor of origin/main, so a
// development checkout on a feature branch never sees it. A fetch that fails, such as offline, offers nothing. The
// panel's footer shows the offer (main.js), and its Update opens a tab running ./install (installTab).
// The offer's state is ~/.config/herdr-app/issues-update.json, { "dismissed": "<commit>", "updating": "<commit>" }:
// dismissed is the origin/main commit whose offer the person dismissed, which stays hidden until origin/main moves
// on from it, and updating is the commit Update installs, which tells the panel loaded afterward that the update
// finished (finishedUpdate).
import { appHome, exec, readTextFile, writeTextFile } from "herdr";

const FETCH_TIMEOUT_MS = 60_000;
export const modLinkPath = () => `${appHome()}/mods/issues`;
export const updateStatePath = () => `${appHome()}/issues-update.json`;

const git = (checkout, args, options) => exec("git", ["-C", checkout, ...args], options).catch(() => null);
const succeeds = async (checkout, args, options) => (await git(checkout, args, options))?.code === 0;
async function output(checkout, args) {
  const result = await git(checkout, args);
  return result?.code === 0 ? result.stdout.trim() : null;
}

// The checkout the mod's link points into, or null when the mod isn't linked into a git checkout. The link
// points at <checkout>/mod, or, from older installs, at the checkout itself.
export const modCheckout = () => output(modLinkPath(), ["rev-parse", "--show-toplevel"]);

// What ./install would bring into `checkout`: { checkout, commit, count }, with origin/main's commit and how many
// commits HEAD lacks, or null when it's up to date, ./install would refuse or the fetch fails.
export async function availableUpdate(checkout) {
  if ((await output(checkout, ["symbolic-ref", "--quiet", "--short", "HEAD"])) !== "main") return null;
  if ((await output(checkout, ["status", "--porcelain"])) !== "") return null;
  if (!(await succeeds(checkout, ["fetch", "--quiet", "origin", "main"], { timeout: FETCH_TIMEOUT_MS }))) return null;
  if (!(await succeeds(checkout, ["merge-base", "--is-ancestor", "HEAD", "origin/main"]))) return null;
  const count = Number(await output(checkout, ["rev-list", "--count", "HEAD..origin/main"]));
  if (!count) return null;
  return { checkout, commit: await output(checkout, ["rev-parse", "origin/main"]), count };
}

async function readState() {
  const text = await readTextFile(updateStatePath()).catch(() => null);
  try {
    return { text, state: JSON.parse(text ?? "{}") ?? {} };
  } catch {
    return { text, state: {} };
  }
}

async function changeState(change) {
  const { text, state } = await readState();
  await writeTextFile(updateStatePath(), `${JSON.stringify({ ...state, ...change })}\n`, text);
}

// The update the panel offers for the mod's checkout: availableUpdate's, unless the person dismissed its commit.
export async function offeredUpdate() {
  const checkout = await modCheckout();
  const update = checkout && (await availableUpdate(checkout));
  if (!update) return null;
  const { state } = await readState();
  return state.dismissed === update.commit ? null : update;
}

export const dismissUpdate = (update) => changeState({ dismissed: update.commit });

// ./install and setup can ask questions, so they run in a terminal. Once they succeed, touching the mod's link
// reloads the panel, which setup's relink alone may do before setup has finished; the person's shell then keeps
// the output on screen.
const RUN_INSTALL = `"$1" && touch -h "$2"; exec "\${SHELL:-/bin/sh}" -l`;

// The tab Update opens, as tab.new's { name, folder, argv }, after noting the commit it installs.
export async function installTab(update) {
  await changeState({ updating: update.commit });
  return {
    name: "Update issues",
    folder: update.checkout,
    argv: ["sh", "-c", RUN_INSTALL, "sh", `${update.checkout}/install`, modLinkPath()],
  };
}

// Whether the update installTab started has reached the mod's checkout, answered true only once.
export async function finishedUpdate() {
  const { state } = await readState();
  if (!state.updating) return false;
  const checkout = await modCheckout();
  if (!checkout || !(await succeeds(checkout, ["merge-base", "--is-ancestor", state.updating, "HEAD"]))) return false;
  await changeState({ updating: null });
  return true;
}
