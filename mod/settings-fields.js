// Which fields the settings view (settings.js) shows for the choices made so far, apart from the view so the tests
// can run it without the kit: Linear's team once Linear is chosen and checked; whether to wait for a pull
// request's checks only when the onApproval that applies is a pull request, the global value or default when the
// onApproval select is on its choice that removes it; and workModel's typed model only when its select is on
// Other, which it is when the person picks it or the entry already holds a model the select doesn't list. The
// Global form's (global-settings.js) differ only in showing the checks question for the default onApproval too.
// The checks question's select holds waitForChecks as the ids yes and no, which checksChoiceId and waitForChecksOf
// convert.
import { SUGGESTED_WORK_MODELS } from "./trackers/setting.js";

export const CLEAR_CHOICE = "clear";
export const OTHER_WORK_MODEL = "other";

/**
 * @param {string | null | undefined} model
 */
export const isTypedWorkModel = (model) => model != null && !SUGGESTED_WORK_MODELS.includes(model);

/**
 * @param {boolean | null | undefined} waitForChecks
 * @returns {string | null}
 */
export const checksChoiceId = (waitForChecks) => (waitForChecks == null ? null : waitForChecks ? "yes" : "no");
/**
 * @param {string | null | undefined} id
 * @returns {boolean | null}
 */
export const waitForChecksOf = (id) => (id == null ? null : id === "yes");

// The workModel select's value: the listed model, Other, or the choice that removes it from the entry.
/**
 * @param {string | null | undefined} workModel
 * @param {boolean} [otherPicked]
 */
export function workModelChoice(workModel, otherPicked) {
  if (otherPicked || isTypedWorkModel(workModel)) return OTHER_WORK_MODEL;
  return workModel ?? CLEAR_CHOICE;
}

// onApproval is the repository's own, null on the choice that removes it, when fallbackOnApproval, the global
// value or the default, applies instead.
/**
 * @param {{ trackerChoice: string | null, trackerReady: boolean, onApproval: string | null | undefined, fallbackOnApproval?: string | null, workModel: string | null | undefined, otherWorkModelPicked: boolean }} fields
 */
export function settingsFields({
  trackerChoice,
  trackerReady,
  onApproval,
  fallbackOnApproval = null,
  workModel,
  otherWorkModelPicked,
}) {
  return {
    teamSelect: trackerChoice === "linear" && trackerReady,
    waitForChecksSelect: (onApproval ?? fallbackOnApproval) === "pull-request",
    workModelInput: workModelChoice(workModel, otherWorkModelPicked) === OTHER_WORK_MODEL,
  };
}

// The Global form's fields: the checks question shows for a pull request or the default onApproval, which is a
// pull request for a repository on GitHub.
/**
 * @param {{ onApproval: string | null | undefined, workModel: string | null | undefined, otherWorkModelPicked: boolean }} fields
 */
export function globalSettingsFields({ onApproval, workModel, otherWorkModelPicked }) {
  return {
    waitForChecksSelect: onApproval == null || onApproval === "pull-request",
    workModelInput: workModelChoice(workModel, otherWorkModelPicked) === OTHER_WORK_MODEL,
  };
}
