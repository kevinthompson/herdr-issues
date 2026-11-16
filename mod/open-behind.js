// The space.new arguments that open a space behind what's shown, for the Herdr version running the mod.
// space.new took `focus` after Herdr 0.1.15, which refuses arguments it doesn't know, and a mod's run() can't see
// that refusal to retry without it, so older versions open the space in front.

const LAST_VERSION_WITHOUT_FOCUS = [0, 1, 15];

/** @param {string | null | undefined} appVersion */
function takesFocus(appVersion) {
  const parts = /^(\d+)\.(\d+)\.(\d+)/
    .exec(appVersion ?? "")
    ?.slice(1)
    .map(Number);
  if (!parts) return false;
  const difference = parts.map((part, index) => part - LAST_VERSION_WITHOUT_FOCUS[index]).find((d) => d !== 0);
  return difference > 0;
}

/** @param {string | null | undefined} appVersion */
export const openBehindArgs = (appVersion) => (takesFocus(appVersion) ? { focus: false } : {});
