// Which fields the settings view (settings.js) shows for the choices made so far, apart from the view so the tests
// can run it without the kit: Linear's team once Linear is chosen and checked; when the work is complete only for a
// pull request, with a note under the merge select otherwise; and workModel's typed model only when its select is
// on Other, which it is when the person picks it or the entry already holds a model the select doesn't list. The
// Global form's (global-settings.js) differ only in showing when the work is complete for the default merge too.
import { SUGGESTED_WORK_MODELS } from "./trackers/setting.js";

export const CLEAR_CHOICE = "clear";
export const OTHER_WORK_MODEL = "other";

export const isTypedWorkModel = (model) => model != null && !SUGGESTED_WORK_MODELS.includes(model);

// The workModel select's value: the listed model, Other, or the choice that removes it from the entry.
export function workModelChoice(workModel, otherPicked) {
  if (otherPicked || isTypedWorkModel(workModel)) return OTHER_WORK_MODEL;
  return workModel ?? CLEAR_CHOICE;
}

export function settingsFields({ trackerChoice, trackerReady, merge, workModel, otherWorkModelPicked }) {
  return {
    teamSelect: trackerChoice === "linear" && trackerReady,
    completeSelect: merge === "pull-request",
    mergedNote: Boolean(merge) && merge !== "pull-request",
    workModelInput: workModelChoice(workModel, otherWorkModelPicked) === OTHER_WORK_MODEL,
  };
}

// The Global form's fields: when the work is complete shows for a pull request or the default merge, which is a
// pull request for a repository on GitHub, with a note under the merge select for the other merges.
export function globalSettingsFields({ merge, workModel, otherWorkModelPicked }) {
  const pullRequestPossible = merge == null || merge === "pull-request";
  return {
    completeSelect: pullRequestPossible,
    mergedNote: !pullRequestPossible,
    workModelInput: workModelChoice(workModel, otherWorkModelPicked) === OTHER_WORK_MODEL,
  };
}
