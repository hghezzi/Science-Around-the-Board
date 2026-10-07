// src/images.js
// Resolve a question's imageFile to a URL. Images are always optional:
//   1. a file the players uploaded (matched by filename; see findUpload)
//   2. a full http(s) or data: URL written in the TSV
//   3. a file in the image folder from a shared game link (?images=)
//   4. a file hosted with the site in public/questionImages/
// If none of these exist the <img> fails to load and is hidden (see QuestionImage).

const encodePath = (file) => file.split("/").map(encodeURIComponent).join("/");

/**
 * An uploaded file for `file`: the exact name first, then ignoring letter case
 * and any folder in the TSV ("images/Fig1.PNG" finds an upload named "fig1.png").
 * Browsers upload bare filenames, and case often changes when files are copied.
 */
function findUpload(file, uploaded) {
  if (uploaded[file]) return uploaded[file];
  const base = file.split("/").pop().toLowerCase();
  const match = Object.keys(uploaded).find((name) => name.toLowerCase() === base);
  return match ? uploaded[match] : null;
}

/** True when the players uploaded a file for this imageFile name. */
export const isUploaded = (name, uploaded = {}) => Boolean(name && findUpload(String(name).trim(), uploaded || {}));

export function resolveImage(name, uploaded = {}, base = "") {
  if (!name) return null;
  const file = String(name).trim();
  if (!file) return null;
  const upload = findUpload(file, uploaded || {});
  if (upload) return upload;
  if (/^(https?:|data:)/i.test(file)) return file;
  if (base) return `${base.replace(/\/+$/, "")}/${encodePath(file)}`;
  return `./questionImages/${encodePath(file)}`;
}
