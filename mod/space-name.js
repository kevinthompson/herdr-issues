// The name of an issue's worktree space: the issue's ID, or the repository's `spaceName` template from
// issues.json (trackers/setting.js) with its placeholders filled in. The panel and `issues space-name`,
// which /issues:work runs, both name spaces here.
import { mainCheckout } from "./location.js";
import { trackerSetting } from "./trackers/setting.js";
import { githubRepository } from "./trackers/github.js";

// The repository's name without its owner: the GitHub repository's for GitHub, else the main checkout's folder's.
async function repositoryName(main, setting) {
  if (setting.tracker === "github") return (await githubRepository(main, setting)).split("/").pop();
  return main.split("/").pop();
}

export async function issueSpaceName(project, issueId) {
  const setting = await trackerSetting(project);
  const template = setting?.spaceName;
  if (!template) return issueId;
  const repo = template.includes("<repo>") ? await repositoryName(await mainCheckout(project.root, project.on), setting) : "";
  return template.replaceAll("<repo>", repo).replaceAll("<issueId>", issueId);
}
