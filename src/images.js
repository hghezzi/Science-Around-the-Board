// src/images.js
// Resolve a question's imageFile to a URL. Images are always optional:
//   1. a file the players uploaded (matched by exact filename)
//   2. a full http(s) or data: URL written in the TSV
//   3. a file hosted with the site in public/questionImages/
// If none of these exist the <img> fails to load and is hidden (see QuestionImage).

export function resolveImage(name, uploaded = {}) {
  if (!name) return null;
  const file = String(name).trim();
  if (uploaded[file]) return uploaded[file];
  if (/^(https?:|data:)/i.test(file)) return file;
  return `./questionImages/${file}`;
}
