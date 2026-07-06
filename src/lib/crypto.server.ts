import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

function key() {
  const s = process.env.DEEPSEEK_KEY_ENC_SECRET;
  if (!s) throw new Error("DEEPSEEK_KEY_ENC_SECRET missing");
  return createHash("sha256").update(s).digest();
}

// Returns base64 string: iv(12) | tag(16) | ciphertext
export function encryptApiKey(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptApiKey(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}