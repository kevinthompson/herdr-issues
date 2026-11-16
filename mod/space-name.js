// The name of an issue's worktree space: the issue's ID, or the repository's `spaceName` template from
// issues.json (trackers/setting.js) with its placeholders filled in. The panel and `issues space-name`,
// which /issues:work runs, both name spaces here, and the panel reads the issue ID back out of a space's
// name here to open that space's issue. A space's name matches an issue's space name when it ends with it, after
// the start of the name or whitespace, so a mark before the name, such as `󰄱   #123`, still matches. The marks for
// whether a space's session is working, waiting on the person or done are here too, for `issues mark`, and a new issue
// space, which the panel and `issues worktree <id>` open, is named marked working from the start.
import { mainCheckout } from "./location.js";
import { repositoryName, spaceNameTemplate, trackerSetting } from "./trackers/setting.js";

// A Linear ID such as ABC-12, or a GitHub ID such as #12.
const ISSUE_ID = String.raw`[A-Z][A-Z0-9]*-\d+|#\d+`;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const atEndOfName = (pattern) => new RegExp(String.raw`(?:^|\s)${pattern}$`);

export const spaceNameEndsWith = (name, issueSpace) => atEndOfName(escapeRegExp(issueSpace)).test(name);

// Nerd Font Material Design glyphs, which Herdr's interface font renders: md-checkbox_blank_outline, md-timer_sand and
// md-checkbox_marked.
export const WORKING_MARK = "\u{F0131}";
export const WAITING_MARK = "\u{F051F}";
export const DONE_MARK = "\u{F0132}";
export const SPACE_MARKS = { working: WORKING_MARK, waiting: WAITING_MARK, done: DONE_MARK };

// The interface font draws a mark wider than its advance, covering a single space after it.
const MARK_GAP = "   ";
const LEADING_MARK = new RegExp(`^(?:${Object.values(SPACE_MARKS).join("|")}) +`, "u");

export const unmarkedSpaceName = (name) => name.replace(LEADING_MARK, "");

export const markedSpaceName = (name, state) => `${SPACE_MARKS[state]}${MARK_GAP}${unmarkedSpaceName(name)}`;

// The repository's `spaceName` template, its entry's or else the top level's, and the repository name its `<repo>`
// stands for.
async function spaceTemplate(project) {
  const template = await spaceNameTemplate(project);
  if (!template) return { template: null, repo: "" };
  const repo = template.includes("<repo>") ? await repositoryName(await mainCheckout(project.root, project.on), await trackerSetting(project)) : "";
  return { template, repo };
}

export async function issueSpaceName(project, issueId) {
  const { template, repo } = await spaceTemplate(project);
  if (!template) return issueId;
  return template.replaceAll("<repo>", repo).replaceAll("<issueId>", issueId);
}

export const newIssueSpaceName = (name) => markedSpaceName(name, "working");

// The name the panel opens an issue's space with: its space name, or its ID when that can't be worked out, marked working.
export async function panelIssueSpaceName(project, issueId) {
  const name = project ? await issueSpaceName(project, issueId).catch(() => issueId) : issueId;
  return newIssueSpaceName(name);
}

// The issue ID in a space's name: an ID, or the ID in a name the template gives, ending the name.
// Undefined when the name doesn't end with one an issue's space would have.
export function issueIdInSpaceName(name, { template = null, repo = "" } = {}) {
  const patterns = [`(${ISSUE_ID})`];
  if (template?.includes("<issueId>")) {
    const [before, ...after] = template.split("<issueId>").map((part) => escapeRegExp(part.replaceAll("<repo>", repo)));
    patterns.push(`${before}(${ISSUE_ID})${after.join("\\1")}`);
  }
  for (const pattern of patterns) {
    const match = atEndOfName(pattern).exec(name);
    if (match) return match[1];
  }
}

// The issue ID in the name of a space showing the project, read with the repository's template.
export async function issueIdOfSpace(project, name) {
  const named = await spaceTemplate(project).catch(() => ({}));
  return issueIdInSpaceName(name, named);
}
