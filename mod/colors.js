// Theme colors blended in code, for shades the theme doesn't name, and the shades that differ between
// light and dark themes.
/** @typedef {Record<string, string>} Theme The panel theme, as herdr's theme() returns it. */

const HEX = /^#([0-9a-f]{6})$/i;
/** @param {string} hex */
const channels = (hex) => [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));

// `from` moved `amount` (0 to 1) of the way to `to`; null unless both are #rrggbb.
/** @param {string} from @param {string} to @param {number} amount @returns {string | null} */
export function mixColors(from, to, amount) {
  const [a, b] = [HEX.exec(from), HEX.exec(to)];
  if (!a || !b) return null;
  const [start, end] = [channels(a[1]), channels(b[1])];
  return `#${start
    .map((each, index) =>
      Math.round(each + (end[index] - each) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

// A light theme draws dark text. A theme whose text color isn't #rrggbb is taken as dark.
/** @param {Theme} t */
export function isLightTheme(t) {
  const match = HEX.exec(t.foreground ?? "");
  if (!match) return false;
  const [red, green, blue] = channels(match[1]);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue < 128;
}

// Linear's workflow state colors, by status and by the list's Blocked group.
/** @type {Record<string, string>} */
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
/** @type {Record<string, string>} */
export const DUE_COLORS = { overdue: "ansi1", soon: "working", later: "dim" };

// The opacity of a status color's fill, hover and border, as two hex digits, thin so fills stay calm on
// dark backgrounds. A light theme mixes the same share of the color into its panel's color instead.
const STATUS_ALPHAS = { fill: "30", hover: "48", border: "60" };
// In a light theme, the least a fill, hover and border move from the panel's lightness, as a share of the
// way to its text, so near-white statuses such as Todo still stand apart from the panel and its rows' hover.
const LIGHT_STATUS_MIN_STEPS = { fill: 0.1, hover: 0.15, border: 0.2 };

// A #rrggbb color's perceived lightness, from 0 to 255.
/** @param {string} hex */
const lightness = (hex) => {
  const [red, green, blue] = channels(hex.slice(1));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const panelBehindCards = (/** @type {Theme} */ t) => (HEX.test(t.canvas ?? "") ? t.canvas : t.surface) ?? "";

// A status's fill, hover and border colors in the theme `t`; null for a status without a color.
/** @param {string} status @param {Theme} t */
export function statusTints(status, t) {
  const color = STATUS_COLORS[status];
  return color ? colorTints(color, t) : null;
}

// A label's color laid thinly over the theme `t`, as the background of a grouped label's group; the theme's
// neutral hover shade for a label without a color.
/** @param {string | undefined} color @param {Theme} t */
export const labelTint = (color, t) => (color ? colorTints(color, t).fill : t.hover);

/** @param {string} color @param {Theme} t */
function colorTints(color, t) {
  const translucent = {
    fill: `${color}${STATUS_ALPHAS.fill}`,
    hover: `${color}${STATUS_ALPHAS.hover}`,
    border: `${color}${STATUS_ALPHAS.border}`,
  };
  if (!isLightTheme(t) || !HEX.test(panelBehindCards(t)) || !HEX.test(color)) return translucent;
  const tint = (/** @type {keyof typeof STATUS_ALPHAS} */ part) =>
    lightTint(color, t, parseInt(STATUS_ALPHAS[part], 16) / 255, LIGHT_STATUS_MIN_STEPS[part]);
  return { fill: tint("fill"), hover: tint("hover"), border: tint("border") };
}

// The light theme `t`'s panel color moved `share` of the way to `color`, or further, until it is at least
// `minStep` of the way from the panel's lightness to its text's. When the color is too close to the panel's
// lightness to get there, its `share` is darkened toward the text instead.
/** @param {string} color @param {Theme} t @param {number} share @param {number} minStep */
function lightTint(color, t, share, minStep) {
  const panelColor = panelBehindCards(t),
    panel = lightness(panelColor),
    text = lightness(t.foreground),
    leastDistance = Math.abs(panel - text) * minStep,
    colorDistance = Math.abs(panel - lightness(color));
  if (colorDistance >= leastDistance)
    return /** @type {string} */ (mixColors(panelColor, color, Math.max(share, leastDistance / colorDistance)));
  const tint = /** @type {string} */ (mixColors(panelColor, color, share)),
    targetLightness = panel - leastDistance;
  return /** @type {string} */ (
    mixColors(tint, t.foreground, (lightness(tint) - targetLightness) / (lightness(tint) - text))
  );
}

// A list row's hover, half as strong as the theme's: half as opaque when it's translucent, otherwise halfway
// back to the panel's surface, so it stays lighter than a chosen option's selected color.
/** @param {Theme} t */
export function rowHover(t) {
  const translucent = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(t.hover);
  if (translucent)
    return `#${translucent[1]}${Math.round(parseInt(translucent[2], 16) / 2)
      .toString(16)
      .padStart(2, "0")}`;
  return mixColors(t.surface, t.hover, 0.5) ?? t.hover;
}

// The issue view's bar of fields you can change, set apart from the issue's details: a shade lighter than a
// dark panel, and the theme's color for bars in a light one, where a shade toward `raised` is too faint to see.
/** @param {Theme} t */
export const fieldBar = (t) => (isLightTheme(t) ? t.chrome : (mixColors(t.surface, t.raised, 0.35) ?? t.surface));

// A card's fill, the theme's surface over the panel's canvas, and a chip on it, moved toward its text so it
// reads as a step off the card in light and dark themes.
/** @param {Theme} t */
export const cardFill = (t) => t.surface;
/** @param {Theme} t */
export const chipFill = (t) => mixColors(t.surface, t.foreground, 0.1) ?? t.raised;

// A secondary button's fill. A dark theme's raised color matches its selected one, so a button on a chosen
// option is moved a step toward the text there.
/** @param {Theme} t */
export const secondaryButtonFill = (t) =>
  isLightTheme(t) ? t.raised : (mixColors(t.raised, t.foreground, 0.08) ?? t.raised);

// Text a step softer than the theme's text color, so a heading over it in that color stands out without the
// theme offering a brighter one.
/** @param {Theme} t */
export const softText = (t) => mixColors(t.foreground, t.muted, 0.35) ?? t.foreground;
