// Opens a file in Neovim within the focused space: in a Neovim already running there, through the server
// every Neovim starts, else in a new tab.
import { exec, focused, hc, run, terminals } from "herdr";

// Neovim's default server is a socket named for the process that serves it, a child of the one the
// terminal runs, under nvim.<user> in the temporary folder.
const FIND_SERVERS = `dir="\${TMPDIR:-$(getconf DARWIN_USER_TEMP_DIR 2>/dev/null || echo /tmp)}"
for pid in "$1" $(pgrep -P "$1"); do
  for socket in "$dir"/nvim.*/*/nvim."$pid".0; do [ -S "$socket" ] && echo "$socket"; done
done`;

// A Vim string literal: single quotes, each one inside doubled.
const vimString = (text) => `'${text.replaceAll("'", "''")}'`;

// The space's terminals running Neovim, the focused tab's first.
function neovimTerminals(space, tab) {
  return terminals()
    .filter((terminal) => terminal.state === "live" && terminal.program?.key === "nvim" && terminal.labels?.["herdr.space"] === space)
    .sort((a, b) => Number(b.labels["herdr.tab"] === tab) - Number(a.labels["herdr.tab"] === tab));
}

async function serversOf(terminal) {
  const details = await hc(["get", terminal.address]).catch(() => null);
  const pid = details?.code === 0 ? JSON.parse(details.stdout).foreground?.pid : null;
  if (!pid) return [];
  const found = await exec("sh", ["-c", FIND_SERVERS, "sh", String(pid)]).catch(() => null);
  return found?.code === 0 ? found.stdout.split("\n").filter(Boolean) : [];
}

async function editIn(server, file) {
  const edit = `execute('edit ' . fnameescape(${vimString(file)}))`;
  return (await exec("nvim", ["--server", server, "--remote-expr", edit]).catch(() => null))?.code === 0;
}

// argv starts Neovim on the file when no running one takes it.
export async function openInNeovim(file, folder, argv) {
  const { space, tab } = focused() ?? {};
  if (!space) throw new Error("No space in focus");
  for (const terminal of neovimTerminals(space, tab)) {
    for (const server of await serversOf(terminal)) {
      if (!(await editIn(server, file))) continue;
      run("tab.select", { id: terminal.labels["herdr.tab"] });
      run("pane.focus", { terminal: terminal.address });
      return;
    }
  }
  run("tab.new", { name: "Neovim", space, folder, argv });
}
