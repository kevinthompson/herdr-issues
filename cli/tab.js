// `issues tab`: the Herdr tab holding this session's terminal ($HC_TERMINAL_ID), and renaming it after the
// issue the session works, as /issues:work does, prefixed with the issue's ID unless the space's name ends with the
// issue's space name (space-name.js). A tab the person named keeps its name. `issues mark` renames the session's
// space with one of space-name.js's marks for whether the session is working, waiting on the person or done. `issues complete` labels
// the terminal once the session is done working and has handed off to the person, whether or not its branch has
// been merged, which `issues complete --cancel` withdraws when the person asks for more changes, also clearing the ✅ that
// earlier versions put before the tab's name, and `issues close` labels it to ask the panel to close the session's
// space, which `issues close --cancel` withdraws.
import { exec } from "herdr";
import { spaceNameEndsWith } from "../mod/space-name.js";

async function herdrApp(args) {
  const result = await exec("herdr-app", args);
  if (result.code !== 0) throw new Error(`herdr-app ${args.join(" ")}: ${(result.stderr || result.stdout).trim().split("\n").pop()}`);
  return result.stdout;
}

export async function sessionTab(terminal = process.env.HC_TERMINAL_ID) {
  if (!terminal) throw new Error("HC_TERMINAL_ID is empty; run this in a Herdr terminal");
  return tabHolding(terminal, JSON.parse(await herdrApp(["ls"])));
}

// The session's tab, or null outside Herdr: with $HC_TERMINAL_ID empty or no herdr-app to run.
export async function herdrSessionTab(terminal = process.env.HC_TERMINAL_ID) {
  if (!terminal) return null;
  let listing;
  try {
    listing = await herdrApp(["ls"]);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  return tabHolding(terminal, JSON.parse(listing));
}

function tabHolding(terminal, { spaces }) {
  for (const space of spaces) {
    const tab = space.tabs.find((tab) => tab.terminals.some((held) => held.terminal === terminal));
    if (tab) return { id: tab.id, name: tab.name, space: space.name, spaceId: space.id, terminal };
  }
  throw new Error(`no Herdr tab holds terminal ${terminal}`);
}

// Herdr names a new tab after its program or its position, so either means nobody chose the name.
export const isUnnamed = (name) => name === "Claude" || /^\d+$/.test(name);

// The issue's ID goes in the name only when the space's name doesn't already show which issue it is.
export const issueTabName = ({ tab, issueId, issueSpace, name }) =>
  spaceNameEndsWith(tab.space, issueSpace) ? name : `${issueId} ${name}`;

export async function renameTab(tab, name) {
  await herdrApp(["do", "tab.rename", "--id", tab.id, "--name", name]);
}

export async function renameSpace(tab, name) {
  await herdrApp(["do", "space.rename", "--id", tab.spaceId, "--name", name]);
}

// Earlier versions of `issues complete` put this before the tab's name.
const COMPLETE_MARK = "✅ ";

export const uncompletedTabName = (name) => (name.startsWith(COMPLETE_MARK) ? name.slice(COMPLETE_MARK.length) : name);

async function labelTerminal(terminal, label) {
  const result = await exec("hc", ["label", terminal, label]);
  if (result.code !== 0) throw new Error(`hc label: ${(result.stderr || result.stdout).trim().split("\n").pop()}`);
}

export const labelComplete = (tab, issueId) => labelTerminal(tab.terminal, `issues.complete=${issueId}`);

export const clearComplete = (tab) => labelTerminal(tab.terminal, "issues.complete=");

// The panel watches for this label and closes the space once the terminal is idle (mod/close-request.js).
export const labelCloseRequest = (tab, issueId) => labelTerminal(tab.terminal, `issues.close=${issueId}`);

// hc removes a label set to an empty value.
export const clearCloseRequest = (tab) => labelTerminal(tab.terminal, "issues.close=");
