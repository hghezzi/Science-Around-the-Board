import { describe, it, expect } from "vitest";
import CryptoJS from "crypto-js";
import { encryptLockFile, decryptLockFile, lockFormat, LOCK_PREFIX } from "../src/lockFile.js";

const TSV = "id\tquestion\toption1\nq1\tWhat is 2+2?\t4\n";
const FAST = { iterations: 100000 }; // the minimum the reader accepts; keeps the tests quick

describe("lockFile", () => {
  it("round-trips a question file with the right password", async () => {
    const lock = await encryptLockFile(TSV, "Class-Pass", FAST);
    expect(lock.startsWith(LOCK_PREFIX)).toBe(true);
    expect(lock).not.toContain("What is 2+2");
    expect(lockFormat(lock)).toBe("v2");
    expect(await decryptLockFile(lock, "Class-Pass")).toBe(TSV);
  });

  it("returns null for a wrong password or a damaged file", async () => {
    const lock = await encryptLockFile(TSV, "Class-Pass", FAST);
    expect(await decryptLockFile(lock, "class-pass")).toBeNull();
    const damaged = lock.slice(0, -6) + (lock.endsWith("AAAA==") ? "BBBB==" : "AAAA==");
    expect(await decryptLockFile(damaged, "Class-Pass")).toBeNull();
    expect(await decryptLockFile(`${LOCK_PREFIX}garbage`, "Class-Pass")).toBeNull();
  });

  it("uses a fresh salt and IV every time", async () => {
    const a = await encryptLockFile(TSV, "pw", FAST);
    const b = await encryptLockFile(TSV, "pw", FAST);
    expect(a).not.toBe(b);
  });

  it("refuses absurd iteration counts instead of hanging", async () => {
    const lock = await encryptLockFile(TSV, "pw", FAST);
    const tampered = lock.replace(`${LOCK_PREFIX}100000:`, `${LOCK_PREFIX}999999999:`);
    expect(await decryptLockFile(tampered, "pw")).toBeNull();
  });

  it("still opens legacy CryptoJS files from the old encryptor", async () => {
    const legacy = CryptoJS.AES.encrypt(TSV, "Old-Pass").toString();
    expect(lockFormat(legacy)).toBe("legacy");
    expect(await decryptLockFile(legacy, "Old-Pass")).toBe(TSV);
    expect(await decryptLockFile(legacy, "wrong")).toBeNull();
  });

  it("recognises plain text as not encrypted", async () => {
    expect(lockFormat(TSV)).toBeNull();
    expect(await decryptLockFile(TSV, "pw")).toBeNull();
  });
});
