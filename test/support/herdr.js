// The `herdr` module the mod's modules load under test: the issues CLI's shim, with exec, spaces and panes
// replaceable for one test by stubHerdr. The app's layout, commands and shared values, which the CLI never
// needs, are added here for the same purpose. Tests import this file by its path, which is the same module.
import * as shim from "../../cli/herdr.js";

export * from "../../cli/herdr.js";

export const defaults = {
  exec: shim.exec,
  spaces: shim.spaces,
  panes: shim.panes,
  layout: () => null,
  run: () => null,
  shared: () => undefined,
  setShared: () => null,
  terminals: () => [],
  hc: async () => ({ code: 1, stdout: "", stderr: "" }),
  openOverlay: () => null,
  closeOverlay: () => null,
  props: () => ({}),
  theme: () => ({}),
  settings: () => ({}),
  updates: () => ({ app: { version: "0.0.0" } }),
};
let current = { ...defaults };

export const exec = (...args) => current.exec(...args);
export const spaces = () => current.spaces();
export const panes = () => current.panes();
export const layout = () => current.layout();
export const run = (...args) => current.run(...args);
export const shared = (...args) => current.shared(...args);
export const setShared = (...args) => current.setShared(...args);
export const terminals = () => current.terminals();
export const hc = (...args) => current.hc(...args);
export const openOverlay = (...args) => current.openOverlay(...args);
export const closeOverlay = (...args) => current.closeOverlay(...args);
export const props = (...args) => current.props(...args);
export const theme = (...args) => current.theme(...args);
export const settings = (...args) => current.settings(...args);
export const updates = () => current.updates();

// Replaces any of exec, spaces, panes, layout, run, shared, setShared, terminals, hc, openOverlay, closeOverlay, props, theme, settings and updates until the test `t` ends.
export function stubHerdr(t, replacements) {
  current = { ...defaults, ...replacements };
  t.after(() => {
    current = { ...defaults };
  });
}
