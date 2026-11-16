// lint-staged's configuration, run by scripts/pre-commit: what each kind of staged file is checked and fixed with.
import path from "node:path";

const quoted = (files) => files.map((file) => `'${file}'`).join(" ");

const shellScripts =
  /^(bootstrap|install|setup|uninstall|scripts\/(demo-setup|check-shell|pre-commit)|\.claude\/hooks\/reload-mod\.sh|claude-plugin\/hooks\/[^/]+\.sh)$/;

export default {
  "*.{js,mjs}": (files) => [`eslint --fix ${quoted(files)}`, `prettier --write ${quoted(files)}`],
  "*.{json,md}": (files) => `prettier --write ${quoted(files)}`,
  // A function returning one command runs it once, however many files are staged, so the whole mod is type-checked once.
  "mod/**/*.js": () => "npm run typecheck",
  "**": (files) => {
    const scripts = files.map((file) => path.relative(process.cwd(), file)).filter((file) => shellScripts.test(file));
    return scripts.length > 0 ? `scripts/check-shell ${quoted(scripts)}` : [];
  },
};
