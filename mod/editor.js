// Opens a text file in the user's editor, $VISUAL else $EDITOR: a GUI editor in its own window, a terminal
// editor in a new tab in the focused space, and the macOS default text editor when neither is set.
import { exec, focused, run } from "herdr";
import { openInNeovim } from "./neovim.js";

const EDITOR_REFRESH_MS = 60_000;
const FIELD = "\x1e";

// The app doesn't load the shell profile, so the variables and the PATH that finds the editor come from
// the user's interactive login shell, which hands them to a POSIX shell for the rest.
const ASK_LOGIN_SHELL = `exec "\${SHELL:-/bin/sh}" -lic 'VISUAL="$VISUAL" EDITOR="$EDITOR" exec /bin/sh -c "$1"' sh "$1"`;
const DESCRIBE_EDITOR = `editor=\${VISUAL:-$EDITOR}
[ -n "$editor" ] || exit 0
eval "set -- $editor"
command=$(command -v "$1") && command=$(realpath "$command" 2>/dev/null || echo "$command")
printf '${FIELD}%s${FIELD}%s${FIELD}%s${FIELD}%s${FIELD}' "$editor" "\${1##*/}" "$command" "$PATH"`;

// Runs the editor value's words with the file as the last argument.
const RUN_EDITOR = `PATH=$2; eval "set -- $1 \\"\\$3\\""; exec "$@"`;
const START_EDITOR = `PATH=$2; eval "set -- $1 \\"\\$3\\""
command -v "$1" >/dev/null || { echo "$1: command not found" >&2; exit 127; }
nohup "$@" >/dev/null 2>&1 &`;

let knownEditor = null;
let refreshingEditor = null;

// {value, name, command, path}, or null when neither variable is set.
async function lookUpEditor() {
  const result = await exec("sh", ["-c", ASK_LOGIN_SHELL, "sh", DESCRIBE_EDITOR]);
  const fields = result.stdout.split(FIELD);
  if (fields.length < 6) return null;
  const [value, name, command, path] = fields.slice(-5, -1);
  return { value, name, command, path };
}

// Starts the login shell's slow lookup before anyone clicks a file, so opening one doesn't wait on it.
export function prefetchEditor() {
  if (knownEditor) return;
  const editor = lookUpEditor();
  knownEditor = { editor, at: Date.now() };
  editor.catch(() => { if (knownEditor?.editor === editor) knownEditor = null; });
}

// Answers with the editor already known, looking it up again in the background once it's stale, so a
// changed $EDITOR reaches the next file opened.
function userEditor() {
  prefetchEditor();
  const { editor, at } = knownEditor;
  if (Date.now() - at >= EDITOR_REFRESH_MS && !refreshingEditor) {
    refreshingEditor = lookUpEditor()
      .then((fresh) => { knownEditor = { editor: Promise.resolve(fresh), at: Date.now() }; }, () => {})
      .finally(() => { refreshingEditor = null; });
  }
  return editor;
}

const isGuiEditor = (command) => command.includes(".app/");

// Binary files such as images go to their own application; text, empty files, folders and files not
// made yet go to the editor.
export async function isTextFile(file) {
  const described = await exec("file", ["-b", "--mime", file]).catch(() => null);
  if (described?.code !== 0) return true;
  const [type, charset] = described.stdout.trim().split("; charset=");
  return charset !== "binary" || type.startsWith("inode/");
}

export async function openInEditor(file, folder) {
  const editor = await userEditor();
  if (!editor) return expectSuccess(await exec("open", ["-t", file]));
  if (!editor.command) throw new Error(`${editor.name}: command not found`);
  if (isGuiEditor(editor.command)) return expectSuccess(await exec("sh", ["-c", START_EDITOR, "sh", editor.value, editor.path, file]));
  const argv = ["sh", "-c", RUN_EDITOR, "sh", editor.value, editor.path, file];
  if (editor.name === "nvim") return openInNeovim(file, folder, argv);
  const { space } = focused() ?? {};
  if (!space) throw new Error("No space in focus");
  run("tab.new", { name: editor.name, space, folder, argv });
}

function expectSuccess(result) {
  if (result.code !== 0) throw new Error(result.stderr.trim() || `exited with ${result.code}`);
}
