import { keccak_256 } from "@noble/hashes/sha3.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

export function canonicalizeJson(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError("Canonical JSON numbers must be safe integers");
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${Array.from(value, canonicalizeJson).join(",")}]`;
  }

  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON only supports plain objects");
    }

    const fields = Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalizeJson(Reflect.get(value, key))}`
      );

    return `{${fields.join(",")}}`;
  }

  throw new TypeError("Canonical JSON contains an unsupported value");
}

export function keccak256Hex(value: string): `0x${string}` {
  const digest = keccak_256(utf8ToBytes(value));
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `0x${hex}`;
}

export async function sha256Hex(value: string): Promise<`0x${string}`> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return `0x${hex}`;
}
