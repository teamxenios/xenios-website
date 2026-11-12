/**
 * Disposable rehearsal of supabase/candidates/request_intent_all_listed_lines.sql.
 * Only the owned postgres:16 container is used; no host database or credential.
 * It runs where the other database-backed request tests run, and nowhere else.
 *
 * What it shows, in one database:
 *  - before the candidate, the line check accepts a held line and refuses a
 *    coming-soon line and a supply or service line, so a request holding one of
 *    those is refused whole;
 *  - after the candidate, the same request is stored once and replays;
 *  - the other rules of the line check still refuse after it. The cases below
 *    cover each of them: the value must be a list of 1 to 200 lines; only the
 *    allowed keys; a whole-number quantity from 1 to 100; a pending line;
 *    boolean flags; an allowed workflow, with clinical review on a provider
 *    line; required text fields present, non-empty and at most 300 characters;
 *    a specification and a refusal that are text or null; no duplicate line.
 * It is a rehearsal of the SQL, not evidence that anything was applied anywhere.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect } from "vitest";
import { sha256AssistedOrderHasher } from "../defaults";
import type { RequestIntentLine } from "../../../../shared/research/assisted-order/request-intent";
import { requestIntentRepository } from "./rpc-repository";
import type { CreateIntent } from "./service";
import { createDurableJourneyFixture, pg16It, submission } from "./durable-journey.pg.fixture";

function line(id: string, overrides: Partial<RequestIntentLine> = {}): RequestIntentLine {
  return {
    productId: "product-" + id, variantId: "pc-" + id, sourceVariantId: "var-" + id,
    productName: "Synthetic " + id, specification: "Synthetic exact variant " + id,
    family: "research_peptides_materials", workflowMode: "request_pricing", quantity: 1,
    researchUseOnly: true, clinicalReviewRequired: false,
    sourceDisplayState: "request_access", sourceVariantDisplayState: "request_access",
    sourceRefusal: null, catalogVersion: "synthetic-v1", reviewState: "pending",
    ...overrides,
  };
}
// The three kinds of line the quote cart must be able to hold.
const held = line("held", {
  specification: "Synthetic strength unverified and formulation pending", workflowMode: "availability_review",
  sourceDisplayState: "approval_required", sourceVariantDisplayState: "approval_required",
  sourceRefusal: "formulation_hold",
});
const comingSoon = line("soon", {
  workflowMode: "availability_review", sourceDisplayState: "coming_soon", sourceVariantDisplayState: "coming_soon",
});
const supply = line("supply", {
  family: "shipping_and_fulfillment", workflowMode: "availability_review", researchUseOnly: false,
  // Both real rows of this family carry care_pathway on both state fields.
  sourceDisplayState: "care_pathway", sourceVariantDisplayState: "care_pathway",
  sourceRefusal: "non_merchandise_family",
});

describe("the request store's line check, before and after the all-listed-lines candidate", () => {
  pg16It("accepts a coming-soon line and a supply or service line only after the candidate, and keeps the other rules", async () => {
    const fixture = createDurableJourneyFixture();
    const { sql, counts } = fixture;
    const valid = async (lines: unknown) =>
      (await sql("select request_intent_private.valid_lines($1::jsonb) as ok", [JSON.stringify(lines)])).rows[0].ok;
    const input = submission();
    const contact = { ...input.contact, billingAddress: input.contact.shippingAddress };
    function intent(lines: readonly RequestIntentLine[], attempt: string): CreateIntent {
      const requestId = randomUUID();
      return {
        ownerHash: sha256AssistedOrderHasher.hash("synthetic-owner"),
        attemptHash: sha256AssistedOrderHasher.hash(attempt),
        fingerprint: sha256AssistedOrderHasher.hash("synthetic-facts-" + attempt),
        detail: {
          kind: "unapproved_selection_request", requestId,
          publicReference: "XRI-" + requestId.replace(/-/g, "").toUpperCase(),
          status: "pending_review", createdAt: new Date().toISOString(),
          contact, agreements: input.agreements, lines,
        },
      };
    }
    try {
      await fixture.start();
      const repository = requestIntentRepository(fixture.adapter().client);
      const mixed = [line("ordinary"), held, comingSoon, supply];

      // Before: the first version of the check.
      expect(await valid([held])).toBe(true);
      expect(await valid([comingSoon])).toBe(false);
      expect(await valid([supply])).toBe(false);
      expect(await valid(mixed)).toBe(false);
      // So the whole mixed request is refused at the store, and nothing is saved.
      await expect(repository.createOrReplay(intent(mixed, "before"))).rejects.toMatchObject({
        code: "request_intent_persistence_uncertain",
      });
      expect(await counts()).toEqual({ requests: 0, submitted: 0, events: 0 });

      // Apply the candidate exactly as it is in the repository.
      await sql(readFileSync(resolve(process.cwd(), "supabase/candidates/request_intent_all_listed_lines.sql"), "utf8"));

      // After: the three kinds are accepted, alone and together.
      expect(await valid([held])).toBe(true);
      expect(await valid([comingSoon])).toBe(true);
      expect(await valid([supply])).toBe(true);
      expect(await valid(mixed)).toBe(true);
      // The other rules still refuse. Each case changes one thing from a valid line.
      expect(await valid([])).toBe(false);
      expect(await valid([{ ...held, unitPriceCents: 100 }])).toBe(false);
      expect(await valid([{ ...held, quantity: 101 }])).toBe(false);
      expect(await valid([{ ...held, quantity: 0 }])).toBe(false);
      expect(await valid([{ ...held, reviewState: "approved" }])).toBe(false);
      expect(await valid([{ ...held, workflowMode: "direct_purchase" }])).toBe(false);
      expect(await valid([{ ...held, workflowMode: "provider_request", clinicalReviewRequired: false }])).toBe(false);
      expect(await valid([held, held])).toBe(false);
      expect(await valid(Array.from({ length: 201 }, (_, index) => line("many-" + index)))).toBe(false);
      // The value must be a list.
      expect(await valid({ lines: [held] })).toBe(false);
      expect(await valid("not a list")).toBe(false);
      // A whole-number quantity.
      expect(await valid([{ ...held, quantity: 1.5 }])).toBe(false);
      expect(await valid([{ ...held, quantity: "1" }])).toBe(false);
      // Boolean flags.
      expect(await valid([{ ...held, researchUseOnly: "true" }])).toBe(false);
      expect(await valid([{ ...held, clinicalReviewRequired: null }])).toBe(false);
      // Required text fields: present, non-empty, at most 300 characters.
      expect(await valid([{ ...held, productName: undefined }])).toBe(false);
      expect(await valid([{ ...held, catalogVersion: "" }])).toBe(false);
      expect(await valid([{ ...held, productName: "x".repeat(301) }])).toBe(false);
      expect(await valid([{ ...held, productName: "x".repeat(300) }])).toBe(true);
      // A specification and a refusal that are text or null.
      expect(await valid([{ ...held, specification: 5 }])).toBe(false);
      expect(await valid([{ ...held, sourceRefusal: true }])).toBe(false);
      expect(await valid([{ ...held, specification: null, sourceRefusal: null }])).toBe(true);

      // The same mixed request is now stored once, and a repeat returns the same receipt.
      const stored = await repository.createOrReplay(intent(mixed, "after"));
      expect(stored.receipt).toMatchObject({ kind: "unapproved_selection_request", status: "pending_review" });
      // A second create for the same owner, attempt and facts replays it; nothing new is stored.
      expect(await repository.createOrReplay(intent(mixed, "after"))).toEqual(stored);
      expect(await counts()).toEqual({ requests: 1, submitted: 1, events: 1 });
      const saved = (await sql("select lines from request_intent_private.requests")).rows[0].lines as RequestIntentLine[];
      expect(saved.map((entry) => entry.sourceVariantId)).toEqual(mixed.map((entry) => entry.sourceVariantId));
      expect(saved.every((entry) => entry.reviewState === "pending")).toBe(true);
      // The function is still private: no customer role can call it.
      for (const role of ["anon", "authenticated"] as const) {
        await expect(fixture.asRole(role, "select request_intent_private.valid_lines('[]'::jsonb)")).rejects.toThrow();
      }
    } finally {
      await fixture.close();
    }
  }, 240_000);
});
