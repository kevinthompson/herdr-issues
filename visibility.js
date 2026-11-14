// Whether the person can see the panel: Herdr's window is the active one, and the shown layout doesn't hide
// every block of the panel behind a hidden node or a stack showing another child. A panel the layout doesn't
// place, such as one in a pane of its own, counts as shown.
import { layout, window } from "herdr";

const MOD = "issues";

const shownChildren = (node) => {
  const children = node.children ?? [];
  if (node.type !== "stack") return children;
  const active = node.active ?? children[0]?.id;
  return children.filter((child) => child.id === active);
};
const placesPanel = (node) => node.content?.mod === MOD || (node.children ?? []).some(placesPanel);
const showsPanel = (node) => !node.hidden && (node.content?.mod === MOD || shownChildren(node).some(showsPanel));

export function panelVisible() {
  if (window()?.active === false) return false;
  const root = layout();
  return !root || !placesPanel(root) || showsPanel(root);
}
