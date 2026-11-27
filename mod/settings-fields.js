// Which fields the settings view (settings.js) shows for the choices made so far, apart from the view so the tests
// can run it without the kit: Linear's team once Linear is chosen and checked; and whether to wait for a pull
// request's checks only when the onApproval that applies is a pull request, and whether to push main after
// merging only when it is a merge, the global value or default when the onApproval select is on its choice that
// removes it. The Global form's (global-settings.js) differ only in showing both the checks and the push questions
// for the default onApproval, which is either, depending on the repository. A yes-or-no question's select holds its
// setting, such as waitForChecks, as the ids yes and no, which yesNoChoiceId and yesNoValue convert. Both forms group
// their questions under the same section headings in the same order, each form showing only the sections and
// questions it has: REPOSITORY_SECTIONS and GLOBAL_SECTIONS, keyed by each question's setting, where name is the
// repository's name and tracker includes Linear's team.

export const CLEAR_CHOICE = "clear";

/** @typedef {{ title: string, keys: string[] }} SettingsSection */

/** @type {SettingsSection[]} */
const SETTINGS_SECTIONS = [
  { title: "Tracker", keys: ["name", "tracker"] },
  { title: "Approval", keys: ["approval", "onApproval", "waitForChecks", "pushAfterMerge"] },
  { title: "Worktrees", keys: ["worktreeSetup", "worktreeCommand", "spaceName", "close"] },
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
  "pushAfterMerge",
  "worktreeSetup",
  "worktreeCommand",
  "spaceName",
  "close",
  "pollSeconds",
]);

export const GLOBAL_SECTIONS = sectionsWith([
  "approval",
  "onApproval",
  "waitForChecks",
  "pushAfterMerge",
  "worktreeCommand",
  "spaceName",
  "close",
  "pollSeconds",
  "updateCheckHours",
]);

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

// onApproval is the repository's own, null on the choice that removes it, when fallbackOnApproval, the global
// value or the default, applies instead.
/**
 * @param {{ trackerChoice: string | null, trackerReady: boolean, onApproval: string | null | undefined, fallbackOnApproval?: string | null }} fields
 */
export function settingsFields({ trackerChoice, trackerReady, onApproval, fallbackOnApproval = null }) {
  return {
    teamSelect: trackerChoice === "linear" && trackerReady,
    waitForChecksSelect: (onApproval ?? fallbackOnApproval) === "pull-request",
    pushAfterMergeSelect: (onApproval ?? fallbackOnApproval) === "merge",
  };
}

// The Global form's fields: the checks question shows for a pull request and the push question for a merge, and
// both for the default onApproval, which is a pull request for a repository on GitHub and a merge otherwise.
/**
 * @param {{ onApproval: string | null | undefined }} fields
 */
export function globalSettingsFields({ onApproval }) {
  return {
    waitForChecksSelect: onApproval == null || onApproval === "pull-request",
    pushAfterMergeSelect: onApproval == null || onApproval === "merge",
  };
}
