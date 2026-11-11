/**
 * Disposable rehearsal of supabase/candidates/request_intent_optional_context.sql.
 * Only the owned postgres:16 container is used; no host database or credential.
 * It runs where the other database-backed request tests run, and nowhere else.
 *
 * What it shows, in one database:
 *  - before the candidate, a request that carries an optional goal or referral
 *    code cannot be stored at all, and nothing is saved; a request without them
 *    is stored as before;
 *  - after it, the optional answers are stored once, apart from the request's
 *    contact and receipt, and a repeat of the same attempt returns the same
 *    receipt and stores nothing more;
 *  - a repeat never puts optional answers back after they were removed;
 *  - an answer outside the listed goals, a malformed code, an extra key or an
 *    empty object refuses the whole request, and no request row is left behind;
 *  - staff read the answers only through the readback that asks for them, and
 *    a request without answers reads exactly as it did;
 *  - no customer role can read the table or call its functions, and the
 *    backend role cannot read the table directly.
 * It is a rehearsal of the SQL, not evidence that anything was applied anywhere.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect } from "vitest";
import { sha256AssistedOrderHasher } from "../defaults";
import type { OptionalRequestIntake } from "../../../../shared/research/assisted-order/optional-intake";
import type { RequestIntentLine } from "../../../../shared/research/assisted-order/request-intent";
import { requestIntentRepository, requestIntentStaffReader } from "./rpc-repository";
import type { CreateIntent } from "./service";
import { createDurableJourneyFixture, OPERATOR, pg16It, submission } from "./durable-journey.pg.fixture";

const ordinary: RequestIntentLine = {
  productId: "product-ordinary", variantId: "pc-ordinary", sourceVariantId: "var-ordinary",
  productName: "Synthetic ordinary", specification: "Synthetic exact variant",
  family: "research_peptides_materials", workflowMode: "request_pricing", quantity: 1,
  researchUseOnly: true, clinicalReviewRequired: false,
  sourceDisplayState: "request_access", sourceVariantDisplayState: "request_access",
  sourceRefusal: null, catalogVersion: "synthetic-v1", reviewState: "pending",
};

describe("optional goal and referral code, before and after the optional-context candidate", () => {
  pg16It("stores optional answers once, apart from the request, only after the candidate", async () => {
    const fixture = createDurableJourneyFixture();
    const { sql, counts } = fixture;
    const input = submission();
    const contact = { ...input.contact, billingAddress: input.contact.shippingAddress };
    function intent(attempt: string, optionalIntake?: unknown): CreateIntent {
      const requestId = randomUUID();
      return {
        ownerHash: sha256AssistedOrderHasher.hash("synthetic-owner"),
        attemptHash: sha256AssistedOrderHasher.hash(attempt),
        fingerprint: sha256AssistedOrderHasher.hash("synthetic-facts-" + attempt),
        detail: {
          kind: "unapproved_selection_request", requestId,
          publicReference: "XRI-" + requestId.replace(/-/g, "").toUpperCase(),
          status: "pending_review", createdAt: new Date().toISOString(),
          contact, agreements: input.agreements, lines: [ordinary],
          ...(optionalIntake === undefined ? {} : { optionalIntake: optionalIntake as OptionalRequestIntake }),
        },
      };
    }
    const contextRows = async () =>
      (await sql("select request_id, goal, referral_code from request_intent_private.optional_context order by captured_at")).rows;
    const answers = { goal: "check_availability", referralCode: "SYNTH-2026" } as const;
    try {
      await fixture.start();
      const client = fixture.adapter().client;
      const repository = requestIntentRepository(client);

      // Before: a request with optional answers has nowhere to go, and nothing is saved.
      await expect(repository.createOrReplay(intent("before-with", answers))).rejects.toBeDefined();
      expect(await counts()).toEqual({ requests: 0, submitted: 0, events: 0 });
      // A request without them is stored exactly as before.
      const plain = await repository.createOrReplay(intent("plain"));
      expect(plain.receipt).toMatchObject({ kind: "unapproved_selection_request", status: "pending_review" });
      expect(await counts()).toEqual({ requests: 1, submitted: 1, events: 1 });

      // Apply the candidate exactly as it is in the repository.
      await sql(readFileSync(resolve(process.cwd(), "supabase/candidates/request_intent_optional_context.sql"), "utf8"));
      expect(await contextRows()).toEqual([]);

      // After: the answers are stored once, in their own table, keyed by the request.
      const first = intent("with-answers", answers);
      const stored = await repository.createOrReplay(first);
      expect(stored.receipt.requestId).toBe(first.detail.requestId);
      expect(await counts()).toEqual({ requests: 2, submitted: 2, events: 2 });
      expect(await contextRows()).toEqual([
        { request_id: first.detail.requestId, goal: "check_availability", referral_code: "SYNTH-2026" },
      ]);
      // The request row itself carries no optional answer: they are not part of the receipt or the contact.
      const requestRow = (await sql("select to_jsonb(r) as row from request_intent_private.requests r where r.id = $1::uuid",
        [first.detail.requestId])).rows[0].row;
      expect(JSON.stringify(requestRow)).not.toContain("SYNTH-2026");
      expect(JSON.stringify(requestRow)).not.toContain("check_availability");

      // A repeat of the same attempt returns the same receipt and stores nothing more.
      expect(await repository.createOrReplay(intent("with-answers", answers))).toEqual(stored);
      expect(await counts()).toEqual({ requests: 2, submitted: 2, events: 2 });
      expect(await contextRows()).toHaveLength(1);

      // One answer alone is enough.
      const goalOnly = intent("goal-only", { goal: "compare_options" });
      await repository.createOrReplay(goalOnly);
      const codeOnly = intent("code-only", { referralCode: "AB" });
      await repository.createOrReplay(codeOnly);
      expect(await contextRows()).toHaveLength(3);
      expect(await counts()).toEqual({ requests: 4, submitted: 4, events: 4 });

      // Refused whole, with no request row left behind. Each case changes one thing.
      for (const [name, bad] of [
        ["a goal outside the list", { goal: "weight_loss" }],
        ["a code with a space", { referralCode: "NOT VALID" }],
        ["a one-character code", { referralCode: "A" }],
        ["a code of 25 characters", { referralCode: "A".repeat(25) }],
        ["an extra key", { goal: "compare_options", note: "free text" }],
        ["an empty object", {}],
        ["a goal that is not text", { goal: 5 }],
      ] as const) {
        await expect(repository.createOrReplay(intent("bad-" + name, bad)), name).rejects.toBeDefined();
      }
      expect(await counts()).toEqual({ requests: 4, submitted: 4, events: 4 });
      expect(await contextRows()).toHaveLength(3);

      // Staff read the answers only through the readback that asks for them.
      const withContext = requestIntentStaffReader(client, true);
      const withoutContext = requestIntentStaffReader(client);
      expect((await withContext.get(first.detail.requestId, OPERATOR))?.optionalIntake).toEqual(answers);
      expect((await withContext.get(goalOnly.detail.requestId, OPERATOR))?.optionalIntake).toEqual({ goal: "compare_options" });
      expect((await withContext.get(codeOnly.detail.requestId, OPERATOR))?.optionalIntake).toEqual({ referralCode: "AB" });
      expect((await withoutContext.get(first.detail.requestId, OPERATOR))?.optionalIntake).toBeUndefined();
      // A request without answers reads the same through both, and carries no such field.
      const plainRead = await withContext.get(plain.receipt.requestId, OPERATOR);
      expect(plainRead).toEqual(await withoutContext.get(plain.receipt.requestId, OPERATOR));
      expect(plainRead && "optionalIntake" in plainRead).toBe(false);

      // Once removed, a repeat of the attempt never puts the answers back.
      await sql("delete from request_intent_private.optional_context where request_id = $1::uuid", [first.detail.requestId]);
      expect(await repository.createOrReplay(intent("with-answers", answers))).toEqual(stored);
      expect((await contextRows()).map((row) => row.request_id)).not.toContain(first.detail.requestId);
      expect((await withContext.get(first.detail.requestId, OPERATOR))?.optionalIntake).toBeUndefined();

      // Private: no customer role reads the table or calls either function, and the backend role cannot read the table directly.
      for (const role of ["anon", "authenticated"] as const) {
        await expect(fixture.asRole(role, "select count(*) from request_intent_private.optional_context")).rejects.toThrow();
        await expect(fixture.asRole(role,
          "select public.request_intent_staff_get_with_context($1::uuid,$2::uuid)", [first.detail.requestId, OPERATOR])).rejects.toThrow();
        await expect(fixture.asRole(role,
          "select public.request_intent_create_with_context('a','b','c','{}'::jsonb,'{}'::jsonb)")).rejects.toThrow();
      }
      await expect(fixture.asRole("service_role", "select count(*) from request_intent_private.optional_context")).rejects.toThrow();
    } finally {
      await fixture.close();
    }
  }, 240_000);
});
