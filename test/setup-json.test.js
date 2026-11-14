import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { temporaryFolder } from "./support/repository.js";

const setupJson = fileURLToPath(new URL("../scripts/setup-json.js", import.meta.url));

const run = (args, input = "") => spawnSync("node", [setupJson, ...args], { input, encoding: "utf8" });
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const issuesBlock = { id: "issues", type: "block", content: { mod: "issues" } };
const issuesColumn = { id: "issues-panel", type: "column", size: { px: 368 }, min: 32, max: 900, children: [issuesBlock] };

const workBody = (children) => ({ id: "root", children: [{ id: "work", children: [{ id: "work-body", children }, { id: "status" }] }] });
const mainLayout = () => workBody([
  { id: "main" },
  { id: "panel", size: { px: 368 }, children: [{ id: "panel-body", children: [{ id: "files" }] }] },
]);

test("merge-keys adds unbound keys and keeps a key bound to something else", (t) => {
  const folder = temporaryFolder(t);
  const keys = join(folder, "keys.json");
  const modKeys = join(folder, "mod-keys.json");
  writeJson(keys, { global: { "cmd-shift-i": "other.action", "cmd-k": "palette" } });
  writeJson(modKeys, { global: { "cmd-shift-i": "issues.toggle", "cmd-shift-u": "issues.next" }, panel: { r: "issues.refresh" } });

  const result = run(["merge-keys", keys, modKeys]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /kept your cmd-shift-i in global \("other.action"\); the mod expects "issues.toggle"/);
  assert.deepEqual(readJson(keys), {
    global: { "cmd-shift-i": "other.action", "cmd-k": "palette", "cmd-shift-u": "issues.next" },
    panel: { r: "issues.refresh" },
  });
});

test("merge-keys rebinds the key an earlier setup bound to toggle the side panel", (t) => {
  const folder = temporaryFolder(t);
  const keys = join(folder, "keys.json");
  const modKeys = join(folder, "mod-keys.json");
  writeJson(keys, { global: { "cmd-shift-i": "layout.toggle:panel" } });
  writeJson(modKeys, { global: { "cmd-shift-i": "issues.toggle" } });

  const result = run(["merge-keys", keys, modKeys]);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.deepEqual(readJson(keys), { global: { "cmd-shift-i": "issues.toggle" } });
});

test("merge-keys leaves a file that already has the keys alone", (t) => {
  const folder = temporaryFolder(t);
  const keys = join(folder, "keys.json");
  const modKeys = join(folder, "mod-keys.json");
  writeFileSync(keys, '{"global":{"cmd-shift-i":"issues.toggle"}}');
  writeJson(modKeys, { global: { "cmd-shift-i": "issues.toggle" } });

  const result = run(["merge-keys", keys, modKeys]);

  assert.equal(result.status, 10);
  assert.equal(result.stdout, "");
  assert.equal(readFileSync(keys, "utf8"), '{"global":{"cmd-shift-i":"issues.toggle"}}');
});

test("add-panel adds the issues block in a column of its own beside the panel", (t) => {
  const folder = temporaryFolder(t);
  const layout = join(folder, "mine.json");
  writeJson(layout, mainLayout());

  assert.equal(run(["has-panel-body", layout]).status, 0);
  assert.equal(run(["shows-mod", layout]).status, 1);
  assert.equal(run(["add-panel", layout]).status, 0);

  assert.deepEqual(readJson(layout), workBody([
    { id: "main" },
    { id: "panel", size: { px: 368 }, children: [{ id: "panel-body", children: [{ id: "files" }] }] },
    issuesColumn,
  ]));
  assert.equal(run(["shows-mod", layout]).status, 0);
});

test("move-panel moves an issues block out of panel-body into a column of its own", (t) => {
  const folder = temporaryFolder(t);
  const layout = join(folder, "mine.json");
  writeJson(layout, workBody([
    { id: "main", size: { weight: 5 } },
    { id: "panel", size: { weight: 2 }, children: [{ id: "panel-body", active: "issues", children: [{ id: "files" }, issuesBlock] }] },
  ]));

  assert.equal(run(["move-panel", layout]).status, 0);

  assert.deepEqual(readJson(layout), workBody([
    { id: "main", size: { weight: 5 } },
    { id: "panel", size: { weight: 2 }, children: [{ id: "panel-body", active: "files", children: [{ id: "files" }] }] },
    issuesColumn,
  ]));
});

test("move-panel leaves a layout without an issues block in panel-body alone", (t) => {
  const folder = temporaryFolder(t);
  const layout = join(folder, "mine.json");
  writeJson(layout, mainLayout());
  run(["add-panel", layout]);
  const added = readFileSync(layout, "utf8");

  assert.equal(run(["move-panel", layout]).status, 10);
  assert.equal(readFileSync(layout, "utf8"), added);
});

test("add-panel writes through a symlinked layout", (t) => {
  const folder = temporaryFolder(t);
  const target = join(folder, "target.json");
  const link = join(folder, "link.json");
  writeJson(target, mainLayout());
  symlinkSync(target, link);

  run(["add-panel", link]);

  assert.equal(run(["shows-mod", target]).status, 0);
});

test("copy-layout records what it was cloned from and adds the panel", (t) => {
  const folder = temporaryFolder(t);
  writeJson(join(folder, "main.json"), mainLayout());

  run(["copy-layout", join(folder, "main.json"), join(folder, "copy.json"), "1.2.3"]);

  const copy = readJson(join(folder, "copy.json"));
  assert.deepEqual(copy.cloned_from, { name: "main", version: "1.2.3" });
  assert.equal(run(["shows-mod", join(folder, "copy.json")]).status, 0);
  assert.equal(run(["shows-mod", join(folder, "main.json")]).status, 1);
});

test("shows-mod answers no for a file that doesn't parse", (t) => {
  const folder = temporaryFolder(t);
  writeFileSync(join(folder, "broken.json"), "{");

  assert.equal(run(["shows-mod", join(folder, "broken.json")]).status, 1);
});

test("shipped-layouts lists the layouts in installed.json, and nothing without it", (t) => {
  const folder = temporaryFolder(t);
  writeJson(join(folder, "installed.json"), { "layout:main": {}, "layout:focus": {}, "theme:dark": {} });

  assert.equal(run(["shipped-layouts", join(folder, "installed.json")]).stdout, "main\nfocus\n");
  assert.equal(run(["shipped-layouts", join(folder, "missing.json")]).stdout, "");
});

test("marketplace-path and plugin-installed read Claude's JSON listings", () => {
  const marketplaces = JSON.stringify([{ name: "other", path: "/x" }, { name: "herdr-issues", installLocation: "/repo" }]);
  assert.equal(run(["marketplace-path", "herdr-issues"], marketplaces).stdout, "/repo\n");
  assert.equal(run(["marketplace-path", "missing"], marketplaces).stdout, "");

  const plugins = JSON.stringify([{ id: "issues@herdr-issues" }]);
  assert.equal(run(["plugin-installed", "issues@herdr-issues"], plugins).status, 0);
  assert.equal(run(["plugin-installed", "other@herdr-issues"], plugins).status, 1);
});
