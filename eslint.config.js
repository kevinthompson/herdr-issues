// ESLint configuration: @eslint/js's recommended rules only, with each folder given the globals of the environment it runs in.
import js from "@eslint/js";
import globals from "globals";

const shellGlobals = {
  console: "readonly",
  process: "readonly",
  fetch: "readonly",
  window: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
};

export default [
  { ignores: ["node_modules/", "mod/gpui-kit.d.ts"] },
  js.configs.recommended,
  { files: ["**/*.js", "**/*.mjs", "bin/issues"], languageOptions: { sourceType: "module", globals: globals.node } },
  { files: ["mod/**"], ignores: ["mod/trackers/**"], languageOptions: { globals: shellGlobals } },
];
