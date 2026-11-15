// Theme colors blended in code, for shades the theme doesn't name, and the shades that differ between
// light and dark themes.
const HEX = /^#([0-9a-f]{6})$/i;
const channels = (hex) => [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));

// `from` moved `amount` (0 to 1) of the way to `to`; null unless both are #rrggbb.
export function mixColors(from, to, amount) {
  const [a, b] = [HEX.exec(from), HEX.exec(to)];
  if (!a || !b) return null;
  const [start, end] = [channels(a[1]), channels(b[1])];
  return `#${start.map((each, index) => Math.round(each + (end[index] - each) * amount).toString(16).padStart(2, "0")).join("")}`;
}

// A light theme draws dark text. A theme whose text color isn't #rrggbb is taken as dark.
export function isLightTheme(t) {
  const match = HEX.exec(t.foreground ?? "");
  if (!match) return false;
  const [red, green, blue] = channels(match[1]);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue < 128;
}

// Linear's workflow state colors, by status and by the list's Blocked group.
const STATUS_COLORS = {
  triage: "#fc7840",
  "in-progress": "#f2c94c",
  "in-review": "#4cb782",
  todo: "#e2e2e2",
  blocked: "#eb5757",
  backlog: "#bec2c8",
  done: "#5e6ad2",
  canceled: "#95a2b3",
};
// A due date's theme color by its urgency (dueStatus in issue.js), matching the SLA's colors in the list.
export const DUE_COLORS = { overdue: "ansi1", soon: "working", later: "dim" };

// The opacity of a status color's fill, hover and border, as two hex digits, thin so fills stay calm on
// dark backgrounds. On a light one the color is darkened toward the text and laid on thicker, or the
// near-white statuses such as Todo would vanish.
const DARK_STATUS_ALPHAS = { fill: "30", hover: "48", border: "60" };
const LIGHT_STATUS_ALPHAS = { fill: "48", hover: "6c", border: "90" };
const LIGHT_STATUS_DARKENING = 0.4;

// A status's fill, hover and border colors in the theme `t`; null for a status without a color.
export function statusTints(status, t) {
  const color = STATUS_COLORS[status];
  if (!color) return null;
  const light = isLightTheme(t);
  const base = light ? mixColors(color, t.foreground, LIGHT_STATUS_DARKENING) ?? color : color;
  const alphas = light ? LIGHT_STATUS_ALPHAS : DARK_STATUS_ALPHAS;
  return { fill: `${base}${alphas.fill}`, hover: `${base}${alphas.hover}`, border: `${base}${alphas.border}` };
}

// A list row's hover. A dark theme's is half as strong as the theme's: half as opaque when it's
// translucent, otherwise halfway back to the panel's surface. A light theme's is already faint, so it stays whole.
export function rowHover(t) {
  if (isLightTheme(t)) return t.hover;
  const translucent = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(t.hover);
  if (translucent) return `#${translucent[1]}${Math.round(parseInt(translucent[2], 16) / 2).toString(16).padStart(2, "0")}`;
  return mixColors(t.surface, t.hover, 0.5) ?? t.hover;
}

// The issue view's bar of fields you can change, set apart from the issue's details: a shade lighter than a
// dark panel, and the theme's color for bars in a light one, where a shade toward `raised` is too faint to see.
export const fieldBar = (t) => (isLightTheme(t) ? t.chrome : mixColors(t.surface, t.raised, 0.35) ?? t.surface);
