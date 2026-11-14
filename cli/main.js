// The issues CLI's commands. Each answers for the git repository holding the current folder, on this computer.
import { repositoryRoot } from "../location.js";
import { trackerFor } from "../trackers/index.js";
import { needsNewBranch } from "../issue.js";
import { issueSpaceName } from "../space-name.js";
import { openWorktree } from "./worktree.js";

const USAGE = `Usage: issues <command> [options]

Commands:
  tracker [--json]         Print the tracker the repository's issues live in: its kind, name and Linear team
  branch <id> [--json]     Print the branch an issue is worked on; refuse an issue an unfinished issue blocks
  space-name <id>          Print the name of the issue's worktree space, from the repository's spaceName setting
  worktree --branch <branch> [--new] [--name <space name>] [--claude <first message>]
                           Open a branch in a worktree; --new: it can't be on origin yet, so fetch only main

Options:
  -h, --help               Print this help`;

const EXIT_FAILED = 1;
const EXIT_USAGE = 2;

async function currentProject() {
  const root = await repositoryRoot({ cwd: process.cwd(), on: null });
  if (!root) throw new Error("not in a git repository");
  return { root, on: null };
}

async function currentTracker() {
  const tracker = await trackerFor(await currentProject());
  if (!tracker) throw new Error("this repository has no tracker; run /issues:config in Claude to choose one");
  return tracker;
}

async function tracker(args) {
  const tracker = await currentTracker();
  const { kind, name, team = null } = tracker;
  if (args.includes("--json")) console.log(JSON.stringify({ kind, name, team }));
  else console.log([kind, name, team].filter(Boolean).join("\t"));
}

// The trackers list only an issue's unfinished blockers, so any blocker left holds the work back.
async function branch(args) {
  const [id] = args.filter((arg) => !arg.startsWith("--"));
  if (!id) throw new Error("branch needs an issue ID");
  const issue = await (await currentTracker()).get(id);
  if (!issue) return refuse(`${id}: not found`);
  if (issue.blockedBy.length) return refuse(`blocked by ${issue.blockedBy.join(", ")}`);
  if (!issue.branch) return refuse(`${issue.id}: has no branch`);
  if (args.includes("--json")) console.log(JSON.stringify({ id: issue.id, branch: issue.branch, new: needsNewBranch(issue), blockedBy: issue.blockedBy }));
  else console.log(issue.branch);
  return 0;
}

function refuse(message) {
  console.error(message);
  return EXIT_FAILED;
}

async function spaceName([id]) {
  if (!id) throw new Error("space-name needs an issue ID");
  console.log(await issueSpaceName(await currentProject(), id));
}

function worktreeOptions(args) {
  const options = { branch: null, isNew: false, name: null, claudeMessage: null };
  const valueAfter = (index) => {
    if (index + 1 >= args.length) throw new Error(`worktree: ${args[index]} needs a value`);
    return args[index + 1];
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--new") options.isNew = true;
    else if (arg === "--branch") options.branch = valueAfter(index++);
    else if (arg === "--name") options.name = valueAfter(index++);
    else if (arg === "--claude") options.claudeMessage = valueAfter(index++);
    else throw new Error(`worktree: unexpected ${arg}`);
  }
  if (!options.branch) throw new Error("worktree needs --branch <branch>");
  return options;
}

async function worktree(args) {
  const { branch, isNew, name, claudeMessage } = worktreeOptions(args);
  return openWorktree({ cwd: process.cwd(), branch, isNew, name: name ?? branch, claudeMessage });
}

const COMMANDS = { tracker, branch, "space-name": spaceName, worktree };

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
    return (await run(args)) ?? 0;
  } catch (error) {
    console.error(`issues: ${error.message}`);
    if (error.fix) console.error(error.fix);
    return EXIT_FAILED;
  }
}
