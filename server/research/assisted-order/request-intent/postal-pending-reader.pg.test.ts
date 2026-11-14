import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import request from "supertest";
import { expect } from "vitest";
import { ATTEMPT, OPERATOR, OTHER_ACTOR, ROUTE, createDurableJourneyFixture, pg16It, submission } from "./durable-journey.pg.fixture";

const migration = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

pg16It("admits a postal intake, recovers one committed request, and lets its designated queue reader retrieve it", async () => {
  const fixture = createDurableJourneyFixture();
  const { sql, asRole, adapter, application, counts, post } = fixture;
  try {
    await fixture.start({ managedCareSchema: true });
    await sql(migration("server/research/assisted-order/request-intent/private-contact.candidate.sql"));
    await sql(migration("supabase/migrations/20261114133643_early_access_postal_admission.sql"));
    const queueMigration = migration("supabase/migrations/20261114133500_early_access_pending_request_reader.sql");
    await sql(queueMigration);
    await sql(queueMigration);
    await sql(migration("supabase/tests/early-access-pending-reader.sql"));
    await sql("insert into public.care_role_assignments(user_id,role,granted_by) values ($1,'request_intent_reader',$1)", [OPERATOR]);

    const { app, care } = application(adapter({ loseCreateReply: true }).client, false, undefined, {
      resolvePrincipal: async req => {
        const actor = req.get("x-fixture-staff");
        if (actor === "operator") return { subjectId: OPERATOR, roles: ["request_intent_reader"] };
        if (actor === "ordinary") return { subjectId: OTHER_ACTOR, roles: [] };
        return null;
      },
      env: { RESEARCH_REQUEST_CATALOG_CONTACT_REQUIRED: "true", RESEARCH_REQUEST_CATALOG_CONTACT_RETENTION_SECONDS: "7200" },
    });
    const get = (path: string) => request(app).get(ROUTE + path).set("x-fixture-guest", "a");
    expect((await get("/catalog")).status).toBe(403);
    const initial = await get("/admission");
    expect(initial.status).toBe(200);
    expect(initial.body).toEqual({ admitted: false, policyRevision: expect.any(String), retentionSeconds: 7200 });
    const input = submission();
    const facts = { fullLegalName: input.contact.fullLegalName, email: input.contact.email, policyRevision: initial.body.policyRevision };
    expect((await post(app, "/admission", facts)).status).toBe(400);
    expect((await post(app, "/admission", { ...facts, postalAddress: input.contact.shippingAddress })).status).toBe(200);
    expect((await get("/admission")).body).toEqual({ ...initial.body, admitted: true });
    const catalog = await get("/catalog");
    expect(catalog.status).toBe(200);
    expect(catalog.body.items).toHaveLength(2);
    const lost = await post(app, "", input);
    expect(lost.status).toBe(503);
    expect((await counts()).requests).toBe(1);
    const rescued = await post(app, "/recover", { idempotencyKey: ATTEMPT });
    expect(rescued.status).toBe(200);
    const receipt = rescued.body.receipt;
    expect(receipt).toMatchObject({ status: "pending_review", publicReference: expect.stringMatching(/^XRI-/) });
    expect((await post(app, "", input)).body).toEqual(receipt);
    expect((await counts()).submitted).toBe(1);
    const list = "select public.request_intent_operator_list($1::uuid,1) as page";
    const getById = "select public.request_intent_operator_get($1::uuid,$2::uuid,false) as detail";
    const detailArgs = [receipt.requestId, OPERATOR];
    for (const role of ["anon", "authenticated"] as const) {
      await expect(asRole(role, list, [OPERATOR], OPERATOR)).rejects.toMatchObject({ code: "42501" });
    }
    await expect(asRole("service_role", list, [OTHER_ACTOR], OTHER_ACTOR)).rejects.toMatchObject({ code: "42501" });
    await expect(asRole("service_role", getById, detailArgs, OTHER_ACTOR)).rejects.toMatchObject({ code: "42501" });
    const staff = (path: string, role?: string) => {
      const http = request(app).get(ROUTE + "/staff" + path);
      return role ? http.set("x-fixture-staff", role) : http;
    };
    expect((await staff("")).status).toBe(401);
    expect((await staff("", "ordinary")).status).toBe(403);
    expect((await staff("/" + receipt.requestId, "ordinary")).status).toBe(403);
    const reply = await staff("", "operator");
    expect(reply.status).toBe(200);
    expect(reply.headers["cache-control"]).toContain("no-store");
    const queue = reply.body;
    expect(queue).toMatchObject({ total: 1, items: [{ ...receipt, lineCount: input.lines.length }] });
    expect(queue.items[0]).not.toHaveProperty("contact");
    const detailReply = await staff("/" + receipt.requestId, "operator");
    expect(detailReply.status).toBe(200);
    const detail = detailReply.body;
    expect(care.recordAccessDecision).toHaveBeenCalledWith(expect.objectContaining({
      actorSubjectId: OPERATOR, permission: "request_intent:read_pending", outcome: "allowed",
    }));
    expect(detail).toMatchObject({ ...receipt, contact: { fullLegalName: input.contact.fullLegalName, shippingAddress: input.contact.shippingAddress } });
    expect(detail.lines).toHaveLength(input.lines.length);
    await expect(asRole("service_role", "select public.request_intent_staff_get($1,$2)", detailArgs, OPERATOR))
      .rejects.toMatchObject({ code: "42501" });
    await sql("update public.care_role_assignments set revoked_at=now() where user_id=$1", [OPERATOR]);
    await expect(asRole("service_role", list, [OPERATOR], OPERATOR)).rejects.toMatchObject({ code: "42501" });
    expect((await sql("select event_type, actor_user_id from request_intent_private.access_events where event_type in ('queue_list','staff_read') order by event_type")).rows)
      .toEqual([{ event_type: "queue_list", actor_user_id: OPERATOR }, { event_type: "staff_read", actor_user_id: OPERATOR }]);
  } finally {
    await fixture.close();
  }
}, 120_000);
