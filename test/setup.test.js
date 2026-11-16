import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { git, temporaryFolder } from "./support/repository.js";

const repositoryFile = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const checkoutFiles = ["setup", "scripts/setup-json.js", "mod/keys.json"];
const modKeys = JSON.parse(readFileSync(repositoryFile("mod/keys.json"), "utf8"));

// A committed main checkout holding what setup runs, at `path`.
function createCheckout(path) {
  mkdirSync(path, { recursive: true });
  git(path, "init", "-q", "-b", "main");
  for (const file of checkoutFiles) {
    mkdirSync(dirname(join(path, file)), { recursive: true });
    copyFileSync(repositoryFile(file), join(path, file));
  }
  git(path, "add", ".");
  git(path, "commit", "-q", "-m", "first");
  return path;
}

// A folder for PATH holding node, git and a stub herdr-app, and nothing else, so claude can't be found.
function binWithoutClaude(folder) {
  const bin = join(folder, "bin");
  mkdirSync(bin, { recursive: true });
  for (const tool of ["node", "git"])
    symlinkSync(execFileSync("which", [tool], { encoding: "utf8" }).trim(), join(bin, tool));
  writeFileSync(join(bin, "herdr-app"), "#!/bin/sh\necho herdr-app 1.0.0\n", { mode: 0o755 });
  return bin;
}

test("setup installs the mod, the CLI and the keys without claude, and warns that it skipped the plugin", (t) => {
  const folder = temporaryFolder(t);
  const checkout = createCheckout(join(folder, "clone"));
  const home = join(folder, "home");
  const appHome = join(home, ".config/herdr-app");
  mkdirSync(join(appHome, "layouts"), { recursive: true });
  writeFileSync(join(appHome, "keys.json"), JSON.stringify({ global: { "cmd-k": "palette" } }));

  const result = spawnSync(join(checkout, "setup"), {
    encoding: "utf8",
    input: "",
    env: { HOME: home, HERDR_APP_HOME: appHome, PATH: [binWithoutClaude(folder), "/usr/bin", "/bin"].join(":") },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readlinkSync(join(appHome, "mods/issues")), join(checkout, "mod"));
  assert.equal(lstatSync(join(home, ".local/bin/issues")).isSymbolicLink(), true);
  assert.deepEqual(JSON.parse(readFileSync(join(appHome, "keys.json"), "utf8")).global, {
    "cmd-k": "palette",
    ...modKeys.global,
  });
  assert.match(result.stdout, /To show the Issues panel/);
  assert.match(
    result.stderr,
    /claude is not installed, so the Claude plugin .* was skipped; install Claude Code and run setup again/,
  );
});

test("setup adds the marketplace and installs the plugin when claude is installed", (t) => {
  const folder = temporaryFolder(t);
  const checkout = createCheckout(join(folder, "clone"));
  const home = join(folder, "home");
  const appHome = join(home, ".config/herdr-app");
  const bin = binWithoutClaude(folder);
  const log = join(folder, "claude.log");
  writeFileSync(join(bin, "claude"), `#!/bin/sh\necho "$*" >>"${log}"\ncase "$*" in *--json) echo '[]' ;; esac\n`, {
    mode: 0o755,
  });

  const result = spawnSync(join(checkout, "setup"), {
    encoding: "utf8",
    input: "",
    env: { HOME: home, HERDR_APP_HOME: appHome, PATH: [bin, "/usr/bin", "/bin"].join(":") },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    readFileSync(log, "utf8"),
    new RegExp(`plugin marketplace add ${checkout}\\n(.*\\n)*plugin install issues@herdr-issues\\n`),
  );
  assert.doesNotMatch(result.stderr, /Claude plugin .* was skipped/);
});

// Runs setup with the marketplace already pointing at the checkout and the plugin installed, `enabled` or not,
// and returns the claude commands it ran.
function runSetupWithInstalledPlugin(t, { enabled }) {
  const folder = temporaryFolder(t);
  const checkout = createCheckout(join(folder, "clone"));
  const home = join(folder, "home");
  const appHome = join(home, ".config/herdr-app");
  const bin = binWithoutClaude(folder);
  const log = join(folder, "claude.log");
  const marketplaces = JSON.stringify([{ name: "herdr-issues", path: checkout }]);
  const plugins = JSON.stringify([{ id: "issues@herdr-issues", scope: "user", enabled }]);
  writeFileSync(
    join(bin, "claude"),
    `#!/bin/sh
echo "$*" >>"${log}"
case "$*" in
  "plugin marketplace list --json") echo '${marketplaces}' ;;
  "plugin list --json") echo '${plugins}' ;;
esac
`,
    { mode: 0o755 },
  );

  const result = spawnSync(join(checkout, "setup"), {
    encoding: "utf8",
    input: "",
    env: { HOME: home, HERDR_APP_HOME: appHome, PATH: [bin, "/usr/bin", "/bin"].join(":") },
  });

  assert.equal(result.status, 0, result.stderr);
  return { commands: readFileSync(log, "utf8"), stdout: result.stdout };
}

test("setup updates an installed plugin and turns it on when it was turned off", (t) => {
  const { commands, stdout } = runSetupWithInstalledPlugin(t, { enabled: false });

  assert.match(commands, /plugin update issues@herdr-issues\n(.*\n)*plugin enable issues@herdr-issues --scope user\n/);
  assert.match(stdout, /issues@herdr-issues plugin was turned off; turning it on/);
});

test("setup updates an installed plugin that is turned on without enabling it again", (t) => {
  const { commands } = runSetupWithInstalledPlugin(t, { enabled: true });

  assert.match(commands, /plugin update issues@herdr-issues\n/);
  assert.doesNotMatch(commands, /plugin enable/);
});

// Answers each question setup asks on a pseudo-terminal with the next answer: a [y/N] question or a numbered
// choice. Node has no pseudo-terminal of its own, so Python's pty module drives it.
const answerInTerminal = `
import os, pty, sys
answers = sys.argv[2:]
pid, fd = pty.fork()
if pid == 0:
    os.execv(sys.argv[1], [sys.argv[1]])
output = b""
while True:
    try:
        chunk = os.read(fd, 1024)
    except OSError:
        break
    if not chunk:
        break
    output += chunk
    sys.stdout.buffer.write(chunk)
    for question in (b"[y/N]", b"Choose a number: "):
        while answers and question in output:
            output = output.split(question, 1)[1]
            os.write(fd, (answers.pop(0) + "\\n").encode())
sys.exit(os.waitstatus_to_exitcode(os.waitpid(pid, 0)[1]))
`;
const python = spawnSync("python3", ["-c", "import pty"]).status === 0;

const nodeStub = (version) => `#!/bin/sh\necho ${version}\n`;

// Runs setup with a stub node that reports `nodeVersion` (null: node isn't installed), and herdr-app and claude
// stubs that log each command. `brew` and `devbox` add package manager stubs that log each command and install a
// node reporting v24.1.0: brew's into the folder already on PATH, and devbox's into its global profile, which only
// `devbox global shellenv` puts on PATH. `answers` runs setup on a pseudo-terminal, answering its questions.
function runSetupWithNode(
  folder,
  nodeVersion,
  { inWorktree = false, brew = false, devbox = false, answers = null, profile = null } = {},
) {
  const checkout = createCheckout(join(folder, "clone"));
  const worktree = join(folder, "worktree");
  if (inWorktree) git(checkout, "worktree", "add", "-q", "-b", "feature", worktree);
  const home = join(folder, "home");
  const bin = join(folder, "bin");
  const devboxProfileBin = join(folder, "devbox-profile/bin");
  const log = join(folder, "commands.log");
  mkdirSync(bin, { recursive: true });
  mkdirSync(devboxProfileBin, { recursive: true });
  if (profile) {
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, ".zshrc"), profile);
  }
  symlinkSync(execFileSync("which", ["git"], { encoding: "utf8" }).trim(), join(bin, "git"));
  for (const command of ["herdr-app", "claude"]) {
    writeFileSync(join(bin, command), `#!/bin/sh\necho "${command} $*" >>"${log}"\n`, { mode: 0o755 });
  }
  if (nodeVersion) writeFileSync(join(bin, "node"), nodeStub(nodeVersion), { mode: 0o755 });
  const installedNode = (folder) =>
    `printf '${nodeStub("v24.1.0").replaceAll("\n", "\\n")}' >"${folder}/node"; chmod +x "${folder}/node"`;
  if (brew) {
    writeFileSync(
      join(bin, "brew"),
      `#!/bin/sh\necho "brew $*" >>"${log}"\n[ "$*" = "install node" ] && ${installedNode(bin)}\nexit 0\n`,
      { mode: 0o755 },
    );
  }
  if (devbox) {
    writeFileSync(
      join(bin, "devbox"),
      `#!/bin/sh
case "$*" in
  "global list") echo "* git@latest - 2.55.0" ;;
  "global shellenv") echo 'export PATH="${devboxProfileBin}:$PATH"' ;;
  "global add nodejs") echo "devbox $*" >>"${log}"; ${installedNode(devboxProfileBin)} ;;
esac
`,
      { mode: 0o755 },
    );
  }
  const setup = join(inWorktree ? worktree : checkout, "setup");
  const env = {
    HOME: home,
    HERDR_APP_HOME: join(home, ".config/herdr-app"),
    PATH: [bin, "/usr/bin", "/bin"].join(":"),
  };
  const result = answers
    ? spawnSync("python3", ["-c", answerInTerminal, setup, ...answers], { encoding: "utf8", env })
    : spawnSync(setup, { encoding: "utf8", input: "", env });
  const commands = existsSync(log) ? readFileSync(log, "utf8") : "";
  return { result, home, log, commands, output: result.stdout + result.stderr };
}

for (const nodeVersion of ["v22.14.0", "v20.19.1", "v18.20.4"]) {
  test(`setup refuses node ${nodeVersion} before installing anything`, (t) => {
    const { result, home, log } = runSetupWithNode(temporaryFolder(t), nodeVersion);

    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`node ${nodeVersion.slice(1).replaceAll(".", "\\.")} is too old`));
    assert.match(result.stderr, /needs Node 22\.15 or later/);
    assert.equal(existsSync(join(home, ".config/herdr-app/mods/issues")), false);
    assert.equal(existsSync(join(home, ".local/bin/issues")), false);
    assert.equal(existsSync(log) ? readFileSync(log, "utf8") : "", "");
  });
}

// A linked worktree stops setup right after the Node check, before it installs anything.
for (const nodeVersion of ["v22.15.0", "v23.0.0", "v24.1.0"]) {
  test(`setup accepts node ${nodeVersion}`, (t) => {
    const { result } = runSetupWithNode(temporaryFolder(t), nodeVersion, { inWorktree: true });

    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stderr, /too old/);
    assert.match(result.stderr, /is a linked worktree/);
  });
}

const terminalTest = (name, fn) => test(name, { skip: !python && "needs python3 for a pseudo-terminal" }, fn);

terminalTest("setup installs node with Homebrew when the person agrees, then carries on", (t) => {
  const { result, commands, output } = runSetupWithNode(temporaryFolder(t), "v20.19.1", {
    inWorktree: true,
    brew: true,
    answers: ["y"],
  });

  assert.match(output, /node 20\.19\.1 is too old/);
  assert.match(output, /Install it with brew \(brew install node\)\?/);
  assert.equal(commands, "brew install node\n");
  assert.match(output, /is a linked worktree/);
  assert.equal(result.status, 1);
});

terminalTest(
  "setup installs a missing node with devbox, finds it without a new shell and warns about the profile",
  (t) => {
    const { result, commands, output } = runSetupWithNode(temporaryFolder(t), null, {
      inWorktree: true,
      devbox: true,
      answers: ["y"],
    });

    assert.match(output, /node is not installed/);
    assert.match(output, /Install it with devbox \(devbox global add nodejs\)\?/);
    assert.equal(commands, "devbox global add nodejs\n");
    assert.match(output, /your shell profile doesn't evaluate devbox global shellenv/);
    assert.match(output, /is a linked worktree/);
    assert.equal(result.status, 1);
  },
);

terminalTest("setup doesn't warn about the profile when it evaluates devbox global shellenv", (t) => {
  const { commands, output } = runSetupWithNode(temporaryFolder(t), null, {
    inWorktree: true,
    devbox: true,
    answers: ["y"],
    profile: 'eval "$(devbox global shellenv)"\n',
  });

  assert.equal(commands, "devbox global add nodejs\n");
  assert.doesNotMatch(output, /shell profile/);
  assert.match(output, /is a linked worktree/);
});

for (const [answer, expected] of [
  ["1", "devbox global add nodejs\n"],
  ["2", "brew install node\n"],
  ["3", ""],
]) {
  terminalTest(`setup asks which package manager installs node when both apply, choosing ${answer}`, (t) => {
    const { result, commands, output } = runSetupWithNode(temporaryFolder(t), "v18.20.4", {
      inWorktree: true,
      brew: true,
      devbox: true,
      answers: [answer],
      profile: 'eval "$(devbox global shellenv)"\n',
    });

    assert.match(output, /Which package manager should install Node\?/);
    assert.equal(commands, expected);
    assert.equal(result.status, 1);
    if (expected) assert.match(output, /is a linked worktree/);
    else assert.match(output, /node 18\.20\.4 is too old; the issues CLI needs Node 22\.15 or later/);
  });
}

terminalTest("setup installs nothing when the person declines", (t) => {
  const { result, commands, home, output } = runSetupWithNode(temporaryFolder(t), "v22.14.0", {
    brew: true,
    answers: ["n"],
  });

  assert.equal(result.status, 1);
  assert.equal(commands, "");
  assert.match(output, /needs Node 22\.15 or later/);
  assert.equal(existsSync(join(home, ".config/herdr-app/mods/issues")), false);
});

terminalTest("setup stops with the requirement when no package manager can install node", (t) => {
  const { result, commands, output } = runSetupWithNode(temporaryFolder(t), null, { answers: ["y"] });

  assert.equal(result.status, 1);
  assert.equal(commands, "");
  assert.doesNotMatch(output, /Install it with/);
  assert.match(output, /node is not installed; the issues CLI needs Node 22\.15 or later/);
});

test("setup installs nothing without a terminal, even with a package manager", (t) => {
  const { result, commands, output } = runSetupWithNode(temporaryFolder(t), null, { brew: true, devbox: true });

  assert.equal(result.status, 1);
  assert.equal(commands, "");
  assert.doesNotMatch(output, /Install it with|Which package manager/);
  assert.match(result.stderr, /node is not installed; the issues CLI needs Node 22\.15 or later/);
});

const sidePanelLayout = (withIssues = false) => ({
  id: "root",
  children: [
    { id: "main" },
    { id: "panel", children: [{ id: "panel-body", children: [{ id: "files" }] }] },
    ...(withIssues
      ? [
          {
            id: "issues-panel",
            type: "column",
            size: { weight: 1 },
            children: [{ id: "issues", type: "block", content: { mod: "issues" } }],
          },
        ]
      : []),
  ],
});

// Runs setup, without claude, against Herdr's `layouts` (name: shows the Issues panel), main being shipped, with
// Herdr showing `shown`; `answers` runs it on a pseudo-terminal. The herdr-app stub reports no open window.
function runSetupWithLayouts(t, { layouts, shown, answers = null }) {
  const folder = temporaryFolder(t);
  const checkout = createCheckout(join(folder, "clone"));
  const home = join(folder, "home");
  const appHome = join(home, ".config/herdr-app");
  mkdirSync(join(appHome, "layouts"), { recursive: true });
  for (const [name, withIssues] of Object.entries(layouts)) {
    writeFileSync(join(appHome, "layouts", `${name}.json`), JSON.stringify(sidePanelLayout(withIssues)));
  }
  writeFileSync(join(appHome, "installed.json"), JSON.stringify({ "layout:main": "1.0.0" }));
  writeFileSync(join(appHome, "shared.json"), JSON.stringify({ layout: shown, "sidebar.width": 268 }));
  writeFileSync(join(appHome, "keys.json"), "{}");

  const env = { HOME: home, HERDR_APP_HOME: appHome, PATH: [binWithoutClaude(folder), "/usr/bin", "/bin"].join(":") };
  const setup = join(checkout, "setup");
  const result = answers
    ? spawnSync("python3", ["-c", answerInTerminal, setup, ...answers], { encoding: "utf8", env })
    : spawnSync(setup, { encoding: "utf8", input: "", env });
  const readAppJson = (path) => JSON.parse(readFileSync(join(appHome, path), "utf8"));
  return { result, output: result.stdout + result.stderr, readAppJson };
}

test("setup says how to switch when the Issues panel is in a layout Herdr doesn't show", (t) => {
  const { result, readAppJson } = runSetupWithLayouts(t, {
    layouts: { main: false, development: true },
    shown: "main",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stderr,
    /The Issues panel is in the development layout, but Herdr shows the main layout; switch to it with: herdr-app do layout\.switch '\{"name":"development"\}'/,
  );
  assert.equal(readAppJson("shared.json").layout, "main");
});

test("setup says nothing about switching when Herdr shows the layout with the Issues panel", (t) => {
  const { result } = runSetupWithLayouts(t, { layouts: { main: false, development: true }, shown: "development" });

  assert.match(result.stdout, /The Issues panel is in the development layout, which Herdr shows/);
  assert.doesNotMatch(result.stderr, /switch to it/);
});

terminalTest(
  "setup switches to the layout with the Issues panel when the person agrees, keeping Herdr's shared state",
  (t) => {
    const { output, readAppJson } = runSetupWithLayouts(t, {
      layouts: { main: false, development: true },
      shown: "main",
      answers: ["y"],
    });

    assert.match(output, /Herdr shows the main layout, which has no Issues panel\. Switch to development/);
    assert.match(output, /Herdr now shows the development layout/);
    assert.deepEqual(readAppJson("shared.json"), { layout: "development", "sidebar.width": 268 });
  },
);

terminalTest(
  "setup lists the layout Herdr shows first and doesn't offer to switch after adding the panel to it",
  (t) => {
    const { output, readAppJson } = runSetupWithLayouts(t, {
      layouts: { main: false, alpha: false, work: false },
      shown: "work",
      answers: ["1"],
    });

    assert.match(output, /Herdr shows the work layout\. Which layout should show the Issues panel\?/);
    assert.match(output, /1\) work \(shown now\)/);
    assert.match(output, /2\) alpha/);
    assert.match(output, /Added the Issues panel to the work layout/);
    assert.doesNotMatch(output, /\[y\/N\]/);
    assert.equal(readAppJson("shared.json").layout, "work");
  },
);

terminalTest("setup offers to switch to the layout it added the panel to when Herdr shows another", (t) => {
  const { output, readAppJson } = runSetupWithLayouts(t, {
    layouts: { main: false, work: false },
    shown: "main",
    answers: ["1", "y"],
  });

  assert.match(output, /Added the Issues panel to the work layout/);
  assert.match(output, /Switch to work, which has it, and open with it from now on\? \[y\/N\]/);
  assert.equal(readAppJson("shared.json").layout, "work");
});
