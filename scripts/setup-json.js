#!/usr/bin/env node
// The JSON reading and editing `setup` does, so installing needs only node and not jq.
//
//   marketplace-path <name>           prints the path of the named marketplace in `claude plugin marketplace list --json` on stdin
//   plugin-installed <id>             succeeds when `claude plugin list --json` on stdin lists the plugin
//   merge-keys <keys.json> <mod keys> adds each mod key the person hasn't bound, printing one line per key kept;
//                                     exits 0 after adding keys and 10 when the file already had them
//   shows-mod <layout>                succeeds when the layout shows the issues mod
//   has-panel-body <layout>           succeeds when the layout has a panel-body node
//   shipped-layouts <installed.json>  prints the name of each layout Herdr ships
//   add-panel <layout>                adds the issues block in a column of its own beside the panel holding panel-body
//   move-panel <layout>               moves an issues block an earlier setup put in panel-body into a column of its own;
//                                     exits 0 after moving it and 10 when there was none to move
//   copy-layout <from> <to> <version> copies a layout, records what it was cloned from, and adds the issues block
//
// Files are written through a symlink in place of replacing the link.

import { readFileSync, writeFileSync } from "node:fs";

const keysAddedExitCode = 0;
const keysUnchangedExitCode = 10;
const panelMovedExitCode = 0;
const panelUnmovedExitCode = 10;
const issuesBlock = { id: "issues", type: "block", content: { mod: "issues" } };
// The panel collapses to a 32px strip by resizing this column, so its min mustn't stop it there.
const issuesColumn = { id: "issues-panel", type: "column", size: { px: 368 }, min: 32, max: 900, children: [issuesBlock] };

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const readStdinJson = () => JSON.parse(readFileSync(0, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const sameJson = (first, second) => JSON.stringify(first) === JSON.stringify(second);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// Every object in the value, at any depth, the value itself included.
function* objectsIn(value) {
  if (isObject(value)) yield value;
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) yield* objectsIn(child);
  }
}

const anyObject = (value, test) => {
  for (const object of objectsIn(value)) if (test(object)) return true;
  return false;
};

const showsMod = (layout) => anyObject(layout, (object) => object.content?.mod === "issues");
const hasPanelBody = (layout) => anyObject(layout, (object) => object.id === "panel-body");

function mergeKeys(mine, mod) {
  const kept = [];
  const merged = structuredClone(mine);
  for (const [section, keys] of Object.entries(mod)) {
    for (const [key, action] of Object.entries(keys)) {
      const bound = mine[section]?.[key];
      if (bound == null) {
        merged[section] = isObject(merged[section]) ? merged[section] : {};
        merged[section][key] = action;
      } else if (!sameJson(bound, action)) {
        kept.push(`setup: kept your ${key} in ${section} (${JSON.stringify(bound)}); the mod expects ${JSON.stringify(action)}`);
      }
    }
  }
  return { merged, kept };
}

const isIssuesBlock = (node) => node?.content?.mod === "issues";

const holdsPanelBodyDirectly = (node) => Array.isArray(node?.children) && node.children.some((child) => child?.id === "panel-body");

// Places a column holding the issues block right after the node whose child is panel-body.
function addPanel(layout) {
  for (const object of objectsIn(layout)) {
    const children = Array.isArray(object.children) ? object.children : [];
    const panelIndex = children.findIndex(holdsPanelBodyDirectly);
    if (panelIndex === -1) continue;
    children.splice(panelIndex + 1, 0, structuredClone(issuesColumn));
    break;
  }
  return layout;
}

// Takes the issues block out of panel-body, answering whether there was one. A stack showing the block
// shows its first remaining child instead.
function removeFromPanelBody(layout) {
  let removed = false;
  for (const object of objectsIn(layout)) {
    if (object.id !== "panel-body" || !Array.isArray(object.children) || !object.children.some(isIssuesBlock)) continue;
    const shown = object.children.find((child) => child?.id === object.active);
    object.children = object.children.filter((child) => !isIssuesBlock(child));
    if (isIssuesBlock(shown)) object.active = object.children[0]?.id;
    removed = true;
  }
  return removed;
}

function shippedLayoutNames(installedPath) {
  let installed;
  try {
    installed = readJson(installedPath);
  } catch {
    return [];
  }
  return Object.keys(installed)
    .filter((key) => key.startsWith("layout:"))
    .map((key) => key.slice("layout:".length));
}

const commands = {
  "marketplace-path": (name) => {
    const marketplace = readStdinJson().find((entry) => entry.name === name);
    const path = marketplace?.path ?? marketplace?.installLocation;
    if (path) console.log(path);
  },
  "plugin-installed": (id) => (readStdinJson().some((plugin) => plugin.id === id) ? 0 : 1),
  "merge-keys": (keysPath, modKeysPath) => {
    const mine = readJson(keysPath);
    const { merged, kept } = mergeKeys(mine, readJson(modKeysPath));
    if (kept.length) console.log(kept.join("\n"));
    if (sameJson(mine, merged)) return keysUnchangedExitCode;
    writeJson(keysPath, merged);
    return keysAddedExitCode;
  },
  "shows-mod": (layoutPath) => (showsMod(readJson(layoutPath)) ? 0 : 1),
  "has-panel-body": (layoutPath) => (hasPanelBody(readJson(layoutPath)) ? 0 : 1),
  "shipped-layouts": (installedPath) => {
    const names = shippedLayoutNames(installedPath);
    if (names.length) console.log(names.join("\n"));
  },
  "add-panel": (layoutPath) => writeJson(layoutPath, addPanel(readJson(layoutPath))),
  "move-panel": (layoutPath) => {
    const layout = readJson(layoutPath);
    if (!removeFromPanelBody(layout)) return panelUnmovedExitCode;
    writeJson(layoutPath, addPanel(layout));
    return panelMovedExitCode;
  },
  "copy-layout": (fromPath, toPath, version) => {
    const copy = { ...readJson(fromPath), cloned_from: { name: "main", version } };
    writeJson(toPath, addPanel(copy));
  },
};

const [command, ...args] = process.argv.slice(2);
if (!Object.hasOwn(commands, command)) {
  console.error(`setup-json: unknown command ${command ?? "(none)"}`);
  process.exit(2);
}
try {
  process.exitCode = commands[command](...args) ?? 0;
} catch (error) {
  // A file that doesn't parse answers no to a yes-or-no question, as jq -e did.
  if (["shows-mod", "has-panel-body"].includes(command)) process.exitCode = 1;
  else throw error;
}
