// Collapsing the panel to a thin strip and expanding it again, by resizing the layout node that holds it.
// Whether it's collapsed is read from the panel's own width, so a divider dragged narrow collapses it too.
const MOD = "issues";

export const COLLAPSED_PX = 32;
export const DEFAULT_EXPANDED_PX = 368;
const COLLAPSED_BELOW_PX = 64;
// A drag toward the strip passes through every width on its way, so only a width at least this wide is one
// the panel returns to.
const REMEMBERED_MIN_PX = 280;

export const isCollapsed = (width) => width != null && width < COLLAPSED_BELOW_PX;
export const remembersWidth = (width) => width != null && width >= REMEMBERED_MIN_PX;

// The id of the node a divider sizes the panel by: the innermost node holding the panel, or the panel's own
// block, whose parent lays its children out in a row. Null when the layout doesn't place the panel.
export function collapsibleNodeId(root) {
  const search = (node, parent, candidate) => {
    const sized = parent?.type === "row" ? node.id : candidate;
    if (node.content?.mod === MOD) return sized ?? null;
    for (const child of node.children ?? []) {
      const found = search(child, node, sized);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return root ? (search(root, null, null) ?? null) : null;
}
