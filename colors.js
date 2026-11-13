// Theme colors blended in code, for shades the theme doesn't name.
const HEX = /^#([0-9a-f]{6})$/i;
const channels = (hex) => [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));

// `from` moved `amount` (0 to 1) of the way to `to`; null unless both are #rrggbb.
export function mixColors(from, to, amount) {
  const [a, b] = [HEX.exec(from), HEX.exec(to)];
  if (!a || !b) return null;
  const [start, end] = [channels(a[1]), channels(b[1])];
  return `#${start.map((each, index) => Math.round(each + (end[index] - each) * amount).toString(16).padStart(2, "0")).join("")}`;
}

// Linear's workflow state colors, by status and by the list's Blocked group, tinted so fills stay calm
// on dark backgrounds.
export const STATUS_COLORS = {
  triage: "#fc7840",
  "in-progress": "#f2c94c",
  "in-review": "#4cb782",
  todo: "#e2e2e2",
  blocked: "#eb5757",
  backlog: "#bec2c8",
  done: "#5e6ad2",
  canceled: "#95a2b3",
};
// `alpha` is two hex digits of opacity.
export const tinted = (color, alpha = "30") => `${color}${alpha}`;
