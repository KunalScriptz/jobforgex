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

function looksLikeBase64(value: string) {
  const compact = value.trim();
  return compact.length >= 40 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
}

function decodeStoredValue(value: unknown): Buffer {
  if (value == null) throw new Error("No encrypted API key stored");

  if (value instanceof Uint8Array) {
    const asText = Buffer.from(value).toString("utf8").trim();
    if (looksLikeBase64(asText)) return Buffer.from(asText, "base64");
    return Buffer.from(value);
  }

  const raw = String(value).trim();
  if (!raw) throw new Error("Encrypted API key is empty");

  // Lovable Cloud returns bytea columns as a hex string (\x...). Older saves
  // stored the base64 payload as bytes, so decode hex -> text -> base64.
  if (raw.startsWith("\\x")) {
    const bytes = Buffer.from(raw.slice(2), "hex");
    const asText = bytes.toString("utf8").trim();
    if (looksLikeBase64(asText)) return Buffer.from(asText, "base64");
    return bytes;
  }

  const decoded = Buffer.from(raw, "base64");
  const decodedAsText = decoded.toString("utf8").trim();
  if (looksLikeBase64(decodedAsText)) return Buffer.from(decodedAsText, "base64");
  return decoded;
}

export function decryptApiKey(stored: unknown): string {
  const buf = decodeStoredValue(stored);
  if (buf.length < 29) throw new Error("Encrypted API key payload is malformed");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}