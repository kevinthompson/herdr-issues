// The issues CLI's commands. Each answers for the git repository holding the current folder, on this computer.
import { repositoryRoot } from "../location.js";
import { trackerFor } from "../trackers/index.js";

const USAGE = `Usage: issues <command> [options]

Commands:
  tracker [--json]   Print the tracker the repository's issues live in: its kind, name and Linear team

Options:
  -h, --help         Print this help`;

const EXIT_FAILED = 1;
const EXIT_USAGE = 2;

async function currentProject() {
  const root = await repositoryRoot({ cwd: process.cwd(), on: null });
  if (!root) throw new Error("not in a git repository");
  return { root, on: null };
}

async function tracker(args) {
  const tracker = await trackerFor(await currentProject());
  if (!tracker) throw new Error("this repository has no tracker; run /issues:config in Claude to choose one");
  const { kind, name, team = null } = tracker;
  if (args.includes("--json")) console.log(JSON.stringify({ kind, name, team }));
  else console.log([kind, name, team].filter(Boolean).join("\t"));
}

const COMMANDS = { tracker };

export async function main([command, ...args]) {
  if (command === "-h" || command === "--help") {
    console.log(USAGE);
    return 0;
  }
  const run = COMMANDS[command];
  if (!run) {
    if (command) console.error(`issues: unknown command: ${command}`);
    console.error(USAGE);
    return EXIT_USAGE;
  }
  try {
    await run(args);
    return 0;
  } catch (error) {
    console.error(`issues: ${error.message}`);
    if (error.fix) console.error(error.fix);
    return EXIT_FAILED;
  }
}
