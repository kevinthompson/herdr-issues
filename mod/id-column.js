// The width of the issue list's ID column: wide enough for the longest ID the list shows, and never narrower than
// six characters, shared by every row so the titles beside it start at the same edge.

// The widest character of an ID at the list's 11px, such as a digit or a capital, so a column sized by it
// truncates none.
const ID_CHAR_PX = 8;
const MIN_ID_CHARS = 6;

/**
 * @param {string[]} ids
 * @returns {number}
 */
export function idColumnWidth(ids) {
  const longest = Math.max(MIN_ID_CHARS, ...ids.map((id) => id.length));
  return longest * ID_CHAR_PX;
}
