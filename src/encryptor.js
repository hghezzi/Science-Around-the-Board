// src/encryptor.js
// The standalone encryptor page (encryptor.html). Uses the same lockFile.js as the game.
import { encryptLockFile, decryptLockFile } from "./lockFile.js";

const MIN_PASSWORD = 8;
const $ = (id) => document.getElementById(id);

function show(message, kind = "") {
  const status = $("status");
  status.textContent = message;
  status.className = kind;
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = $("password").value;
  const file = $("fileInput").files[0];
  if (password.length < MIN_PASSWORD) {
    show(`Please choose a password of at least ${MIN_PASSWORD} characters.`, "error");
    $("password").focus();
    return;
  }
  if (!file) {
    show("Please choose your .tsv question file.", "error");
    return;
  }
  const button = $("go");
  button.disabled = true;
  show("Encrypting…");
  try {
    const text = await file.text();
    if (!text.includes("\t")) throw new Error("not-tsv");
    const locked = await encryptLockFile(text, password);
    // Check the result opens again before handing it over.
    if ((await decryptLockFile(locked, password)) !== text) throw new Error("verify");
    const filename = `${file.name.replace(/\.(tsv|txt)$/i, "") || "questions"}.lock`;
    download(filename, locked);
    show(`Done: "${filename}" was downloaded. Share it with the password.`, "success");
  } catch (err) {
    console.error(err);
    show(
      err && err.message === "not-tsv"
        ? "That file doesn't look like a question file (it has no tab-separated columns)."
        : "Couldn't encrypt the file. Please use an up-to-date browser on the https:// page.",
      "error",
    );
  } finally {
    button.disabled = false;
  }
});
