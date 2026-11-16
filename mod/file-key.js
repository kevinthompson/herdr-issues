// A short, stable file name for any text, such as a URL (FNV-1a).
/** @param {string} text */
export function fileKey(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, "0");
}
