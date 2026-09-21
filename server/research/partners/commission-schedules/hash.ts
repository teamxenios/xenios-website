import { createHash } from "node:crypto";
import type {
  CommissionScheduleDefinition,
  CommissionScheduleSnapshot,
} from "@shared/research/commission-schedules";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function immutableClone<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object" || Object.isFrozen(candidate)) return;
    Object.values(candidate).forEach(freeze);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

export function commissionScheduleHash(definition: CommissionScheduleDefinition): string {
  return createHash("sha256").update(canonicalJson(definition), "utf8").digest("hex");
}

export function createCommissionScheduleSnapshot(
  definition: CommissionScheduleDefinition,
): CommissionScheduleSnapshot {
  const copy = immutableClone(definition);
  return Object.freeze({
    definition: copy,
    hashAlgorithm: "sha256",
    scheduleHash: commissionScheduleHash(copy),
  });
}

export function scheduleSnapshotIsAuthentic(snapshot: CommissionScheduleSnapshot): boolean {
  return snapshot.hashAlgorithm === "sha256" &&
    commissionScheduleHash(snapshot.definition) === snapshot.scheduleHash;
}
