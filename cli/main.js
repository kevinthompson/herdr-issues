// The issues CLI's commands. Each answers for the git repository holding the current folder, on this computer.
import { readFile } from "node:fs/promises";
import { text } from "node:stream/consumers";
import { mainCheckout, repositoryRoot } from "../mod/location.js";
import { trackerFor } from "../mod/trackers/index.js";
import {
  closeSettings,
  approvalSettings,
  nameSettings,
  pollSettings,
  updateSettings,
  workSettings,
} from "../mod/trackers/setting.js";
import { linearClient } from "../mod/trackers/linear.js";
import { checkGitHubLogin } from "../mod/trackers/github.js";
import { checkBeads } from "../mod/trackers/beads.js";
import { isUnstarted, needsNewBranch, STATUSES } from "../mod/issue.js";
import {
  issueSpaceName,
  markedSpaceName,
  newIssueSpaceName,
  SPACE_MARKS,
  spaceNameEndsWith,
  unmarkedSpaceName,
} from "../mod/space-name.js";
import { checkMerge, mergeIssue, MergeRefusal } from "../mod/merge.js";
import { nextIssues } from "../mod/next.js";
import { openWorktree } from "./worktree.js";
import { finishedWork, finishInstructions } from "./finish.js";
import {
  bodyHash,
  ChangeRefusal,
  changeIssueLabels,
  checkIssueItems,
  editIssueBody,
  MissingItemRefusal,
  setIssueStatus,
  startIssue,
} from "./change.js";
import {
  clearCloseRequest,
  clearComplete,
  herdrSessionTab,
  isUnnamed,
  issueTabName,
  labelCloseRequest,
  labelComplete,
  renameSpace,
  renameTab,
  sessionTab,
  uncompletedTabName,
} from "./tab.js";

const USAGE = `Usage: issues <command> [options]

Commands:
  tracker [--json]         Print the tracker the repository's issues live in: its kind, name, Linear team or GitHub repository
  show <id> [--json]       Print an issue as the tracker reads it: title, status, labels, blockers, branch, pull requests
                           and body; --json: the whole issue, with the bodyHash edit needs. Comments aren't included
  branch <id> [--json]     Print the branch an issue is worked on; refuse an issue an unfinished issue blocks
  space-name <id>          Print the name of the issue's worktree space, from the repository's spaceName setting
  setting <key>            Print one of the repository's settings, with its default applied: approval, onApproval,
                           waitForChecks, close, name, pollSeconds, updateCheckHours, workModel, workEffort or workPrompt
  auth <tracker>           Check the credentials a tracker needs are present: linear (an API key), github (gh logged in)
                           or beads (bd installed and a database in the main checkout); print the fix when they aren't
  context [<words>...]     Print, as JSON, what /issues:create checks before writing: the tracker, after checking its
                           credentials as auth does, its labels (Linear's and GitHub's; null for Beads) and up to 10
                           of its listed issues whose titles share the most words with <words>
  scopes [--json]          Print the issue lists the panel can show, default first: each one's ID, label and group,
                           a project's milestones grouped under it
  list [<scope>] [--json]  Print the open issues the panel lists in a scope, or the default one: ID, status and title
  next <n> [<scope>] [--json]
                           Print the n highest-ranked issues ready to start, nothing blocking them, in a scope or the
                           default one: ID and title; fewer when fewer qualify
  tab [--json]             Print the ID, name and space name of the Herdr tab holding $HC_TERMINAL_ID
  tab rename <id> <name>   Rename that tab after the issue, unless the person named it (it isn't Claude or a number),
                           prefixed with the issue's ID when its space isn't named after the issue
  mark <working|waiting|done> <id>
                           Start the name of the space holding $HC_TERMINAL_ID with the state's mark, replacing a mark
                           already there; leave a space not named after the issue as it is
  complete <id>            Mark the session done working, handed off to the person: label $HC_TERMINAL_ID
                           issues.complete=<id>; it says nothing about the branch, which removing the worktree checks
                           for itself
  complete --cancel <id>   Withdraw that when the work continues: remove the issues.complete label from $HC_TERMINAL_ID
                           and a leading ✅ that earlier versions put in its tab's name
  close <id>               Ask the issues panel to close the session's space once $HC_TERMINAL_ID is idle: label it
                           issues.close=<id>; the panel removes the worktree without asking only when every check passes
  close --cancel <id>      Withdraw that request: remove the issues.close label from $HC_TERMINAL_ID
                           Outside a Herdr terminal, with $HC_TERMINAL_ID empty or herdr-app not installed, tab rename,
                           mark, complete and close, with or without --cancel, do nothing and print nothing
  finish <id> [--canceled] [--checks-recorded]
                           End a finished issue session: check its worktree is safe to remove (nothing uncommitted, and
                           the branch merged into main or, with onApproval pull-request, pushed with an open pull
                           request whose checks pass when waitForChecks is true), else list what's outstanding, change
                           nothing and exit 1; then run complete, mark done and, with close ask or auto, close, and
                           print the final block the session ends with and, with close ask, the question to ask.
                           --canceled: the person canceled the work, so skip the checks; --checks-recorded: failing
                           checks are recorded in an issue comment as not caused by the branch
  worktree <id> [--name <space name>] [--claude <first message>]
                           Open the issue's branch in a worktree, in a new Herdr space named after the issue and
                           marked working, as mark working does: 󰄱 <space name>. An issue in triage, backlog or todo
                           is first marked in progress, as start does; a refused start only warns
  worktree --branch <branch> [--new] [--name <space name>] [--claude <first message>]
                           Open a branch in a worktree; --new: it can't be on origin yet, so don't fetch
  merge <id>               Merge the issue's branch into main in the main checkout and mark the issue done;
                           refuse, changing nothing, when it can't merge cleanly or onApproval is pull-request
  merge --check <id>       Make every check merge makes, including a trial merge that changes no checkout, and change
                           nothing: exit 0 when merge would go through, else print merge's refusal and exit 1
  status <id> <status>     Set the issue's status and refresh the panels; refuse a status its tracker can't set.
                           The statuses: ${STATUSES.join(", ")}. On GitHub, done closes the issue as completed,
                           canceled closes it as not planned, and any other status reopens it
  start <id>               Mark the issue in progress, assigning the person where the tracker does, and refresh the panels
  edit <id> --body-file <file> --body-hash <hash>
                           Save the file, or standard input when <file> is -, as the issue's body and refresh the
                           panels; <hash> is the bodyHash show --json
                           printed, and the edit is refused, changing nothing, when the body changed since then
  check <id> [--except <n>]...
                           Check every unchecked task-list item (- [ ]) in the issue's body, save it as edit does and
                           refresh the panels, printing the items checked; --except <n>: leave the nth unchecked item,
                           counting from 1 in body order, unchecked. A body with nothing to check is left as it is
  label <id> [--add <name>]... [--remove <name>]...
                           Add and remove the issue's labels by name, keeping its others, and refresh the panels;
                           refuse, changing nothing, a name the tracker has no label by. A Linear label in a group
                           is named "group > name"

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

async function foundIssue(id) {
  const issue = await (await currentTracker()).get(id);
  if (!issue) throw new Refusal(`${id}: not found`);
  return issue;
}

function issueText(issue) {
  const fields = [
    ["Status", issue.status],
    ["Labels", issue.labels.join(", ")],
    ["Blocked by", issue.blockedBy.join(", ")],
    ["Branch", issue.branch],
    ["Assignee", issue.assignee],
    ["Due", issue.due],
    [
      "Pull requests",
      (issue.pullRequests ?? []).map((pullRequest) => `${pullRequest.url} (${pullRequest.status})`).join(", "),
    ],
    ["URL", issue.url],
    ["Updated", issue.updated],
  ];
  const lines = fields.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  const text = [`${issue.id} ${issue.title}`, ...lines].join("\n");
  return issue.body ? `${text}\n\n${issue.body}` : text;
}

async function show(args) {
  const [id, ...rest] = args.filter((arg) => arg !== "--json");
  if (!id || rest.length || id.startsWith("-")) throw new UsageError("show needs one issue ID");
  const issue = await foundIssue(id);
  console.log(
    args.includes("--json") ? JSON.stringify({ ...issue, bodyHash: bodyHash(issue.body) }) : issueText(issue),
  );
}

// The trackers list only an issue's unfinished blockers, so any blocker left holds the work back.
async function issueToWork(id) {
  const issue = await foundIssue(id);
  if (issue.blockedBy.length) throw new Refusal(`blocked by ${issue.blockedBy.join(", ")}`);
  if (!issue.branch) throw new Refusal(`${issue.id}: has no branch`);
  return issue;
}

async function branch(args) {
  const [id] = args.filter((arg) => !arg.startsWith("--"));
  if (!id) throw new Error("branch needs an issue ID");
  const issue = await issueToWork(id);
  if (args.includes("--json"))
    console.log(
      JSON.stringify({ id: issue.id, branch: issue.branch, new: needsNewBranch(issue), blockedBy: issue.blockedBy }),
    );
  else console.log(issue.branch);
}

async function spaceName([id]) {
  if (!id) throw new Error("space-name needs an issue ID");
  console.log(await issueSpaceName(await currentProject(), id));
}

const SETTINGS = {
  approval: approvalSettings,
  onApproval: approvalSettings,
  waitForChecks: approvalSettings,
  close: closeSettings,
  name: nameSettings,
  pollSeconds: pollSettings,
  updateCheckHours: updateSettings,
  workModel: workSettings,
  workEffort: workSettings,
  workPrompt: workSettings,
};

async function setting([key]) {
  const settings = SETTINGS[key];
  if (!settings)
    throw new UsageError(
      `setting ${key ? `has no key ${key}` : "needs a key"}; it knows ${Object.keys(SETTINGS).join(", ")}`,
    );
  const value = (await settings(await currentProject()))[key];
  if (value !== "") console.log(value);
}

async function tab(args) {
  if (args[0] === "rename") return renameSessionTab(args.slice(1));
  const { id, name, space } = await sessionTab();
  if (args.includes("--json")) console.log(JSON.stringify({ id, name, space }));
  else console.log([id, name, space].join("\t"));
}

async function renameSessionTab([issueId, ...words]) {
  const name = words.join(" ");
  if (!issueId || !name) throw new UsageError("tab rename needs an issue ID and a name");
  const tab = await herdrSessionTab();
  if (!tab) return;
  if (!isUnnamed(tab.name)) {
    console.log(`The tab keeps its name: ${tab.name}`);
    return;
  }
  const issueSpace = await issueSpaceName(await currentProject(), issueId);
  const newName = issueTabName({ tab, issueId, issueSpace, name });
  await renameTab(tab, newName);
  console.log(`Renamed the tab to ${newName}`);
}

async function mark([state, issueId, ...rest]) {
  if (!SPACE_MARKS[state] || !issueId || rest.length)
    throw new UsageError(`mark needs a state (${Object.keys(SPACE_MARKS).join(", ")}) and one issue ID`);
  const tab = await herdrSessionTab();
  if (!tab) return;
  const issueSpace = await issueSpaceName(await currentProject(), issueId);
  if (!spaceNameEndsWith(unmarkedSpaceName(tab.space), issueSpace)) {
    console.log(`The space keeps its name, since it isn't named after ${issueId}: ${tab.space}`);
    return;
  }
  const newName = markedSpaceName(tab.space, state);
  if (newName === tab.space) {
    console.log(`The space is already marked ${state}: ${newName}`);
    return;
  }
  await renameSpace(tab, newName);
  console.log(`Marked the space ${state}: ${newName}`);
}

async function complete(args) {
  if (args[0] === "--cancel") return cancelComplete(args.slice(1));
  const [issueId] = args;
  if (!issueId) throw new UsageError("complete needs an issue ID");
  const tab = await herdrSessionTab();
  if (!tab) return;
  await labelComplete(tab, issueId);
  console.log(`Marked ${issueId} complete in the tab ${tab.name}`);
}

async function cancelComplete([issueId, ...rest]) {
  if (!issueId || rest.length || issueId.startsWith("-")) throw new UsageError("complete --cancel needs one issue ID");
  const tab = await herdrSessionTab();
  if (!tab) return;
  await clearComplete(tab);
  const newName = uncompletedTabName(tab.name);
  if (newName !== tab.name) await renameTab(tab, newName);
  console.log(`Withdrew ${issueId}'s completion in the tab ${newName}`);
}

async function close(args) {
  const cancel = args[0] === "--cancel";
  const [issueId, ...rest] = cancel ? args.slice(1) : args;
  if (!issueId || rest.length || issueId.startsWith("-")) {
    throw new UsageError(cancel ? "close --cancel needs one issue ID" : "close needs one issue ID");
  }
  const tab = await herdrSessionTab();
  if (!tab) return;
  if (cancel) {
    await clearCloseRequest(tab);
    console.log(`Withdrew the request to close ${issueId}'s space; the worktree stays open`);
    return;
  }
  await labelCloseRequest(tab, issueId);
  console.log(
    "Asked the issues panel to close the space once this session is idle; if it stays open, press cmd+shift+w",
  );
}

function finishOptions(args) {
  const options = { id: null, canceled: false, checksRecorded: false };
  for (const arg of args) {
    if (arg === "--canceled") options.canceled = true;
    else if (arg === "--checks-recorded") options.checksRecorded = true;
    else if (arg.startsWith("-") || options.id) throw new UsageError(`finish: unexpected ${arg}`);
    else options.id = arg;
  }
  if (!options.id) throw new UsageError("finish needs an issue ID");
  return options;
}

async function finish(args) {
  const { id, canceled, checksRecorded } = finishOptions(args);
  const project = await currentProject();
  const { approval, onApproval, waitForChecks } = await approvalSettings(project);
  const work = await finishedWork({ id, cwd: process.cwd(), onApproval, waitForChecks, canceled, checksRecorded });
  if (work.outstanding.length) {
    throw new Refusal(
      [
        `${id} isn't finished, so nothing was changed. Outstanding:`,
        ...work.outstanding.map((item) => `  - ${item}`),
      ].join("\n"),
    );
  }
  const inHerdr = Boolean(await herdrSessionTab());
  const closeSetting = inHerdr ? (await closeSettings(project)).close : null;
  if (inHerdr) {
    await complete([id]);
    await mark(["done", id]);
    await close([id]);
  }
  const onlyBlock = approval === "auto" && closeSetting === "auto";
  console.log(
    `\n${finishInstructions({ id, result: work.result, close: closeSetting, onlyBlock, canceled, pullRequestOpen: work.pullRequestOpen })}`,
  );
}

// Each tracker's check throws the SetupProblem it finds. Linear's client asks the API nothing until it's called.
const AUTH_CHECKS = {
  linear: linearClient,
  github: checkGitHubLogin,
  beads: async () => {
    const { root, on } = await currentProject();
    await checkBeads(await mainCheckout(root, on));
  },
};

async function auth([kind, ...rest]) {
  const check = AUTH_CHECKS[kind];
  if (!check || rest.length) throw new UsageError(`auth needs one tracker: ${Object.keys(AUTH_CHECKS).join(", ")}`);
  await check();
}

const MAX_SIMILAR_ISSUES = 10;
const MIN_MATCHED_WORD_LENGTH = 4;
const titleWords = (text) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= MIN_MATCHED_WORD_LENGTH),
  );

function similarIssues(issues, searchWords) {
  const wanted = titleWords(searchWords.join(" "));
  return issues
    .map((issue) => ({ issue, shared: [...titleWords(issue.title)].filter((word) => wanted.has(word)).length }))
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, MAX_SIMILAR_ISSUES)
    .map(({ issue: { id, title, status } }) => ({ id, title, status }));
}

async function context(searchWords) {
  const tracker = await currentTracker();
  await AUTH_CHECKS[tracker.kind]();
  const [labels, issues] = await Promise.all([tracker.labels?.() ?? null, tracker.list()]);
  const { kind, name, team = null, repo = null } = tracker;
  console.log(
    JSON.stringify({ tracker: { kind, name, team, repo }, labels, similarIssues: similarIssues(issues, searchWords) }),
  );
}

// A tracker with one list has no scopes; it stands in for that list.
const trackerScopes = (tracker) => tracker.scopes ?? [{ id: "default", label: tracker.name }];

const scopeRows = (scopes) =>
  scopes.flatMap((scope) => [
    scope,
    ...(scope.milestones ?? []).map((milestone) => ({ ...milestone, group: scope.label })),
  ]);

async function scopes(args) {
  const scopes = trackerScopes(await currentTracker());
  if (args.includes("--json")) console.log(JSON.stringify(scopes));
  else for (const { id, label, group } of scopeRows(scopes)) console.log([id, label, group].filter(Boolean).join("\t"));
}

// The scope ID to list the tracker's issues in: undefined for its default scope, or for a tracker with one list.
function listedScopeId(tracker, scopeId) {
  const rows = scopeRows(trackerScopes(tracker));
  if (scopeId && !rows.some((scope) => scope.id === scopeId)) {
    throw new Refusal(`${scopeId}: no such scope; the scopes are ${rows.map((scope) => scope.id).join(", ")}`);
  }
  return tracker.scopes ? scopeId : undefined;
}

// The panel's Backlog group, collapsed at first, still holds open issues, so they're listed too.
const OPEN_GROUPS_TO_LOAD = new Set(["backlog"]);

async function list(args) {
  const [scopeId, ...extra] = args.filter((arg) => !arg.startsWith("--"));
  if (extra.length) throw new UsageError("list takes at most one scope");
  const tracker = await currentTracker();
  const issues = await tracker.list(listedScopeId(tracker, scopeId), OPEN_GROUPS_TO_LOAD);
  if (args.includes("--json")) console.log(JSON.stringify(issues));
  else for (const { id, status, title } of issues) console.log([id, status, title].join("\t"));
}

async function next(args) {
  const [count, scopeId, ...extra] = args.filter((arg) => !arg.startsWith("--"));
  if (!/^[1-9]\d*$/.test(count ?? "") || extra.length)
    throw new UsageError("next needs a positive number of issues and at most one scope");
  const tracker = await currentTracker();
  const issues = await nextIssues(tracker, Number(count), listedScopeId(tracker, scopeId));
  if (args.includes("--json")) console.log(JSON.stringify(issues));
  else for (const { id, title } of issues) console.log([id, title].join("\t"));
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
  if (Boolean(options.id) === Boolean(options.branch))
    throw new Error("worktree needs an issue ID or --branch <branch>");
  if (options.id && options.isNew) throw new Error("worktree: --new goes with --branch; an issue decides it itself");
  return options;
}

async function startBeforeOpening(issue) {
  try {
    await startIssue(await currentTracker(), issue.id);
    console.log(`Started ${issue.id}`);
  } catch (error) {
    console.error(`issues: couldn't mark ${issue.id} in progress: ${error.message}; opening its worktree anyway`);
  }
}

async function worktree(args) {
  const { id, branch, isNew, name, claudeMessage } = worktreeOptions(args);
  const cwd = process.cwd();
  if (!id) return openWorktree({ cwd, branch, isNew, name: name ?? branch, claudeMessage });
  const issue = await issueToWork(id);
  console.log(`${issue.id} is on ${issue.branch}`);
  if (isUnstarted(issue)) await startBeforeOpening(issue);
  const spaceName = newIssueSpaceName(name ?? (await issueSpaceName(await currentProject(), issue.id)));
  return openWorktree({ cwd, branch: issue.branch, isNew: needsNewBranch(issue), name: spaceName, claudeMessage });
}

async function merge(args) {
  const checkOnly = args[0] === "--check";
  const [id, ...rest] = checkOnly ? args.slice(1) : args;
  if (!id || rest.length || id.startsWith("-"))
    throw new UsageError(checkOnly ? "merge --check needs one issue ID" : "merge needs one issue ID");
  const issue = await issueToWork(id);
  try {
    if (checkOnly) {
      const main = await checkMerge(issue, await currentProject());
      console.log(`${issue.branch} merges cleanly into ${main.branch}`);
      return;
    }
    const mainBranch = await mergeIssue(issue, await currentTracker(), await currentProject());
    console.log(`Merged ${issue.branch} into ${mainBranch} and marked ${issue.id} done`);
  } catch (error) {
    throw error instanceof MergeRefusal ? new Refusal(error.message) : error;
  }
}

async function refusingChanges(change) {
  try {
    return await change();
  } catch (error) {
    throw error instanceof ChangeRefusal ? new Refusal(error.message) : error;
  }
}

async function status(args) {
  if (args.length !== 2 || args.some((arg) => arg.startsWith("-")))
    throw new UsageError("status needs an issue ID and a status");
  const [id, newStatus] = args;
  if (!STATUSES.includes(newStatus)) throw new UsageError(`status ${newStatus} isn't one of ${STATUSES.join(", ")}`);
  const issue = await refusingChanges(async () => setIssueStatus(await currentTracker(), id, newStatus));
  console.log(`Set ${issue.id} to ${newStatus}`);
}

async function start(args) {
  if (args.length !== 1 || args[0].startsWith("-")) throw new UsageError("start needs one issue ID");
  const issue = await refusingChanges(async () => startIssue(await currentTracker(), args[0]));
  console.log(`Started ${issue.id}`);
}

function editOptions(args) {
  const options = { id: null, bodyFile: null, readBodyHash: null };
  const flags = { "--body-file": "bodyFile", "--body-hash": "readBodyHash" };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (flags[arg]) {
      if (index + 1 >= args.length) throw new UsageError(`edit: ${arg} needs a value`);
      options[flags[arg]] = args[++index];
    } else if (arg.startsWith("-") || options.id) throw new UsageError(`edit: unexpected ${arg}`);
    else options.id = arg;
  }
  if (!options.id || !options.bodyFile) throw new UsageError("edit needs an issue ID and --body-file <file>");
  if (!options.readBodyHash) {
    throw new UsageError(
      "edit needs --body-hash <hash>, the bodyHash issues show --json printed, so it can refuse when the body changed since it was read",
    );
  }
  return options;
}

async function edit(args) {
  const { id, bodyFile, readBodyHash } = editOptions(args);
  const readsStandardInput = bodyFile === "-";
  const source = readsStandardInput ? "standard input" : bodyFile;
  const body = await (readsStandardInput ? text(process.stdin) : readFile(bodyFile, "utf8")).catch(() => null);
  if (body === null) throw new Refusal(`${source}: can't be read`);
  if (!body.trim()) throw new Refusal(`${source}: is empty`);
  const issue = await refusingChanges(async () => editIssueBody(await currentTracker(), id, { body, readBodyHash }));
  console.log(`Saved the body of ${issue.id}`);
}

function checkOptions(args) {
  const options = { id: null, keepUnchecked: [] };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--except") {
      const number = Number(args[++index]);
      if (!Number.isInteger(number) || number < 1)
        throw new UsageError("check: --except needs an item number, counting from 1");
      options.keepUnchecked.push(number);
    } else if (arg.startsWith("-") || options.id) throw new UsageError(`check: unexpected ${arg}`);
    else options.id = arg;
  }
  if (!options.id) throw new UsageError("check needs an issue ID");
  return options;
}

async function check(args) {
  const { id, keepUnchecked } = checkOptions(args);
  const { issue, checked, left } = await refusingChanges(async () => {
    try {
      return await checkIssueItems(await currentTracker(), id, { keepUnchecked });
    } catch (error) {
      throw error instanceof MissingItemRefusal ? new UsageError(`check: ${error.message}`) : error;
    }
  });
  const list = (items) => items.map((item) => `  - ${item}`);
  if (!checked.length) {
    console.log(`${issue.id} has no unchecked items to check; its body is unchanged`);
    return;
  }
  console.log(
    [`Checked in ${issue.id}:`, ...list(checked), ...(left.length ? ["Left unchecked:", ...list(left)] : [])].join(
      "\n",
    ),
  );
}

function labelOptions(args) {
  const options = { id: null, addLabels: [], removeLabels: [] };
  const flags = { "--add": "addLabels", "--remove": "removeLabels" };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (flags[arg]) {
      if (index + 1 >= args.length) throw new UsageError(`label: ${arg} needs a label name`);
      options[flags[arg]].push(args[++index]);
    } else if (arg.startsWith("-") || options.id) throw new UsageError(`label: unexpected ${arg}`);
    else options.id = arg;
  }
  if (!options.id || !(options.addLabels.length || options.removeLabels.length)) {
    throw new UsageError("label needs an issue ID and at least one --add <name> or --remove <name>");
  }
  return options;
}

async function label(args) {
  const { id, addLabels, removeLabels } = labelOptions(args);
  const issue = await refusingChanges(async () =>
    changeIssueLabels(await currentTracker(), id, { addLabels, removeLabels }),
  );
  const changes = [...addLabels.map((name) => `added ${name}`), ...removeLabels.map((name) => `removed ${name}`)];
  console.log(`${issue.id}: ${changes.join(", ")}`);
}

const COMMANDS = {
  tracker,
  show,
  branch,
  "space-name": spaceName,
  setting,
  auth,
  context,
  scopes,
  list,
  next,
  tab,
  mark,
  complete,
  close,
  finish,
  worktree,
  merge,
  status,
  start,
  edit,
  check,
  label,
};

const HELP_FLAGS = ["-h", "--help"];

export async function main([command, ...args]) {
  if (HELP_FLAGS.includes(command) || HELP_FLAGS.includes(args[0])) {
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
