// `issues tab`: the Herdr tab holding this session's terminal ($HC_TERMINAL_ID), and renaming it after the
// issue the session works, as /issues:work does. A tab the person named keeps its name. `issues complete` labels
// the terminal and marks the tab, whatever its name, with ✅ once the session's work is finished.
import { exec } from "herdr";

async function herdrApp(args) {
  const result = await exec("herdr-app", args);
  if (result.code !== 0) throw new Error(`herdr-app ${args.join(" ")}: ${(result.stderr || result.stdout).trim().split("\n").pop()}`);
  return result.stdout;
}

export async function sessionTab(terminal = process.env.HC_TERMINAL_ID) {
  if (!terminal) throw new Error("HC_TERMINAL_ID is empty; run this in a Herdr terminal");
  const { spaces } = JSON.parse(await herdrApp(["ls"]));
  for (const space of spaces) {
    const tab = space.tabs.find((tab) => tab.terminals.some((held) => held.terminal === terminal));
    if (tab) return { id: tab.id, name: tab.name, space: space.name, terminal };
  }
  throw new Error(`no Herdr tab holds terminal ${terminal}`);
}

// Herdr names a new tab after its program or its position, so either means nobody chose the name.
export const isUnnamed = (name) => name === "Claude" || /^\d+$/.test(name);

// The issue's ID goes in the name only when the space's name doesn't already show which issue it is.
export const issueTabName = ({ tab, issueId, issueSpace, name }) =>
  tab.space === issueSpace ? name : `${issueId} ${name}`;

export async function renameTab(tab, name) {
  await herdrApp(["do", "tab.rename", "--id", tab.id, "--name", name]);
}

export const COMPLETE_MARK = "✅ ";

export const completedTabName = (name) => (name.startsWith(COMPLETE_MARK) ? name : `${COMPLETE_MARK}${name}`);

export async function labelComplete(tab, issueId) {
  const result = await exec("hc", ["label", tab.terminal, `issues.complete=${issueId}`]);
  if (result.code !== 0) throw new Error(`hc label: ${(result.stderr || result.stdout).trim().split("\n").pop()}`);
}
