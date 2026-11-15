// A stand-in for the tracker every repository has, for testing commands without a tracker's API. Importing it
// points `mod/trackers/index.js` at this file, so a test file imports the modules that use trackers dynamically,
// after this one; useTracker sets the tracker trackerFor returns for one test.
import { registerHooks } from "node:module";

const realTrackers = new URL("../../mod/trackers/index.js", import.meta.url).href;
registerHooks({
  resolve: (specifier, context, nextResolve) => {
    const resolved = nextResolve(specifier, context);
    return resolved.url === realTrackers ? { url: import.meta.url, shortCircuit: true } : resolved;
  },
});

let current = null;

export const trackerFor = async () => current;

export function useTracker(t, tracker) {
  current = tracker;
  t.after(() => { current = null; });
}
