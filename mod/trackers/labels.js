// The labels a tracker.update adds and removes ({ addLabels, removeLabels }) are checked against the labels the
// tracker has before anything is saved, so a misspelled name changes nothing.

// Throws, naming each one, when any of `names` isn't among `known`.
/**
 * @param {string[]} names
 * @param {string[]} known
 * @param {string} place
 */
export function refuseUnknownLabels(names, known, place) {
  const unknown = names.filter((name) => !known.includes(name));
  if (unknown.length === 1) throw new Error(`${place} has no label named ${unknown[0]}`);
  if (unknown.length) throw new Error(`${place} has no labels named ${unknown.join(", ")}`);
}
