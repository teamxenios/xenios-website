/**
 * Disposable rehearsal of server/research/assisted-order/request-intent/private-contact.candidate.sql
 * (name and email before the catalog). Only the owned postgres:16 container is used; no host
 * database or credential. It runs where the other database-backed request tests run, and nowhere else.
 *
 * What it shows, in one database, through the real server adapter (privateContactAdmissionRpc):
 *  - before the candidate, the catalog cannot be admitted: both calls fail in the database and
 *    nothing is stored;
 *  - after it, a name and email are stored once per viewer and policy revision, with an expiry
 *    set from the configured retention; repeating the same facts stores nothing more and does
 *    not extend the expiry; a different contact for the same live key is refused;
 *  - two simultaneous first saves for one key store exactly one contact;
 *  - an expired record no longer admits, but stays in the table until the owner's purge runs.
 *    No purge is scheduled by this file;
 *  - malformed input is refused by the function itself, and nothing is stored;
 *  - no customer role can read the table or call any function, the backend role cannot read
 *    the table directly or run the purge, and nothing in the candidate looks a contact up by email.
 * It is a rehearsal of the SQL, not evidence that anything was applied anywhere.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect } from "vitest";
import { privateContactAdmissionRpc } from "./contact-admission-rpc";
import { createDurableJourneyFixture, pg16It } from "./durable-journey.pg.fixture";

const CANDIDATE = "server/research/assisted-order/request-intent/private-contact.candidate.sql";
const CANDIDATE_SHA256 = "1cb77c07dc5126b6b5bccc210994a3094877b9c6e4d75db9387f1fb5a7246103";
const RETENTION_SECONDS = 600;
const hex = (text: string) => createHash("sha256").update(text).digest("hex");
const key = (owner: string, policy = "policy-1") => ({ ownerBinding: hex("owner:" + owner), policyRevision: hex(policy) });
const contact = { fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid" } as const;

describe("name and email before the catalog, before and after the private contact candidate", () => {
  pg16It("stores one contact per viewer and policy, expires it, and keeps it private", async () => {
    const fixture = createDurableJourneyFixture();
    const { sql, asRole } = fixture;
    const rows = async () => (await sql(
      "select owner_binding, policy_revision, full_legal_name, email from request_intent_private.catalog_contact_admission order by email",
    )).rows;
    const secondsLeft = async (k: ReturnType<typeof key>) => (await sql(
      "select extract(epoch from expires_at - clock_timestamp())::float8 as s from request_intent_private.catalog_contact_admission"
      + " where owner_binding = $1 and policy_revision = $2", [k.ownerBinding, k.policyRevision])).rows[0]?.s as number | undefined;
    try {
      await fixture.start();
      const database = fixture.adapter();
      const custody = privateContactAdmissionRpc(database.client, RETENTION_SECONDS);
      const a = key("a");

      // Before: neither call has anywhere to go. The reason is pinned: the function does not exist.
      await expect(custody.present(a)).rejects.toThrow("private_contact_unavailable");
      await expect(custody.saveFirst(a, contact)).rejects.toThrow("private_contact_unavailable");
      expect(database.errors).toEqual([
        { name: "request_intent_catalog_contact_has", code: "42883" },
        { name: "request_intent_catalog_contact_put", code: "42883" },
      ]);
      expect((await sql("select to_regclass('request_intent_private.catalog_contact_admission') as t")).rows[0].t).toBeNull();

      // Apply the candidate exactly as it is in the repository.
      const candidate = readFileSync(resolve(process.cwd(), CANDIDATE));
      expect(createHash("sha256").update(candidate).digest("hex")).toBe(CANDIDATE_SHA256);
      await sql(candidate.toString("utf8"));
      expect(await rows()).toEqual([]);
      expect(await custody.present(a)).toBe(false);

      // First save: stored once, with the configured retention.
      expect(await custody.saveFirst(a, contact)).toBe("committed");
      expect(await rows()).toEqual([{
        owner_binding: a.ownerBinding, policy_revision: a.policyRevision,
        full_legal_name: contact.fullLegalName, email: contact.email,
      }]);
      const left = await secondsLeft(a);
      expect(left).toBeGreaterThan(RETENTION_SECONDS - 30);
      expect(left).toBeLessThanOrEqual(RETENTION_SECONDS);
      expect(await custody.present(a)).toBe(true);
      // Keyed by both parts: another viewer, or a changed policy, is not admitted.
      expect(await custody.present(key("b"))).toBe(false);
      expect(await custody.present(key("a", "policy-2"))).toBe(false);

      // The same facts again store nothing more and do not extend the expiry.
      const before = (await sql("select expires_at from request_intent_private.catalog_contact_admission")).rows[0].expires_at as Date;
      expect(await custody.saveFirst(a, contact)).toBe("already_same");
      expect(await rows()).toHaveLength(1);
      expect(((await sql("select expires_at from request_intent_private.catalog_contact_admission")).rows[0].expires_at as Date)
        .getTime()).toBe(before.getTime());
      // A different contact for the same live key is refused, and the stored one is unchanged.
      expect(await custody.saveFirst(a, { ...contact, email: "other@example.invalid" })).toBe("different_contact");
      expect(await custody.saveFirst(a, { ...contact, fullLegalName: "Other Name" })).toBe("different_contact");
      expect((await rows()).map((row) => row.email)).toEqual([contact.email]);

      // Two simultaneous first saves for one key: exactly one contact is stored.
      const c = key("c");
      const raced = await Promise.all([
        custody.saveFirst(c, { fullLegalName: "Racer One", email: "one@example.invalid" }),
        custody.saveFirst(c, { fullLegalName: "Racer Two", email: "two@example.invalid" }),
      ]);
      expect([...raced].sort()).toEqual(["committed", "different_contact"]);
      expect((await sql("select count(*)::int as n from request_intent_private.catalog_contact_admission where owner_binding = $1",
        [c.ownerBinding])).rows[0].n).toBe(1);

      // Expiry: an expired record no longer admits, but it stays until the purge runs.
      await sql("update request_intent_private.catalog_contact_admission set expires_at = clock_timestamp() - interval '1 second'"
        + " where owner_binding = $1", [a.ownerBinding]);
      expect(await custody.present(a)).toBe(false);
      expect(await rows()).toHaveLength(2);
      // After expiry the same viewer may give a different contact; it replaces the expired one.
      expect(await custody.saveFirst(a, { ...contact, email: "renewed@example.invalid" })).toBe("committed");
      expect((await sql("select email from request_intent_private.catalog_contact_admission where owner_binding = $1",
        [a.ownerBinding])).rows).toEqual([{ email: "renewed@example.invalid" }]);
      expect(await custody.present(a)).toBe(true);

      // The purge removes only expired records, in bounded batches. It is run by the owner here;
      // the candidate installs no schedule for it.
      await sql("update request_intent_private.catalog_contact_admission set expires_at = clock_timestamp() - interval '1 second'"
        + " where owner_binding = $1", [c.ownerBinding]);
      expect((await sql("select request_intent_private.purge_expired_contact_admissions(1000) as n")).rows[0].n).toBe(1);
      expect((await rows()).map((row) => row.email)).toEqual(["renewed@example.invalid"]);
      expect((await sql("select request_intent_private.purge_expired_contact_admissions(1000) as n")).rows[0].n).toBe(0);
      for (const limit of [0, 1001]) {
        await expect(sql("select request_intent_private.purge_expired_contact_admissions($1::integer)", [limit]))
          .rejects.toMatchObject({ code: "22023" });
      }
      expect(candidate.toString("utf8")).not.toMatch(/cron\./i);

      // Malformed input is refused by the function itself; nothing is stored. Each case changes one thing.
      const d = key("d");
      for (const [name, k, facts] of [
        ["a leading space in the name", d, { ...contact, fullLegalName: " Synthetic" }],
        ["a control character in the name", d, { ...contact, fullLegalName: "Synthetic\u0007Customer" }],
        ["a name of 201 characters", d, { ...contact, fullLegalName: "N".repeat(201) }],
        ["an empty name", d, { ...contact, fullLegalName: "" }],
        ["an email in capitals", d, { ...contact, email: "Synthetic@example.invalid" }],
        ["an email without a domain dot", d, { ...contact, email: "synthetic@example" }],
        ["an email with a space", d, { ...contact, email: "synth etic@example.invalid" }],
        ["an email of 255 characters", d, { ...contact, email: "e".repeat(243) + "@example.com" }],
        ["an owner key that is not a digest", { ...d, ownerBinding: "not-a-digest" }, contact],
        ["a policy key in capitals", { ...d, policyRevision: d.policyRevision.toUpperCase() }, contact],
      ] as const) {
        const errorsBefore = database.errors.length;
        await expect(custody.saveFirst(k, facts), name).rejects.toThrow("private_contact_unavailable");
        expect(database.errors.slice(errorsBefore), name).toEqual([{ name: "request_intent_catalog_contact_put", code: "22023" }]);
      }
      // Retention outside 60 seconds to one day: the adapter will not start, and the function refuses it too.
      expect(() => privateContactAdmissionRpc(database.client, 59)).toThrow("private_contact_retention_required");
      expect(() => privateContactAdmissionRpc(database.client, 86_401)).toThrow("private_contact_retention_required");
      for (const ttl of [59, 86_401]) {
        await expect(asRole("service_role",
          "select public.request_intent_catalog_contact_put($1,$2,$3,$4,$5::integer)",
          [d.ownerBinding, d.policyRevision, contact.fullLegalName, contact.email, ttl])).rejects.toMatchObject({ code: "22023" });
      }
      expect(await rows()).toHaveLength(1);

      // Private. The functions refuse any caller that is not the backend role, even the owner.
      await expect(sql("select request_intent_private.contact_admission_has($1,$2)", [a.ownerBinding, a.policyRevision]))
        .rejects.toMatchObject({ code: "42501" });
      for (const role of ["anon", "authenticated"] as const) {
        await expect(asRole(role, "select count(*) from request_intent_private.catalog_contact_admission")).rejects.toThrow();
        await expect(asRole(role, "select public.request_intent_catalog_contact_has($1,$2)", [a.ownerBinding, a.policyRevision]))
          .rejects.toThrow();
      }
      await expect(asRole("service_role", "select count(*) from request_intent_private.catalog_contact_admission")).rejects.toThrow();
      // Those refusals could also come from the functions' own checks, so check the grants themselves.
      const may = async (role: string, signature: string) =>
        (await sql("select has_function_privilege($1::name, $2::text, 'execute') as ok", [role, signature])).rows[0].ok;
      for (const signature of [
        "request_intent_private.contact_admission_has(text,text)",
        "request_intent_private.contact_admission_put(text,text,text,text,integer)",
        "public.request_intent_catalog_contact_has(text,text)",
        "public.request_intent_catalog_contact_put(text,text,text,text,integer)",
      ]) {
        expect(await may("anon", signature), signature).toBe(false);
        expect(await may("authenticated", signature), signature).toBe(false);
        expect(await may("service_role", signature), signature).toBe(true);
      }
      for (const role of ["anon", "authenticated", "service_role"]) {
        expect(await may(role, "request_intent_private.purge_expired_contact_admissions(integer)"), role + " purge").toBe(false);
        for (const privilege of ["select", "insert", "update", "delete"]) {
          expect((await sql("select has_table_privilege($1::name, 'request_intent_private.catalog_contact_admission'::text, $2::text) as ok",
            [role, privilege])).rows[0].ok, role + " " + privilege).toBe(false);
        }
      }
      // The candidate adds exactly these functions; none takes an email alone or returns a contact.
      const added = (await sql([
        "select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' || ' -> ' || pg_get_function_result(p.oid) as f",
        "from pg_proc p join pg_namespace n on n.oid = p.pronamespace",
        "where (p.proname like '%contact_admission%' or p.proname like 'request_intent_catalog_contact%')",
        "and n.nspname in ('public','request_intent_private') order by 1",
      ].join(" "))).rows.map((row) => row.f);
      expect(added).toEqual([
        "public.request_intent_catalog_contact_has(p_owner_binding text, p_policy_revision text) -> boolean",
        "public.request_intent_catalog_contact_put(p_owner_binding text, p_policy_revision text, p_full_legal_name text, p_email text, p_ttl_seconds integer) -> text",
        "request_intent_private.contact_admission_has(p_owner_binding text, p_policy_revision text) -> boolean",
        "request_intent_private.contact_admission_put(p_owner_binding text, p_policy_revision text, p_full_legal_name text, p_email text, p_ttl_seconds integer) -> text",
        "request_intent_private.purge_expired_contact_admissions(p_limit integer) -> integer",
      ]);
    } finally {
      await fixture.close();
    }
  }, 240_000);
});
