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

export function linkTarget(url, issuePath) {
  if (/^file:\/\//i.test(url)) return { file: decodeURIComponent(url.replace(/^file:\/\/[^/]*/i, "")) };
  if (SCHEME.test(url)) return { url };
  const path = decodeURIComponent(url.replace(/[?#].*$/, ""));
  if (path.startsWith("/")) return { file: normalized(path) };
  if (path.startsWith("~/")) return { file: normalized(`${home()}/${path.slice(2)}`) };
  return { file: normalized(`${folderOf(issuePath)}/${path}`) };
}
