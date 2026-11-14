// Collapsing the panel to a thin strip and expanding it again, by resizing the layout node that holds it.
// Whether it's collapsed is read from the panel's own width, so a divider dragged narrow collapses it too.
import { layout, run, setShared, shared } from "herdr";

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

const findNode = (node, id) => node?.id === id ? node : (node?.children ?? []).reduce((found, child) => found ?? findNode(child, id), null);

// The node's size as the layout states it, in px at zoom 1 or as a weight. The panel's measured width is zoomed
// and inside the node's padding, so handing it back to layout.resize would widen the panel on every expand.
function layoutSize(id) {
  const size = findNode(layout(), id)?.size;
  if (typeof size?.px === "number") return { px: size.px };
  if (typeof size?.weight === "number") return { weight: size.weight };
  return null;
}

// Shared, so the size to return to outlasts this copy of the mod and follows the layout into every space.
const expandedSizeKey = () => `issues.expandedSize:${shared("layout") ?? "main"}`;
const sameSize = (a, b) => a?.px === b?.px && a?.weight === b?.weight;
const isSize = (value) => typeof value?.px === "number" || typeof value?.weight === "number";

function rememberExpandedSize(id) {
  const size = layoutSize(id);
  if (size && !sameSize(size, shared(expandedSizeKey()))) setShared(expandedSizeKey(), size);
}

// Called with each width the panel measures, so a divider drag sets the size it returns to.
export function noticeWidth(width) {
  if (!remembersWidth(width)) return;
  const id = collapsibleNodeId(layout());
  if (id) rememberExpandedSize(id);
}

// Herdr remembers the node's size in the layout, so the panel stays collapsed or expanded in every space.
export function toggleCollapsed(width) {
  const id = collapsibleNodeId(layout());
  if (!id || width == null) return;
  if (isCollapsed(width)) {
    const remembered = shared(expandedSizeKey());
    run("layout.resize", { id, ...(isSize(remembered) ? remembered : { px: DEFAULT_EXPANDED_PX }) });
  } else {
    rememberExpandedSize(id);
    run("layout.resize", { id, px: COLLAPSED_PX });
  }
}
