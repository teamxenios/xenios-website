import type { ClaimDto, ClaimReason, OrderDetailDto } from "@shared/research/commerce-api";
import { readMemberOrders } from "./read";

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(value);
const text = (value: unknown, max = 160): value is string => typeof value === "string"
  && value.length > 0 && value.length <= max && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const cents = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is string => typeof value === "string" && value.length <= 64
  && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const reasons: readonly string[] = ["damaged", "lost", "incorrect", "missing", "temperature_concern"];
const states: readonly string[] = ["submitted", "under_review", "information_requested", "approved", "declined", "resolved"];
const resolutions: readonly string[] = ["replacement", "refund", "partial_refund", "none"];

/** Route input is decoded once and must remain a single canonical identifier. */
export function decodeMemberOrderId(segment: unknown): string | null {
  if (typeof segment !== "string" || segment.length > 576) return null;
  try { const decoded = decodeURIComponent(segment); return id(decoded) ? decoded : null; } catch { return null; }
}

export function readMemberOrderDetail(value: unknown, expectedId: string): OrderDetailDto | null {
  if (!id(expectedId) || !object(value) || value.ok !== true || !object(value.order)) return null;
  const row = value.order;
  const summary = readMemberOrders({ ok: true, orders: [row] })?.[0];
  if (!summary || summary.orderId !== expectedId || !Array.isArray(row.lines)
    || !cents(row.shippingCents) || !cents(row.storeCreditAppliedCents)
    || (row.reviewReason !== null && !text(row.reviewReason, 2000))) return null;
  const skus = new Set<string>();
  const lines: OrderDetailDto["lines"] = [];
  for (const line of row.lines) {
    if (!object(line) || !text(line.sku) || skus.has(line.sku) || !text(line.displayName, 300)
      || !cents(line.quantity) || line.quantity === 0 || !cents(line.lineTotalCents)) return null;
    skus.add(line.sku);
    lines.push({ sku: line.sku, displayName: line.displayName, quantity: line.quantity, lineTotalCents: line.lineTotalCents });
  }
  return { ...summary, lines, shippingCents: row.shippingCents,
    storeCreditAppliedCents: row.storeCreditAppliedCents, reviewReason: row.reviewReason };
}

function readClaim(value: unknown): ClaimDto | null {
  if (!object(value) || !id(value.claimId) || !id(value.orderId) || !text(value.sku)
    || typeof value.reason !== "string" || !reasons.includes(value.reason)
    || typeof value.state !== "string" || !states.includes(value.state)
    || (value.resolution !== null && (typeof value.resolution !== "string" || !resolutions.includes(value.resolution)))
    || !timestamp(value.submittedAt)) return null;
  return { claimId: value.claimId, orderId: value.orderId, sku: value.sku, reason: value.reason as ClaimReason,
    state: value.state as ClaimDto["state"], resolution: value.resolution as ClaimDto["resolution"], submittedAt: value.submittedAt };
}

/** A claims list is supplementary, but malformed records never become a false empty history. */
export function readMemberClaims(value: unknown, order: OrderDetailDto): ClaimDto[] | null {
  if (!object(value) || value.ok !== true || !Array.isArray(value.claims)) return null;
  const ids = new Set<string>();
  const claims: ClaimDto[] = [];
  for (const row of value.claims) {
    const claim = readClaim(row);
    if (!claim || ids.has(claim.claimId)) return null;
    ids.add(claim.claimId);
    if (claim.orderId !== order.orderId) continue;
    if (!order.lines.some((line) => line.sku === claim.sku)) return null;
    claims.push(claim);
  }
  return claims;
}

/** A successful POST envelope is not confirmation unless it binds to the submitted order, item, and reason. */
export function readSubmittedMemberClaim(value: unknown, expected: { orderId: string; sku: string; reason: ClaimReason }): ClaimDto | null {
  if (!object(value) || value.ok !== true) return null;
  const claim = readClaim(value.claim);
  return claim && claim.orderId === expected.orderId && claim.sku === expected.sku && claim.reason === expected.reason ? claim : null;
}
