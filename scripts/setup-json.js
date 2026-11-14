#!/usr/bin/env node
// The JSON reading and editing `setup` and `scripts/demo-setup` do, so they need only node and not jq.
//
//   marketplace-path <name>           prints the path of the named marketplace in `claude plugin marketplace list --json` on stdin
//   plugin-installed <id>             succeeds when `claude plugin list --json` on stdin lists the plugin
//   merge-keys <keys.json> <mod keys> adds each mod key the person hasn't bound, printing one line per key kept;
//                                     exits 0 after adding keys and 10 when the file already had them
//   shows-mod <layout>                succeeds when the layout shows the issues mod
//   has-panel-body <layout>           succeeds when the layout has a panel-body node
//   shipped-layouts <installed.json>  prints the name of each layout Herdr ships
//   add-panel <layout>                adds the issues block to panel-body and weighs the panel beside main
//   copy-layout <from> <to> <version> copies a layout, records what it was cloned from, and adds the issues block
//   set-repo <issues.json> <main checkout> <entry>
//                                     replaces the repository's entry in issues.json with the entry's JSON, under
//                                     its ~ path as trackers/setting.js writes it
//   remove-repos <issues.json> <main checkout>...
//                                     removes the repositories' entries from issues.json
//   spaces-in <folder>...             prints the ID of each space in `herdr-app ls` on stdin showing a folder or
//                                     one inside it
//
// Files are written through a symlink in place of replacing the link.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

const keysAddedExitCode = 0;
const keysUnchangedExitCode = 10;
const issuesBlock = { id: "issues", type: "block", content: { mod: "issues" } };

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

// Herdr stores a divider drag between weighted siblings as weights, so the panel keeps its share after one.
// 5:2 starts the panel near the shipped 368px in a typical window.
function weighPanelBesideMain(layout) {
  for (const object of objectsIn(layout)) {
    const children = Array.isArray(object.children) ? object.children : [];
    const hasMain = children.some((child) => child?.id === "main");
    const fixedPanel = children.some(
      (child) => child?.id === "panel" && child.size?.px != null && hasPanelBody(child),
    );
    if (!hasMain || !fixedPanel) continue;
    for (const child of children) {
      if (child?.id === "main") child.size = { weight: 5 };
      else if (child?.id === "panel") child.size = { weight: 2 };
    }
  }
}

function addPanel(layout) {
  for (const object of [...objectsIn(layout)]) {
    if (object.id === "panel-body") object.children = [...(object.children ?? []), structuredClone(issuesBlock)];
  }
  weighPanelBesideMain(layout);
  return layout;
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

const expandHome = (path) => (path.startsWith("~/") ? `${homedir()}${path.slice(1)}` : path);
const abbreviateHome = (path) => (path.startsWith(`${homedir()}/`) ? `~${path.slice(homedir().length)}` : path);

// issues.json without the repositories' entries, under either spelling of their paths.
function withoutRepos(settings, mainCheckouts) {
  const repos = Object.entries(settings.repos ?? {}).filter(([path]) => !mainCheckouts.includes(expandHome(path)));
  return { ...settings, repos: Object.fromEntries(repos) };
}

const isInside = (path, folder) => path === folder || path?.startsWith(`${folder}/`);

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
  "copy-layout": (fromPath, toPath, version) => {
    const copy = { ...readJson(fromPath), cloned_from: { name: "main", version } };
    writeJson(toPath, addPanel(copy));
  },
  "set-repo": (settingsPath, mainCheckout, entry) => {
    const settings = withoutRepos(existsSync(settingsPath) ? readJson(settingsPath) : {}, [mainCheckout]);
    settings.repos[abbreviateHome(mainCheckout)] = JSON.parse(entry);
    writeJson(settingsPath, settings);
  },
  "remove-repos": (settingsPath, ...mainCheckouts) => {
    if (existsSync(settingsPath)) writeJson(settingsPath, withoutRepos(readJson(settingsPath), mainCheckouts));
  },
  "spaces-in": (...folders) => {
    const ids = readStdinJson().spaces.filter((space) => folders.some((folder) => isInside(space.folder, folder))).map((space) => space.id);
    if (ids.length) console.log(ids.join("\n"));
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
