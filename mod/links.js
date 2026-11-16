// Where a link in an issue's body points: a URL with a scheme stays as it is, and anything else is
// a file, read relative to the repository's root.
import { home } from "herdr";

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** @param {string} path */
function normalized(path) {
  const parts = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return `/${parts.join("/")}`;
}

// Issues name files as inline code relative to the repository, such as `src/main.c`. A span counts
// as a file only once it is found on disk, so code that merely looks like a path stays plain.
const CODE_SPAN = /(^|[^`[])`([^`\s()]+)`(?!`)/g;
const FENCE = /^\s*(```|~~~)/;
/** @param {string} text */
const isRelativePath = (text) => !/^[/~]/.test(text) && !SCHEME.test(text);

// Applies `rewrite` to each line outside fenced code.
/**
 * @param {string} markdown
 * @param {(line: string) => string} rewrite
 */
function outsideFences(markdown, rewrite) {
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (FENCE.test(line)) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : rewrite(line);
    })
    .join("\n");
}

/** @param {string} markdown */
export function codeSpanPaths(markdown) {
  /** @type {Set<string>} */
  const paths = new Set();
  outsideFences(markdown, (line) => {
    for (const [, , text] of line.matchAll(CODE_SPAN)) if (isRelativePath(text)) paths.add(text);
    return line;
  });
  return [...paths];
}

/**
 * @param {string} markdown
 * @param {string} root
 * @param {Set<string>} files
 */
export function linkCodeSpanFiles(markdown, root, files) {
  if (!files.size) return markdown;
  return outsideFences(markdown, (line) =>
    line.replace(CODE_SPAN, (span, before, text) =>
      files.has(text) ? `${before}[\`${text}\`](file://${encodeURI(`${root}/${text}`)})` : span,
    ),
  );
}

/**
 * @param {string} url
 * @param {string} root
 * @returns {{ file: string } | { url: string }}
 */
export function linkTarget(url, root) {
  if (/^file:\/\//i.test(url)) return { file: decodeURIComponent(url.replace(/^file:\/\/[^/]*/i, "")) };
  if (SCHEME.test(url)) return { url };
  const path = decodeURIComponent(url.replace(/[?#].*$/, ""));
  if (path.startsWith("/")) return { file: normalized(path) };
  if (path.startsWith("~/")) return { file: normalized(`${home()}/${path.slice(2)}`) };
  return { file: normalized(`${root}/${path}`) };
}
