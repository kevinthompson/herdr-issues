// Where a link in an issue's body points: a URL with a scheme stays as it is, and anything else is
// a file, read relative to the issue's own folder, as GitHub reads links in Markdown files.
import { home } from "herdr";

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

const folderOf = (path) => path.slice(0, path.lastIndexOf("/"));

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
const isRelativePath = (text) => !/^[/~]/.test(text) && !SCHEME.test(text);

// Applies `rewrite` to each line outside fenced code.
function outsideFences(markdown, rewrite) {
  let inFence = false;
  return markdown.split("\n").map((line) => {
    if (FENCE.test(line)) { inFence = !inFence; return line; }
    return inFence ? line : rewrite(line);
  }).join("\n");
}

export function codeSpanPaths(markdown) {
  const paths = new Set();
  outsideFences(markdown, (line) => {
    for (const [, , text] of line.matchAll(CODE_SPAN)) if (isRelativePath(text)) paths.add(text);
    return line;
  });
  return [...paths];
}

export function linkCodeSpanFiles(markdown, root, files) {
  if (!files.size) return markdown;
  return outsideFences(markdown, (line) => line.replace(CODE_SPAN, (span, before, text) =>
    files.has(text) ? `${before}[\`${text}\`](file://${encodeURI(`${root}/${text}`)})` : span));
}

export function linkTarget(url, issuePath) {
  if (/^file:\/\//i.test(url)) return { file: decodeURIComponent(url.replace(/^file:\/\/[^/]*/i, "")) };
  if (SCHEME.test(url)) return { url };
  const path = decodeURIComponent(url.replace(/[?#].*$/, ""));
  if (path.startsWith("/")) return { file: normalized(path) };
  if (path.startsWith("~/")) return { file: normalized(`${home()}/${path.slice(2)}`) };
  return { file: normalized(`${folderOf(issuePath)}/${path}`) };
}
