import type { AttributionSnapshot, CatalogItem, CommitArguments, Estimate, NormalizedSubmission, RequestLine } from './ports';

export const SOURCE_KINDS: readonly string[];
export const AFFILIATIONS: readonly string[];
export const US_REGIONS: readonly string[];
export const MODES: readonly CatalogItem['workflowMode'][];
export const ESTIMATE_EXCLUSIONS: string;
export class InputError extends Error {
  readonly field: string;
  readonly status: number;
  readonly code: string;
  constructor(field: string, message: string, status?: number, code?: string);
}
export function text(value: unknown, field: string, max?: number, optional?: boolean): string;
export function validateSubmission(raw: unknown): NormalizedSubmission;
export function validateAgreements(accepted: readonly { kind: string; version: string }[], required: readonly { kind: string; version: string }[]): void;
export function publicCatalogItem(value: unknown): CatalogItem;
export function validateCurrentLine(input: RequestLine, item: CatalogItem | null): CommitArguments['snapshots'][number];
export function estimate(lines: readonly { quantity: number; unitPriceCents: number | null }[]): Estimate;
export function attributionSnapshot(input: NormalizedSubmission, receivedAt: string): AttributionSnapshot;
