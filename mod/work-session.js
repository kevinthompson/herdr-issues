// The Claude session `issues worktree --claude` opens in a new space, which the issues skills ask for: it runs on
// the repository's workModel and workEffort settings, with its workPrompt appended to the system prompt.
import { DEFAULT_WORK_EFFORT, DEFAULT_WORK_MODEL, workSettings } from "./trackers/setting.js";
/** @import { Project } from "./trackers/index.js" */

// The command that starts a Claude session working one of the project's issues; plain `claude` without a project.
/** @param {Project | null | undefined} project */
export async function workSessionArgv(project) {
  const { workModel, workEffort, workPrompt } = project ? await workSettings(project) : {};
  return [
    "claude",
    ...(workModel && workModel !== DEFAULT_WORK_MODEL ? ["--model", workModel] : []),
    ...(workEffort && workEffort !== DEFAULT_WORK_EFFORT ? ["--effort", workEffort] : []),
    ...(workPrompt?.trim() ? ["--append-system-prompt", workPrompt] : []),
  ];
}
