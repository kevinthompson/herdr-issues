// The order of the issue labels dropdown (menu.js), apart from the view so the tests can run it without the kit:
// the issue's applied labels, then the tracker's other labels, each group in case-insensitive alphabetical order.
const alphabetically = (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b);

// `names` are the tracker's labels and `applied` the issue's, which may include some the tracker didn't list.
export function labelGroups(names, applied) {
  const appliedSet = new Set(applied);
  return {
    applied: [...appliedSet].sort(alphabetically),
    others: [...new Set(names)].filter((name) => !appliedSet.has(name)).sort(alphabetically),
  };
}
