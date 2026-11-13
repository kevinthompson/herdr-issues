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
