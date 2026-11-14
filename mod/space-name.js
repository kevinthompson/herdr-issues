// The name of an issue's worktree space: the issue's ID, or the repository's `spaceName` template from
// issues.json (trackers/setting.js) with its placeholders filled in. The panel and `issues space-name`,
// which /issues:work runs, both name spaces here, and the panel reads the issue ID back out of a space's
// name here to open that space's issue.
import { mainCheckout } from "./location.js";
import { trackerSetting } from "./trackers/setting.js";
import { githubRepository } from "./trackers/github.js";

// A Linear ID such as ABC-12, or a GitHub ID such as #12.
const ISSUE_ID = String.raw`[A-Z][A-Z0-9]*-\d+|#\d+`;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The repository's name without its owner: the GitHub repository's for GitHub, else the main checkout's folder's.
async function repositoryName(main, setting) {
  if (setting.tracker === "github") return (await githubRepository(main, setting)).split("/").pop();
  return main.split("/").pop();
}

// The repository's `spaceName` template and the repository name its `<repo>` stands for.
async function spaceTemplate(project) {
  const setting = await trackerSetting(project);
  const template = setting?.spaceName;
  if (!template) return { template: null, repo: "" };
  const repo = template.includes("<repo>") ? await repositoryName(await mainCheckout(project.root, project.on), setting) : "";
  return { template, repo };
}

export async function issueSpaceName(project, issueId) {
  const { template, repo } = await spaceTemplate(project);
  if (!template) return issueId;
  return template.replaceAll("<repo>", repo).replaceAll("<issueId>", issueId);
}

// The issue ID in a space's name: the whole name when it's an ID, or the ID in a name the template gives.
// Undefined when the name isn't one an issue's space would have.
export function issueIdInSpaceName(name, { template = null, repo = "" } = {}) {
  const patterns = [`(${ISSUE_ID})`];
  if (template?.includes("<issueId>")) {
    const [before, ...after] = template.split("<issueId>").map((part) => escapeRegExp(part.replaceAll("<repo>", repo)));
    patterns.push(`${before}(${ISSUE_ID})${after.join("\\1")}`);
  }
  for (const pattern of patterns) {
    const match = new RegExp(`^${pattern}$`).exec(name);
    if (match) return match[1];
  }
}

// The issue ID in the name of a space showing the project, read with the repository's template.
export async function issueIdOfSpace(project, name) {
  const named = await spaceTemplate(project).catch(() => ({}));
  return issueIdInSpaceName(name, named);
}
