/**
 * KAN31 disposable qualification; source base eb0fb59f4afc5e3d4b9ff016b4d3e3f811453e31.
 * No host/database URL or credentials are accepted. Only the owned postgres:16
 * container is used. CI must execute; Docker/SQL/assertion failures fail the test.
 * Identity, catalog facts and Care access-audit delivery are synthetic inputs.
 * The production registration, service, repository and candidate SQL are real.
 */
import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect } from "vitest";
import { sha256AssistedOrderHasher } from "../defaults";
import {
  REQUEST_INTENT_RECOVERY_NOTICE, type RequestIntentReceipt,
} from "../../../../shared/research/assisted-order/request-intent";
import { requestIntentRepository } from "./rpc-repository";
import type { CreateIntent } from "./service";
import {
  ATTEMPT, OPERATOR, OTHER_ACTOR, ROUTE, guest, pg16It, submission,
  createDurableJourneyFixture,
} from "./durable-journey.pg.fixture";

describe("durable guest request and independently authorized operator readback", () => {
  pg16It("commits, loses the reply, recovers and replays one immutable request in PostgreSQL 16", async () => {
    const fixture = createDurableJourneyFixture();
    const { adapter, application, post, staff, snapshot, counts, sql, asRole } = fixture;
    try {
      await fixture.start();
      expect(await counts()).toEqual({ requests: 0, submitted: 0, events: 0 });

      const firstRpc = adapter({ loseCreateReply: true });
      const first = application(firstRpc.client);
      const input = submission();
      const config = await request(first.app).get(ROUTE + "/config");
      expect(config.status).toBe(200);
      expect(config.body.requiredAgreements).toEqual([{ kind: "fixture-terms", version: "fixture-v1" }]);
      const catalog = await request(first.app).get(ROUTE + "/catalog").set("x-fixture-guest", "a");
      expect(catalog.status).toBe(200);
      expect(catalog.body.items.map((item: Record<string, unknown>) => ({
        productId: item.productId, variantId: item.variantId,
        workflowMode: item.workflowMode, unitPriceCents: item.unitPriceCents,
        maximumQuantity: item.maximumQuantity,
      }))).toEqual([
        { productId: "product-var-1", variantId: "pc-var-1", workflowMode: "provider_request", unitPriceCents: null, maximumQuantity: 100 },
        { productId: "product-var-2", variantId: "pc-var-2", workflowMode: "request_pricing", unitPriceCents: null, maximumQuantity: 100 },
      ]);
      const tooMany = await post(first.app, "", {
        ...input, lines: [input.lines[0], { ...input.lines[1], quantity: 101 }],
      });
      expect(tooMany.status).toBe(400);
      expect(tooMany.body.error).toBe("selection_requires_refresh");
      const wrongLegal = await post(first.app, "", {
        ...input, agreements: input.agreements.map((entry, index) =>
          index === 0 ? { ...entry, version: "not-current" } : entry),
      });
      expect(wrongLegal.status).toBe(400);
      expect(wrongLegal.body.error).toBe("current_acknowledgments_required");
      expect(await counts()).toEqual({ requests: 0, submitted: 0, events: 0 });

      const lost = await post(first.app, "", input);
      expect(lost.status).toBe(503);
      expect(lost.body).toEqual({
        error: "request_outcome_unconfirmed", message: REQUEST_INTENT_RECOVERY_NOTICE,
      });
      expect(lost.headers["cache-control"]).toContain("no-store");
      expect(firstRpc.calls.filter((name) => name === "request_intent_create_or_replay")).toHaveLength(1);
      expect(firstRpc.errors).toEqual([]);
      const savedRows = await snapshot(); // Independent connection after actual COMMIT.
      expect(savedRows).toHaveLength(1);
      const saved = savedRows[0];
      expect(saved.owner_hash).toBe(sha256AssistedOrderHasher.stableHash([
        "request-intent-owner", "session", guest.earlyAccessCustomerRef, guest.earlyAccessSessionHash,
      ]));
      expect(saved.attempt_hash).toBe(sha256AssistedOrderHasher.hash(ATTEMPT));
      expect(saved.public_reference).toBe("XRI-" + saved.id.replace(/-/g, "").toUpperCase());
      expect(saved.contact).toEqual({ ...input.contact, billingAddress: input.contact.shippingAddress });
      expect(saved.agreements).toEqual(input.agreements);
      expect(saved.lines).toEqual([
        {
          productId: "product-var-1", variantId: "pc-var-1", sourceVariantId: "var-1",
          productName: "Synthetic 1", specification: "Synthetic exact variant 1",
          family: "clinical_formulations_503a", workflowMode: "provider_request",
          quantity: 2, researchUseOnly: false, clinicalReviewRequired: true,
          sourceDisplayState: "care_pathway", sourceVariantDisplayState: "care_pathway",
          sourceRefusal: "provider_pathway_family", catalogVersion: "synthetic-durable-v1", reviewState: "pending",
        },
        {
          productId: "product-var-2", variantId: "pc-var-2", sourceVariantId: "var-2",
          productName: "Synthetic 2", specification: "Synthetic exact variant 2",
          family: "research_peptides_materials", workflowMode: "request_pricing",
          quantity: 100, researchUseOnly: true, clinicalReviewRequired: false,
          sourceDisplayState: "request_access", sourceVariantDisplayState: "request_access",
          sourceRefusal: null, catalogVersion: "synthetic-durable-v1", reviewState: "pending",
        },
      ]);
      expect(await counts()).toEqual({ requests: 1, submitted: 1, events: 1 });

      // A new adapter and registration recreate the repository and service.
      // Catalog/standing are now closed and the legal version has changed.
      const resumedRpc = adapter();
      const resumed = application(resumedRpc.client, true);
      const foreign = await post(resumed.app, "/recover", { idempotencyKey: ATTEMPT }, "b");
      expect(foreign.status).toBe(200);
      expect(foreign.body).toEqual({ receipt: null });
      const recovered = await post(resumed.app, "/recover", { idempotencyKey: ATTEMPT });
      expect(recovered.status).toBe(200);
      const receipt = recovered.body.receipt as RequestIntentReceipt;
      expect(receipt).toEqual({
        kind: "unapproved_selection_request", requestId: saved.id,
        publicReference: saved.public_reference, status: "pending_review",
        createdAt: expect.any(String),
      });
      expect(Date.parse(receipt.createdAt)).toBe(saved.created_at.getTime());
      const replay = await post(resumed.app, "", input); // Exact original key AND facts.
      expect(replay.status).toBe(200);
      expect(replay.body).toEqual(receipt);
      const changed = await post(resumed.app, "", {
        ...input, lines: [{ ...input.lines[0], quantity: 3 }, input.lines[1]],
      });
      expect(changed.status).toBe(409);
      expect(changed.body.error).toBe("attempt_conflict");
      expect(resumed.select).not.toHaveBeenCalled();
      expect(resumed.accepted).not.toHaveBeenCalled();
      expect(resumedRpc.calls.filter((name) => name === "request_intent_create_or_replay")).toEqual([]);
      expect(await counts()).toEqual({ requests: 1, submitted: 1, events: 1 });

      // Exercise SQL's own unique-attempt replay/conflict branch too; the HTTP
      // service's earlier findAttempt must not be the only duplicate control.
      const contenderId = randomUUID();
      const contender: CreateIntent = {
        ownerHash: saved.owner_hash, attemptHash: saved.attempt_hash, fingerprint: saved.fingerprint,
        detail: {
          ...receipt, requestId: contenderId,
          publicReference: "XRI-" + contenderId.replace(/-/g, "").toUpperCase(),
          contact: saved.contact, agreements: saved.agreements, lines: saved.lines,
        },
      };
      const repository = requestIntentRepository(resumedRpc.client);
      expect(await repository.createOrReplay(contender)).toEqual({ receipt, fingerprint: saved.fingerprint });
      await expect(repository.createOrReplay({
        ...contender, fingerprint: sha256AssistedOrderHasher.hash("synthetic-changed-facts"),
        detail: { ...contender.detail, lines: [{ ...saved.lines[0], quantity: 3 }, saved.lines[1]] },
      })).rejects.toMatchObject({ code: "attempt_conflict", status: 409 });
      expect(resumedRpc.errors).toContainEqual({ name: "request_intent_create_or_replay", code: "23505" });
      expect(await snapshot()).toEqual(savedRows);
      expect(await counts()).toEqual({ requests: 1, submitted: 1, events: 1 });

      const detail = { ...receipt, contact: saved.contact, agreements: saved.agreements, lines: saved.lines };
      const goodRead = await staff(resumed.app, "/" + saved.id);
      expect(goodRead.status).toBe(200);
      expect(goodRead.body).toEqual(detail);
      const goodQueue = await staff(resumed.app, "?page=1");
      expect(goodQueue.status).toBe(200);
      expect(goodQueue.body).toEqual({
        items: [{ ...receipt, lineCount: 2 }], total: 1, page: 1, pageSize: 25,
      });
      expect(await counts()).toEqual({ requests: 1, submitted: 1, events: 3 });

      for (const suffix of ["", "/" + saved.id]) {
        expect((await staff(resumed.app, suffix, "none")).status).toBe(401);
        expect((await staff(resumed.app, suffix, "research")).status).toBe(403);
      }
      resumed.env.RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED = "false";
      expect((await staff(resumed.app, "")).status).toBe(503);
      expect((await staff(resumed.app, "/" + saved.id)).status).toBe(503);
      resumed.env.RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED = "true";

      async function expectSqlReadDenied() {
        for (const suffix of ["", "/" + saved.id]) {
          const denied = await staff(resumed.app, suffix);
          // Current adapter intentionally maps private DB refusal to generic 503.
          expect(denied.status).toBe(503);
          expect(denied.body).toEqual({
            error: "request_outcome_unconfirmed", message: REQUEST_INTENT_RECOVERY_NOTICE,
          });
        }
        expect(resumedRpc.errors.slice(-2)).toEqual([
          { name: "request_intent_staff_list", code: "42501" },
          { name: "request_intent_staff_get", code: "42501" },
        ]);
        expect(await counts()).toEqual({ requests: 1, submitted: 1, events: 3 });
      }
      await sql("update public.care_role_assignments set revoked_at=now() where user_id=$1::uuid", [OPERATOR]);
      await expectSqlReadDenied(); // Runtime principal still says clinical_admin.
      await sql("update public.care_role_assignments set revoked_at=null,role='research_admin' where user_id=$1::uuid", [OPERATOR]);
      await expectSqlReadDenied(); // A different active DB role is insufficient.
      await sql("update public.care_role_assignments set role='clinical_admin' where user_id=$1::uuid", [OPERATOR]);
      await sql("delete from public.care_capabilities where capability_key='request_intent_pending_read'");
      await expectSqlReadDenied(); // Missing purpose-specific scope.
      await sql("insert into public.care_capabilities values ('request_intent_pending_read','enabled',null,null)");
      await expectSqlReadDenied(); // Enabled without approval is insufficient.
      await sql("update public.care_capabilities set approved_by=$1::uuid,approved_at=now() where capability_key='request_intent_pending_read'", [OPERATOR]);

      // Browser roles cannot call the backend RPC, and even service_role cannot
      // read the private table directly. The saved owner hash is not authority.
      for (const role of ["anon", "authenticated"] as const) {
        await expect(asRole(role,
          "select public.request_intent_find_attempt($1::text,$2::text)",
          [saved.owner_hash, saved.attempt_hash],
        )).rejects.toMatchObject({ code: "42501" });
      }
      await expect(asRole("service_role", "select * from request_intent_private.requests"))
        .rejects.toMatchObject({ code: "42501" });
      const mismatchedRpc = adapter({ subject: OTHER_ACTOR });
      const mismatched = application(mismatchedRpc.client, true);
      expect((await staff(mismatched.app, "/" + saved.id)).status).toBe(503);
      expect(mismatchedRpc.errors).toEqual([{ name: "request_intent_staff_get", code: "42501" }]);
      expect(await counts()).toEqual({ requests: 1, submitted: 1, events: 3 });

      // Reestablish a positive control after the DB denial probes. Intake may close;
      // the separately authorized pending-read path must still find the record.
      resumed.env.RESEARCH_REQUEST_INTENT_ENABLED = "false";
      expect((await post(resumed.app, "", input)).status).toBe(503);
      const finalRead = await staff(resumed.app, "/" + saved.id);
      expect(finalRead.status).toBe(200);
      expect(finalRead.body).toEqual(detail);
      const finalQueue = await staff(resumed.app, "");
      expect(finalQueue.status).toBe(200);
      expect(finalQueue.body).toEqual({
        items: [{ ...receipt, lineCount: 2 }], total: 1, page: 1, pageSize: 25,
      });
      expect(resumed.care.loadCapabilityStatus).not.toHaveBeenCalled();
      expect((await sql("select state from public.care_capabilities where capability_key='care'")).rows)
        .toEqual([{ state: "disabled" }]);
      expect(await snapshot()).toEqual(savedRows);
      expect(await counts()).toEqual({ requests: 1, submitted: 1, events: 5 });
      expect((await sql(
        "select distinct actor_user_id from request_intent_private.access_events where event_type in ('staff_read','queue_list')",
      )).rows).toEqual([{ actor_user_id: OPERATOR }]);
    } finally {
      await fixture.close();
    }
  }, 240_000);
});
