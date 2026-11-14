// The issues CLI's commands. Each answers for the git repository holding the current folder, on this computer.
import { repositoryRoot } from "../mod/location.js";
import { trackerFor } from "../mod/trackers/index.js";
import { mergeSettings, pollSettings } from "../mod/trackers/setting.js";
import { needsNewBranch } from "../mod/issue.js";
import { issueSpaceName } from "../mod/space-name.js";
import { openWorktree } from "./worktree.js";

const USAGE = `Usage: issues <command> [options]

Commands:
  tracker [--json]         Print the tracker the repository's issues live in: its kind, name, Linear team or GitHub repository
  branch <id> [--json]     Print the branch an issue is worked on; refuse an issue an unfinished issue blocks
  space-name <id>          Print the name of the issue's worktree space, from the repository's spaceName setting
  setting <key>            Print one of the repository's settings, with its default applied: merge, complete or pollSeconds
  worktree <id> [--name <space name>] [--claude <first message>]
                           Open the issue's branch in a worktree, in a Herdr space named after the issue
  worktree --branch <branch> [--new] [--name <space name>] [--claude <first message>]
                           Open a branch in a worktree; --new: it can't be on origin yet, so don't fetch

Options:
  -h, --help               Print this help`;

const EXIT_FAILED = 1;
const EXIT_USAGE = 2;

// An answer the command refuses to give, printed as it is.
class Refusal extends Error {}

// A command run with arguments it doesn't take, which exits with the usage status.
class UsageError extends Error {}

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
  const { kind, name, team = null, repo = null } = tracker;
  if (args.includes("--json")) console.log(JSON.stringify({ kind, name, team, repo }));
  else console.log([kind, name, team, repo].filter(Boolean).join("\t"));
}

// The trackers list only an issue's unfinished blockers, so any blocker left holds the work back.
async function issueToWork(id) {
  const issue = await (await currentTracker()).get(id);
  if (!issue) throw new Refusal(`${id}: not found`);
  if (issue.blockedBy.length) throw new Refusal(`blocked by ${issue.blockedBy.join(", ")}`);
  if (!issue.branch) throw new Refusal(`${issue.id}: has no branch`);
  return issue;
}

async function branch(args) {
  const [id] = args.filter((arg) => !arg.startsWith("--"));
  if (!id) throw new Error("branch needs an issue ID");
  const issue = await issueToWork(id);
  if (args.includes("--json")) console.log(JSON.stringify({ id: issue.id, branch: issue.branch, new: needsNewBranch(issue), blockedBy: issue.blockedBy }));
  else console.log(issue.branch);
}

async function spaceName([id]) {
  if (!id) throw new Error("space-name needs an issue ID");
  console.log(await issueSpaceName(await currentProject(), id));
}

const SETTINGS = { merge: mergeSettings, complete: mergeSettings, pollSeconds: pollSettings };

async function setting([key]) {
  const settings = SETTINGS[key];
  if (!settings) throw new UsageError(`setting ${key ? `has no key ${key}` : "needs a key"}; it knows ${Object.keys(SETTINGS).join(", ")}`);
  console.log((await settings(await currentProject()))[key]);
}

function worktreeOptions(args) {
  const options = { id: null, branch: null, isNew: false, name: null, claudeMessage: null };
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
    else if (arg.startsWith("--") || options.id) throw new Error(`worktree: unexpected ${arg}`);
    else options.id = arg;
  }
  if (Boolean(options.id) === Boolean(options.branch)) throw new Error("worktree needs an issue ID or --branch <branch>");
  if (options.id && options.isNew) throw new Error("worktree: --new goes with --branch; an issue decides it itself");
  return options;
}

async function worktree(args) {
  const { id, branch, isNew, name, claudeMessage } = worktreeOptions(args);
  const cwd = process.cwd();
  if (!id) return openWorktree({ cwd, branch, isNew, name: name ?? branch, claudeMessage });
  const issue = await issueToWork(id);
  console.log(`${issue.id} is on ${issue.branch}`);
  const spaceName = name ?? await issueSpaceName(await currentProject(), issue.id);
  return openWorktree({ cwd, branch: issue.branch, isNew: needsNewBranch(issue), name: spaceName, claudeMessage });
}

const COMMANDS = { tracker, branch, "space-name": spaceName, setting, worktree };

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
    console.error(error instanceof Refusal ? error.message : `issues: ${error.message}`);
    if (error.fix) console.error(error.fix);
    return error instanceof UsageError ? EXIT_USAGE : EXIT_FAILED;
  }
}
