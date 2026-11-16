// Collapsing the panel to a thin strip and expanding it again, by resizing the layout node that holds it.
// Whether it's collapsed is read from the panel's own width, so a divider dragged narrow collapses it too, or from a toggle that is still resizing.
import { layout, run, setShared, shared } from "herdr";

const MOD = "issues";

export const COLLAPSED_PX = 32;
const COLLAPSED_BELOW_PX = 64;
// A drag toward the strip passes through every width on its way, so only a width at least this wide is one
// the panel returns to.
const REMEMBERED_MIN_PX = 280;
// Herdr shares what fixed siblings leave by weight. Half its weighted siblings' weight expands the panel to a
// third of that space: near 368px in a typical window beside the terminals at weight 2, as setup lays it out.
const DEFAULT_SHARE_OF_SIBLING_WEIGHT = 0.5;
// Herdr's weight for a node without a size.
const UNSIZED_WEIGHT = 1;

export const isCollapsed = (width) => width != null && width < COLLAPSED_BELOW_PX;
export const remembersWidth = (width) => width != null && width >= REMEMBERED_MIN_PX;

// The node a divider sizes the panel by, with the row laying it out: the innermost node holding the panel, or
// the panel's own block, whose parent lays its children out in a row. Null when the layout doesn't place the panel.
function sizedNode(root) {
  const search = (node, parent, candidate) => {
    const sized = parent?.type === "row" ? { node, row: parent } : candidate;
    if (node.content?.mod === MOD) return sized ?? null;
    for (const child of node.children ?? []) {
      const found = search(child, node, sized);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return root ? (search(root, null, null) ?? null) : null;
}

export const collapsibleNodeId = (root) => sizedNode(root)?.node.id ?? null;

const isWeight = (value) => typeof value === "number" && value > 0;
const weightOf = (node) => (isWeight(node?.size?.weight) ? node.size.weight : null);

// Shared, so the weight to return to outlasts this copy of the mod and follows the layout into every space. The
// key held a size in px at first, which expanding ignores.
const expandedSizeKey = () => `issues.expandedSize:${shared("layout") ?? "main"}`;

// The node's weight as the layout states it, never its measured width: that is zoomed and inside the node's
// padding, and a size in px wouldn't keep the panel's share as the window resizes.
function rememberExpandedWeight({ node }) {
  const weight = weightOf(node);
  if (weight != null && shared(expandedSizeKey())?.weight !== weight) setShared(expandedSizeKey(), { weight });
}

function defaultExpandedWeight({ node, row }) {
  const weighted = row.children.filter((sibling) => sibling !== node && !sibling.hidden && sibling.size?.px == null);
  const siblingWeight = weighted.reduce((sum, sibling) => sum + (weightOf(sibling) ?? UNSIZED_WEIGHT), 0);
  return siblingWeight > 0 ? siblingWeight * DEFAULT_SHARE_OF_SIBLING_WEIGHT : UNSIZED_WEIGHT;
}

// Called with each width the panel measures, so a divider drag sets the weight it returns to.
export function noticeWidth(width) {
  if (!remembersWidth(width)) return;
  const sized = sizedNode(layout());
  if (sized) rememberExpandedWeight(sized);
}

// Herdr remembers the node's size in the layout, so the panel stays collapsed or expanded in every space.
// Expanded, the panel is sized by weight, so it keeps its share as the window resizes; collapsed, it's a strip
// fixed in px. Returns "collapse" or "expand" for the resize it ran, or null when the layout allowed none.
export function toggleCollapsed(width) {
  const sized = sizedNode(layout());
  if (!sized || width == null) return null;
  const { id } = sized.node;
  if (isCollapsed(width)) {
    const remembered = shared(expandedSizeKey())?.weight;
    run("layout.resize", { id, weight: isWeight(remembered) ? remembered : defaultExpandedWeight(sized) });
    return "expand";
  }
  rememberExpandedWeight(sized);
  run("layout.resize", { id, px: COLLAPSED_PX });
  return "collapse";
}

// Whether the panel draws as the strip. A toggle that collapses it counts as collapsed at once, until the
// measured width catches up, so no frame lays the content out in the narrowing container; a width measured
// narrow by a drag collapses it too.
export function collapseState() {
  let collapsePending = false;
  let width;
  return {
    get width() { return width; },
    get collapsed() { return collapsePending || isCollapsed(width); },
    noticeWidth(measured) {
      width = measured;
      if (isCollapsed(measured)) collapsePending = false;
      noticeWidth(measured);
    },
    toggle() {
      const direction = toggleCollapsed(collapsePending ? COLLAPSED_PX : width);
      if (direction) collapsePending = direction === "collapse";
    },
  };
}
