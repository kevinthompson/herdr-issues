// The `herdr` module the mod's modules load under test: the issues CLI's shim, with exec, spaces, panes,
// agents and setAgentOrder replaceable for one test by stubHerdr. Tests import this file by its path, which is the same module.
import * as shim from "../../cli/herdr.js";

export * from "../../cli/herdr.js";

export const defaults = { exec: shim.exec, spaces: shim.spaces, panes: shim.panes, agents: shim.agents, setAgentOrder: shim.setAgentOrder };
let current = { ...defaults };

export const exec = (...args) => current.exec(...args);
export const spaces = () => current.spaces();
export const panes = () => current.panes();
export const agents = () => current.agents();
export const setAgentOrder = (addresses) => current.setAgentOrder(addresses);

// Replaces any of exec, spaces, panes, agents and setAgentOrder until the test `t` ends.
export function stubHerdr(t, replacements) {
  current = { ...defaults, ...replacements };
  t.after(() => { current = { ...defaults }; });
}
