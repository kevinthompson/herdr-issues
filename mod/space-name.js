// The name of an issue's worktree space: the issue's ID, or the repository's `spaceName` template from
// issues.json (trackers/setting.js) with its placeholders filled in. The panel and `issues space-name`,
// which /issues:work runs, both name spaces here, and the panel reads the issue ID back out of a space's
// name here to open that space's issue. A space's name matches an issue's space name when it ends with it, after
// the start of the name or whitespace, so a mark before the name, such as `󰄱 #123`, still matches.
import { mainCheckout } from "./location.js";
import { repositoryName, spaceNameTemplate, trackerSetting } from "./trackers/setting.js";

// A Linear ID such as ABC-12, or a GitHub ID such as #12.
const ISSUE_ID = String.raw`[A-Z][A-Z0-9]*-\d+|#\d+`;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const atEndOfName = (pattern) => new RegExp(String.raw`(?:^|\s)${pattern}$`);

export const spaceNameEndsWith = (name, issueSpace) => atEndOfName(escapeRegExp(issueSpace)).test(name);

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
