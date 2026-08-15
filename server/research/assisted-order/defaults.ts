import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  AssistedOrderClock,
  AssistedOrderHasher,
  AssistedOrderIdGenerator,
  AssistedOrderLogger,
} from "./ports";

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(",")}]`;
  }
  const object = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
    .join(",")}}`;
}

export const systemAssistedOrderClock: AssistedOrderClock = Object.freeze({
  now: () => new Date(),
});

export const systemAssistedOrderIds: AssistedOrderIdGenerator = Object.freeze({
  uuid: () => randomUUID(),
  publicReference: (now) => {
    const date = now.toISOString().slice(0, 10).replace(/-/g, "");
    return `XRR-${date}-${randomBytes(5).toString("hex").toUpperCase()}`;
  },
  opaqueToken: () => randomBytes(32).toString("base64url"),
});

export const sha256AssistedOrderHasher: AssistedOrderHasher = Object.freeze({
  hash: (value) => createHash("sha256").update(value, "utf8").digest("hex"),
  stableHash: (value) =>
    createHash("sha256").update(stable(value), "utf8").digest("hex"),
});

export const consoleAssistedOrderLogger: AssistedOrderLogger = Object.freeze({
  info: (message, fields) => console.info(message, fields ?? {}),
  warn: (message, fields) => console.warn(message, fields ?? {}),
  error: (message, fields) => console.error(message, fields ?? {}),
});
