// The space the issue list sets around each status group beyond the list's own gap: a group whose card is open
// is set apart above and below by the same space, while collapsed groups, and expanded ones with no issues to
// show, stack at the gap alone.

export const OPEN_GROUP_SPACE_PX = 14;

// Each group's { above, below }, given which groups show an open card, in list order. A card that follows
// another already has that card's space below it, so it adds none above, and the first group adds none, leaving
// the list's top padding as it is.
/**
 * @param {boolean[]} openCards
 * @returns {{ above: number, below: number }[]}
 */
export function groupSpacing(openCards) {
  return openCards.map((open, index) => ({
    above: open && index > 0 && !openCards[index - 1] ? OPEN_GROUP_SPACE_PX : 0,
    below: open ? OPEN_GROUP_SPACE_PX : 0,
  }));
}
