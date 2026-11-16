// What an action bar button does and how it looks from its flags, apart from drawing it so the rules are testable.

export const SPIN_MS = 1000;
export const DISABLED_OPACITY = 0.5;

/**
 * A busy button shows a spinner and does nothing; a disabled one is dimmed and does nothing. Only the primary
 * button is filled, so every other one is outlined to read as a button.
 * @param {{ primary?: boolean, enabled?: boolean, busy?: boolean }} flags
 */
export function actionButtonState({ primary = false, enabled = true, busy = false }) {
  return {
    interactive: enabled && !busy,
    icon: busy ? "rotate-cw" : null,
    spin: busy ? SPIN_MS : 0,
    opacity: enabled ? 1 : DISABLED_OPACITY,
    outlined: !primary,
  };
}
