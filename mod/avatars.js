// Assignee avatars, downloaded once into the app's data folder: Herdr's image() only loads files under
// the app's own folder, never a URL. Each file is named for the avatar's URL, so a changed avatar is
// fetched again. A row shows an avatar only once its file is on disk.
import { appHome, exec } from "herdr";
import { fileKey } from "./file-key.js";

const FOLDER = "data/issues/avatars";
const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

// key → the image's path from the app folder, or null while it downloads or after it failed.
const avatars = new Map();
let cached = null;

// The files already downloaded, read once.
function cachedFiles() {
  cached ??= exec("ls", ["-1", `${appHome()}/${FOLDER}`]).then(
    (listing) => (listing.code === 0 ? listing.stdout.split("\n").filter(Boolean) : []),
    () => [],
  );
  return cached;
}

async function download(url, key) {
  const folder = `${appHome()}/${FOLDER}`,
    partial = `${folder}/${key}.part`;
  await exec("mkdir", ["-p", folder]);
  const fetched = await exec("curl", ["-fsSL", "--max-time", "20", "-o", partial, "-w", "%{content_type}", url]);
  const extension = fetched.code === 0 && EXTENSIONS[fetched.stdout.split(";")[0].trim().toLowerCase()];
  if (!extension) {
    await exec("rm", ["-f", partial]);
    return null;
  }
  const moved = await exec("mv", [partial, `${folder}/${key}.${extension}`]);
  return moved.code === 0 ? `${FOLDER}/${key}.${extension}` : null;
}

async function load(url, key) {
  const existing = (await cachedFiles()).find((file) => file.startsWith(`${key}.`) && !file.endsWith(".part"));
  const path = existing ? `${FOLDER}/${existing}` : await download(url, key).catch(() => null);
  avatars.set(key, path);
  return path;
}

// The avatar's path for image(), or null until it is on disk. The first request for an avatar starts
// its download and hands onLoading the promise of its path, so the caller can redraw when it arrives.
export function avatarImage(url, onLoading) {
  if (!url) return null;
  const key = fileKey(url);
  if (!avatars.has(key)) {
    avatars.set(key, null);
    onLoading(load(url, key));
  }
  return avatars.get(key);
}
