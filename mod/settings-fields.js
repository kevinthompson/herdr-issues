// Which fields the settings view (settings.js) shows for the choices made so far, apart from the view so the tests
// can run it without the kit: Linear's team once Linear is chosen and checked; whether to wait for a pull
// request's checks only when the onApproval that applies is a pull request, the global value or default when the
// onApproval select is on its choice that removes it; and workModel's typed model only when its select is on
// Other, which it is when the person picks it or the entry already holds a model the select doesn't list. The
// Global form's (global-settings.js) differ only in showing the checks question for the default onApproval too.
// A yes-or-no question's select holds its setting, such as waitForChecks, as the ids yes and no, which
// yesNoChoiceId and yesNoValue convert. Both forms group their questions under the same section headings in the same order, each form showing
// only the sections and questions it has: REPOSITORY_SECTIONS and GLOBAL_SECTIONS, keyed by each question's setting,
// where name is the repository's name and tracker includes Linear's team.
import { SUGGESTED_WORK_MODELS } from "./trackers/setting.js";

export const CLEAR_CHOICE = "clear";
export const OTHER_WORK_MODEL = "other";

/** @typedef {{ title: string, keys: string[] }} SettingsSection */

/** @type {SettingsSection[]} */
const SETTINGS_SECTIONS = [
  { title: "Tracker", keys: ["name", "tracker"] },
  { title: "Approval", keys: ["approval", "onApproval", "waitForChecks"] },
  { title: "Worktrees", keys: ["worktreeSetup", "spaceName", "close"] },
  { title: "Issue sessions", keys: ["workModel", "workEffort", "workPrompt"] },
  { title: "Panel", keys: ["pollSeconds", "updateCheckHours"] },
];

/**
 * @param {string[]} formKeys
 * @returns {SettingsSection[]}
 */
const sectionsWith = (formKeys) =>
  SETTINGS_SECTIONS.map(({ title, keys }) => ({ title, keys: keys.filter((key) => formKeys.includes(key)) })).filter(
    ({ keys }) => keys.length > 0,
  );

export const REPOSITORY_SECTIONS = sectionsWith([
  "name",
  "tracker",
  "approval",
  "onApproval",
  "waitForChecks",
  "worktreeSetup",
  "spaceName",
  "close",
  "workModel",
  "workEffort",
  "workPrompt",
  "pollSeconds",
]);

export const GLOBAL_SECTIONS = sectionsWith([
  "approval",
  "onApproval",
  "waitForChecks",
  "spaceName",
  "close",
  "workModel",
  "workEffort",
  "workPrompt",
  "pollSeconds",
  "updateCheckHours",
]);

/**
 * @param {string | null | undefined} model
 */
export const isTypedWorkModel = (model) => model != null && !SUGGESTED_WORK_MODELS.includes(model);

/**
 * @param {boolean | null | undefined} value
 * @returns {string | null}
 */
export const yesNoChoiceId = (value) => (value == null ? null : value ? "yes" : "no");
/**
 * @param {string | null | undefined} id
 * @returns {boolean | null}
 */
export const yesNoValue = (id) => (id == null ? null : id === "yes");

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
