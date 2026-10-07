// src/lockFile.js
// Password-protected question files (.lock). Works in browsers and in Node 20+
// (both provide the Web Crypto API as globalThis.crypto).
//
// Current format, written by encryptor.html (one line of text):
//   SAB-LOCK-v2:<PBKDF2 iterations>:<salt, base64>:<iv, base64>:<AES-256-GCM ciphertext, base64>
// The key is derived from the class password with PBKDF2-SHA256, so each password
// guess costs an attacker the same work as a real unlock. GCM also detects a wrong
// password or a damaged file instead of producing garbage.
//
// Legacy format (files made before October 2026): CryptoJS AES with its
// OpenSSL-style key derivation, always starting with "U2FsdGVkX1" ("Salted__").
// These still open; crypto-js is only downloaded when such a file is used.
//
// What this protects against: casual reading of the answer key in a file or
// link. Every student who has the password can read the file, so it is not a
// way to keep answers secret from a determined class.

export const LOCK_PREFIX = "SAB-LOCK-v2:";
export const LEGACY_PREFIX = "U2FsdGVkX1";
export const DEFAULT_ITERATIONS = 600000; // OWASP 2023 recommendation for PBKDF2-SHA256
const MIN_ITERATIONS = 100000;
const MAX_ITERATIONS = 10000000;

/** "v2", "legacy" or null for text that isn't an encrypted question file. */
export function lockFormat(text) {
  const s = String(text || "").trim();
  if (s.startsWith(LOCK_PREFIX)) return "v2";
  if (s.startsWith(LEGACY_PREFIX)) return "legacy";
  return null;
}

const subtle = () => {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error("This browser can't decrypt files here (Web Crypto needs an https page).");
  return c.subtle;
};

const toBase64 = (bytes) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromBase64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function deriveKey(password, salt, iterations, usage) {
  const material = await subtle().importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

/** Encrypt a question file's text with a class password. Returns the .lock file text. */
export async function encryptLockFile(plainText, password, { iterations = DEFAULT_ITERATIONS } = {}) {
  if (!password) throw new Error("A password is required.");
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations, "encrypt");
  const cipher = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plainText)));
  return `${LOCK_PREFIX}${iterations}:${toBase64(salt)}:${toBase64(iv)}:${toBase64(cipher)}`;
}

async function decryptV2(text, password) {
  const parts = text.trim().slice(LOCK_PREFIX.length).split(":");
  if (parts.length !== 4) return null;
  const iterations = Number(parts[0]);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return null;
  try {
    const [salt, iv, cipher] = parts.slice(1).map(fromBase64);
    const key = await deriveKey(password, salt, iterations, "decrypt");
    const plain = await subtle().decrypt({ name: "AES-GCM", iv }, key, cipher);
    return new TextDecoder().decode(plain);
  } catch (e) {
    if (e instanceof Error && /Web Crypto/.test(e.message)) throw e;
    return null; // wrong password or damaged file
  }
}

async function decryptLegacy(text, password) {
  const [{ default: AES }, { default: Utf8 }] = await Promise.all([import("crypto-js/aes.js"), import("crypto-js/enc-utf8.js")]);
  try {
    return AES.decrypt(text.trim(), password).toString(Utf8) || null;
  } catch {
    return null; // wrong passwords often produce bytes that aren't valid UTF-8
  }
}

/**
 * Decrypt a .lock file. Resolves to the question file's text, or null when the
 * password is wrong. Rejects only when decryption can't run at all (old browser,
 * or the decryption code couldn't be downloaded).
 */
export async function decryptLockFile(text, password) {
  const format = lockFormat(text);
  const out = format === "v2" ? await decryptV2(text, password) : format === "legacy" ? await decryptLegacy(text, password) : null;
  return out && out.includes("\t") ? out : null;
}
