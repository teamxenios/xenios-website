// The customer-account HTTP surface: /api/research/customer-account/*.
// REGISTERED at the protected seam (server/index.ts, since e42825d) with BOTH
// merged guards injected.
//
// Authorization model (the commerce/portal lanes' proven shape):
// the acting member comes ONLY from the injected guard; no handler reads an
// identity from a body, query, or path parameter; every port is keyed by the
// guard-attached member, so no request field can address another customer.
// The staff projection (partner attribution) is NOT exposed here at all —
// staff tooling reads it through the admin surface, never the member one.
//
// TWO doors, deliberately (P1-2, 2026-08-27):
//   * The seven PER-MEMBER paths (overview/orders/subscription/care/documents/
//     support) use `requireMember`: a customer with a billing problem must
//     still read their own account state.
//   * `catalog-priority` is NOT the caller's own account state — it is the
//     global availability projection (unreleased-product pipeline data), part
//     of the ACTIVE-member catalog experience, so it sits behind
//     `requireActiveMember` exactly like /api/research/member/catalog.

import type { Express, Request, Response } from "express";
import {
  SUPPORT_CASE_CATEGORIES,
  membershipRenewalMirrorMatches,
  type SupportCaseCategory,
} from "@shared/research/customer-account/contract";
import type { CustomerAccountPorts } from "./ports";
import { createCustomerAccountService } from "./service";

export interface CustomerAccountGuards {
  /** The merged member guard. Injected, so this module defines no parallel auth. */
  requireMember: (req: Request, res: Response, next: () => void) => void | Promise<void>;
  /**
   * The merged ACTIVE-member guard (status + billing gates). Guards only the
   * global catalog-priority projection; the per-member account paths stay on
   * requireMember so a billing-blocked customer can still see their own state.
   */
  requireActiveMember: (req: Request, res: Response, next: () => void) => void | Promise<void>;
}

const BASE = "/api/research/customer-account";

// A plain `as const` literal (not Object.freeze) so the route-uniqueness
// acceptance scanner can statically resolve every registration path.
export const CUSTOMER_ACCOUNT_PATHS = {
  overview: `${BASE}/overview`,
  orders: `${BASE}/orders`,
  subscription: `${BASE}/subscription`,
  care: `${BASE}/care`,
  documents: `${BASE}/documents`,
  support: `${BASE}/support`,
  catalogPriority: `${BASE}/catalog-priority`,
} as const;

function memberKeyOf(req: Request): string | null {
  const member = (req as { researchMember?: { id?: unknown } }).researchMember;
  const id = member?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function registerCustomerAccountApi(
  app: Express,
  ports: CustomerAccountPorts,
  guards: CustomerAccountGuards,
): void {
  const service = createCustomerAccountService(ports);

  const withMember = (
    handler: (memberKey: string, req: Request, res: Response) => Promise<void>,
  ) => {
    return guarded(guards.requireMember, handler);
  };

  // The active-member door: same handler shape, stricter guard. Used ONLY for
  // the global catalog-priority projection (P1-2) — see the header.
  const withActiveMember = (
    handler: (memberKey: string, req: Request, res: Response) => Promise<void>,
  ) => {
    return guarded(guards.requireActiveMember, handler);
  };

  function guarded(
    guard: CustomerAccountGuards["requireMember"],
    handler: (memberKey: string, req: Request, res: Response) => Promise<void>,
  ) {
    return (req: Request, res: Response) => {
      // Every response from this private surface is non-cacheable, including
      // guard denials, validation failures, missing resources, and errors.
      // Set the policy before invoking the guard so no early response can
      // escape without it.
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      void Promise.resolve(guard(req, res, async () => {
        const memberKey = memberKeyOf(req);
        if (memberKey === null) {
          // The guard passed but attached nothing usable: refuse, never guess.
          res.status(401).json({ kind: "denied", reason: "member_identity_unresolved" });
          return;
        }
        try {
          await handler(memberKey, req, res);
        } catch {
          res.status(500).json({ kind: "error" });
        }
      }));
    };
  }

  app.get(CUSTOMER_ACCOUNT_PATHS.overview, withMember(async (memberKey, _req, res) => {
    const resolved = await service.resolveOverview(memberKey, { staff: false });
    if (resolved.kind === "ok") {
      res.json({ kind: "ok", data: resolved.overview });
    } else if (resolved.kind === "unknown_customer") {
      res.status(404).json({ kind: "denied", reason: "customer_not_found" });
    } else {
      res.status(500).json({ kind: "error" });
    }
  }));

  app.get(CUSTOMER_ACCOUNT_PATHS.orders, withMember(async (memberKey, _req, res) => {
    res.json({ kind: "ok", data: await ports.orders.ordersFor(memberKey) });
  }));

  app.get(CUSTOMER_ACCOUNT_PATHS.subscription, withMember(async (memberKey, _req, res) => {
    const [membership, careEnrollment] = await Promise.all([
      ports.membership.membershipFor(memberKey),
      ports.care.careFor(memberKey),
    ]);
    if (!membershipRenewalMirrorMatches(membership)) {
      throw new Error("membership_renewal_mirror_invalid");
    }
    // Two objects, deliberately never merged: membership is administrative,
    // Care is operational, and neither implies the other.
    res.json({ kind: "ok", data: { membership, careEnrollment } });
  }));

  app.get(CUSTOMER_ACCOUNT_PATHS.care, withMember(async (memberKey, _req, res) => {
    res.json({ kind: "ok", data: await ports.care.careFor(memberKey) });
  }));

  app.get(CUSTOMER_ACCOUNT_PATHS.documents, withMember(async (memberKey, _req, res) => {
    res.json({ kind: "ok", data: await ports.documents.documentsFor(memberKey) });
  }));

  app.get(CUSTOMER_ACCOUNT_PATHS.support, withMember(async (memberKey, _req, res) => {
    res.json({ kind: "ok", data: await ports.support.casesFor(memberKey) });
  }));

  app.post(CUSTOMER_ACCOUNT_PATHS.support, withMember(async (memberKey, req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const category = body.category;
    const subject = body.subject;
    const description = body.description;
    if (
      typeof category !== "string" ||
      !(SUPPORT_CASE_CATEGORIES as readonly string[]).includes(category) ||
      typeof subject !== "string" || subject.trim().length === 0 || subject.length > 200 ||
      typeof description !== "string" || description.trim().length === 0 || description.length > 5000
    ) {
      res.status(400).json({ kind: "denied", reason: "invalid_support_case" });
      return;
    }
    try {
      const created = await ports.support.openCase(memberKey, {
        category: category as SupportCaseCategory,
        subject: subject.trim(),
        description: description.trim(),
      });
      res.status(201).json({ kind: "ok", data: created });
    } catch (err) {
      // An exhausted shared support budget (P2-3) is a throttle, not a
      // failure: 429 with the same machine-readable shape the questions door
      // answers, never a generic 500.
      if (err instanceof Error && err.message === "support_rate_limited") {
        res.status(429).json({ kind: "denied", reason: "rate_limited" });
        return;
      }
      throw err;
    }
  }));

  // ACTIVE members only (P1-2): this projection is global availability
  // pipeline data, not the caller's own account state, so it carries the same
  // door as the member catalog. Pending/paused/cancelled/past-due members are
  // refused by the guard with its machine-readable codes.
  app.get(CUSTOMER_ACCOUNT_PATHS.catalogPriority, withActiveMember(async (_memberKey, _req, res) => {
    const port = ports.catalogPriority;
    if (!port) {
      // No projection composed: refuse rather than invent one. The guard has
      // already run, so an unauthenticated probe still answers 401 above.
      res.status(404).json({ kind: "denied", reason: "catalog_priority_unavailable" });
      return;
    }
    res.json({ kind: "ok", data: await port.catalogPriorityFor() });
  }));

  // Authorized byte download for one OWNED document. Ownership lives inside
  // the port (the storage query is scoped by memberKey), so an unowned id, an
  // unknown id, and an absent download capability are indistinguishable — one
  // 404 denial for all three, and never a raw storage URL.
  app.get(`${BASE}/documents/:documentId`, withMember(async (memberKey, req, res) => {
    const open = ports.documents.openDocument?.bind(ports.documents);
    const documentId = typeof req.params.documentId === "string" ? req.params.documentId : "";
    const payload = open && documentId !== "" ? await open(memberKey, documentId) : null;
    if (payload === null || payload === undefined) {
      res.status(404).json({ kind: "denied", reason: "document_unavailable" });
      return;
    }
    res.setHeader("Content-Type", payload.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${payload.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
    );
    res.send(Buffer.from(payload.bytes));
  }));
}
