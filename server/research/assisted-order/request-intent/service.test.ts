import { describe, expect, it, vi } from "vitest";
import { sha256AssistedOrderHasher } from "../defaults";
import type { AssistedOrderViewer } from "../ports";
import { assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments } from "../../../../shared/research/assisted-order/form";
import { validateRequestIntentInput, type RequestIntentCatalogItem, type RequestIntentInput } from "../../../../shared/research/assisted-order/request-intent";
import { RequestIntentService, REQUEST_INTENT_PREPARATION_PROTOCOL, type CreateIntent, type RequestIntentDependencies,
  type RequestIntentPreparationQuery, type RequestIntentPreparedFacts, type StoredIntent } from "./service";
import { requestIntentRepository } from "./rpc-repository";
import { makeCatalogAdmission } from "./catalog-admission";

const now = "2026-10-14T12:00:00.000Z";
const key = "10000000-0000-4000-8000-000000000001";
const viewer: AssistedOrderViewer = {
  actorType: "member", memberId: "member-a", authUserId: "20000000-0000-4000-8000-000000000001",
  earlyAccessSessionHash: null, normalizedEmail: "synthetic@example.invalid",
  capabilities: new Set(["assisted_orders:submit", "assisted_orders:read_own"]),
};
function item(id: string, clinical: boolean): RequestIntentCatalogItem {
  return {
    productId: id, variantId: id + "-variant", productName: "Synthetic " + id, family: clinical ? "clinical_formulations_503a" : "research_peptides_materials",
    channel: "synthetic", specification: "synthetic variant", format: null, packBasis: null,
    minimumQuantity: 1, maximumQuantity: 100, quantityIncrement: 1, unitPriceCents: null, currency: "USD",
    workflowMode: clinical ? "provider_request" : "direct_order_request", actionLabel: "Add to quote cart",
    accessNotice: null, researchUseOnly: !clinical, catalogVersion: "synthetic-catalog", priceVersion: null,
    sourceSelection: { family: clinical ? "clinical_formulations_503a" : "research_peptides_materials", slug: id, variantId: "source-" + id },
    selectableForReview: true, intentExclusion: null, clinicalReviewRequired: clinical,
    sourceDisplayState: clinical ? "care_pathway" : "request_access",
    sourceVariantDisplayState: clinical ? "care_pathway" : "request_access",
    sourceRefusal: clinical ? "provider_pathway" : null,
  };
}
function input(ruo = true): RequestIntentInput {
  return {
    idempotencyKey: key,
    contact: {
      fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid", mobilePhone: "+15555550123",
      ageConfirmed: true, shippingAddress: { line1: "1 Synthetic Street", city: "Test", region: "TX", postalCode: "00000", countryCode: "US" },
      billingSameAsShipping: true,
    },
    agreements: [
      // Test fixture only, never a proposed legal registry entry.
      { kind: "fixture-terms", version: "fixture-v1", accepted: true, acceptedAt: now },
      ...requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: ruo })
        .map((ack) => ({ ...assistedOrderFormPair(ack), accepted: true as const, acceptedAt: now })),
    ],
    lines: ruo
      ? [{ productId: "clinical", variantId: "clinical-variant", quantity: 2 }, { productId: "research", variantId: "research-variant", quantity: 3 }]
      : [{ productId: "clinical", variantId: "clinical-variant", quantity: 2 }],
  };
}
function setup() {
  const records = new Map<string, CreateIntent>();
  const sideEffect = vi.fn();
  let sequence = 0;
  const items = [item("clinical", true), item("research", false)];
  const saved = (record: CreateIntent): StoredIntent => ({
    fingerprint: record.fingerprint,
    receipt: {
      kind: record.detail.kind, requestId: record.detail.requestId, publicReference: record.detail.publicReference,
      status: record.detail.status, createdAt: record.detail.createdAt,
    },
  });
  const deps: RequestIntentDependencies = {
    catalog: {
      list: vi.fn(async () => ({ items, total: items.length, page: 1, pageSize: 24, families: [], channels: [], workflowModes: [] })),
      resolveMany: vi.fn(async (_v, identities) => identities.map((line) => items.find((row) => row.productId === line.productId && row.variantId === line.variantId) ?? null)),
    },
    repository: {
      findAttempt: vi.fn(async (owner, attempt) => {
        const record = records.get(owner + ":" + attempt);
        return record ? saved(record) : null;
      }),
      createOrReplay: vi.fn(async (record) => {
        const binding = record.ownerHash + ":" + record.attemptHash;
        const prior = records.get(binding);
        if (!prior) records.set(binding, record);
        return saved(prior ?? record);
      }),
    },
    standing: { accepted: vi.fn(async () => true) },
    legal: { requiredAgreements: vi.fn(async () => [{ kind: "fixture-terms", version: "fixture-v1" }]) },
    hasher: sha256AssistedOrderHasher,
    ids: { uuid: () => "30000000-0000-4000-8000-" + String(++sequence).padStart(12, "0"), publicReference: () => "unused", opaqueToken: () => "unused" },
    clock: { now: () => new Date(now) },
  };
  // Extra capabilities are intentionally unreachable by the service contract.
  const service = new RequestIntentService({ ...deps, outbox: sideEffect, payments: sideEffect,
    prescriptions: sideEffect, suppliers: sideEffect, analytics: sideEffect } as RequestIntentDependencies);
  return { service, deps, records, items, sideEffect };
}

function preparationSetup(referralEnabled=false) {
  const base=setup(),activeViewer={...viewer,earlyAccessSessionHash:"synthetic-preparation-session"};
  const present=vi.fn(async()=>true),referralStatus=vi.fn(async()=>({admitted:true,referralRevision:key}));
  const admission=makeCatalogAdmission(base.deps.legal,base.deps.hasher,{present,referralStatus,saveFirst:vi.fn()},7200,referralEnabled);
  const metadata=vi.fn(async(query:RequestIntentPreparationQuery):Promise<unknown>=>({
    protocol:REQUEST_INTENT_PREPARATION_PROTOCOL,snapshotSha256:"d".repeat(64),issuedAt:"2026-10-14T12:00:00.000001Z",
    expiresAt:"2026-10-14T12:05:00.123456Z",admissionExpiresAt:"2026-10-14T12:07:00.654321Z",
    admissionPolicyRevision:query.admissionKey.policyRevision,...(query.referralRevision?{referralRevision:query.referralRevision}:{})}));
  const issue=vi.fn(async(_facts:RequestIntentPreparedFacts):Promise<unknown>=>"synthetic.preparation-witness");
  const preparation={notAfter:"2026-10-14T12:10:00.000000Z",metadata,issue};
  const uuid=vi.fn(base.deps.ids.uuid);
  const service=new RequestIntentService({...base.deps,contactAdmission:admission,optionalIntakeEnabled:true,preparation,
    ids:{...base.deps.ids,uuid}});
  return {...base,service,activeViewer,admission,present,referralStatus,preparation,metadata,issue,uuid};
}

describe("optional read-only fixture preparation",()=>{
  it("is unavailable by default without changing ordinary repository consumers",async()=>{
    const f=setup();
    await expect(f.service.prepareFixture(viewer,input())).rejects.toMatchObject({code:"request_preparation_unavailable",status:503});
    expect(f.deps.repository.findAttempt).not.toHaveBeenCalled();
    expect(f.deps.repository.createOrReplay).not.toHaveBeenCalled();
    expect((await f.service.submit(viewer,input())).status).toBe("pending_review");
  });
  it("attests actual normalized input and DB metadata without minting an ID, assent or saved facts",async()=>{
    const f=preparationSetup(),original=input(),before=JSON.stringify(original);
    const reply=await f.service.prepareFixture(f.activeViewer,original);
    expect(f.records.size).toBe(0);expect(f.uuid).not.toHaveBeenCalled();
    expect(f.deps.repository.createOrReplay).not.toHaveBeenCalled();expect(f.sideEffect).not.toHaveBeenCalled();
    const query=f.metadata.mock.calls[0][0],facts=f.issue.mock.calls[0][0];
    expect(query.admissionKey).toEqual(await f.admission.key(query.ownerHash,f.activeViewer.earlyAccessSessionHash));
    expect(query.referralRevision).toBeNull();expect(query.attemptHash).toBe(f.deps.hasher.hash(original.idempotencyKey));
    expect(query.snapshot.agreements).toEqual(original.agreements);
    expect(Object.keys(query.snapshot).sort()).toEqual(["agreements","lines"]);
    expect(query.snapshot).not.toHaveProperty("contact");expect(query).not.toHaveProperty("requestId");
    expect(Object.isFrozen(query)&&Object.isFrozen(query.snapshot)&&Object.isFrozen(query.snapshot.lines[0])).toBe(true);
    expect(facts).toMatchObject({fingerprint:query.fingerprint,snapshotSha256:"d".repeat(64),issuedAt:"2026-10-14T12:00:00.000001Z",
      expiresAt:"2026-10-14T12:05:00.123456Z",admissionExpiresAt:"2026-10-14T12:07:00.654321Z"});
    expect(facts).not.toHaveProperty("contact");expect(facts).not.toHaveProperty("idempotencyKey");
    expect(reply).toEqual({kind:"request_intent_prepared_fixture",protocol:REQUEST_INTENT_PREPARATION_PROTOCOL,
      witness:"synthetic.preparation-witness",expiresAt:"2026-10-14T12:05:00.123456Z"});
    expect(JSON.stringify(reply)).not.toContain(query.ownerHash);expect(JSON.stringify(original)).toBe(before);
    await f.service.submit(f.activeViewer,original);
    const saved=[...f.records.values()][0];
    expect(saved.fingerprint).toBe(query.fingerprint);expect(saved.detail.lines).toEqual(query.snapshot.lines);
    expect(saved.detail.agreements).toEqual(query.snapshot.agreements);expect(f.uuid).toHaveBeenCalledTimes(1);
  });
  it("refuses preparation of a saved attempt while ordinary exact replay stays before every mutable gate",async()=>{
    const f=preparationSetup(),original=input(),saved=await f.service.submit(f.activeViewer,original);
    vi.mocked(f.deps.standing.accepted).mockRejectedValue(new Error("standing unavailable"));
    vi.mocked(f.deps.catalog.resolveMany).mockRejectedValue(new Error("catalog unavailable"));
    await expect(f.service.prepareFixture(f.activeViewer,original)).rejects.toMatchObject({code:"request_preparation_refused",status:409});
    expect(f.metadata).not.toHaveBeenCalled();expect(f.issue).not.toHaveBeenCalled();
    expect(await f.service.submit(f.activeViewer,original)).toEqual(saved);expect(f.records.size).toBe(1);
  });
  it.each(["use_saved","replace","omit"] as const)("uses the current v4 revision for %s without reading reported text",async mode=>{
    const f=preparationSetup(true);
    const referralChoice=mode==="use_saved"?{mode,admissionRevision:key}:mode==="replace"?{mode,referralName:"Unresolved Person"}:{mode};
    await f.service.prepareFixture(f.activeViewer,{...input(),optionalIntake:{referralChoice}});
    expect(f.metadata.mock.calls[0][0].referralRevision).toBe(key);
    expect(f.issue.mock.calls[0][0].referralRevision).toBe(key);
    expect(JSON.stringify(f.metadata.mock.calls[0][0])).not.toContain("Unresolved Person");
    expect(f.records.size).toBe(0);
  });
  it("refuses a stale use_saved revision and an erased current child before issuing a witness",async()=>{
    const f=preparationSetup(true);
    await expect(f.service.prepareFixture(f.activeViewer,{...input(),optionalIntake:{referralChoice:{mode:"use_saved",admissionRevision:"10000000-0000-4000-8000-000000000002"}}}))
      .rejects.toMatchObject({code:"request_preparation_refused",status:409});
    f.referralStatus.mockResolvedValue({admitted:false,referralRevision:key});
    await expect(f.service.prepareFixture(f.activeViewer,input())).rejects.toMatchObject({code:"request_preparation_refused",status:403});
    expect(f.metadata).not.toHaveBeenCalled();expect(f.issue).not.toHaveBeenCalled();
  });
  it.each(["capability","standing","admission","held","legal","quantity","age","assent","extra-assertion"])("preserves the canonical %s refusal before preparation",async failure=>{
    const f=preparationSetup();let actor=f.activeViewer;let body:unknown=input();
    if(failure==="capability")actor={...actor,capabilities:new Set()};
    if(failure==="standing")vi.mocked(f.deps.standing.accepted).mockResolvedValue(false);
    if(failure==="admission")f.present.mockResolvedValue(false);
    if(failure==="held")f.items[0]={...f.items[0],selectableForReview:false};
    if(failure==="legal")body={...input(),agreements:input().agreements.map(row=>({...row,version:"stale"}))};
    if(failure==="quantity")body={...input(),lines:[{productId:"clinical",variantId:"clinical-variant",quantity:101}]};
    if(failure==="age")body={...input(),contact:{...input().contact,ageConfirmed:false}};
    if(failure==="assent")body={...input(),agreements:input().agreements.map(row=>({...row,accepted:false}))};
    if(failure==="extra-assertion")body={...input(),noMail:true,ownerHash:"forged"};
    await expect(f.service.prepareFixture(actor,body)).rejects.toMatchObject({code:"request_preparation_refused"});
    expect(f.issue).not.toHaveBeenCalled();expect(f.records.size).toBe(0);expect(f.uuid).not.toHaveBeenCalled();
  });
  it("binds the current canonical owner/session without email identity or carried draft state",async()=>{
    const f=preparationSetup();await f.service.prepareFixture(f.activeViewer,input());
    const first=f.metadata.mock.calls[0][0],firstFacts=f.issue.mock.calls[0][0];
    await f.service.prepareFixture({...f.activeViewer,authUserId:"20000000-0000-4000-8000-000000000002",memberId:"member-b"},input());
    expect(f.metadata.mock.calls[1][0].ownerHash).not.toBe(first.ownerHash);
    await f.service.prepareFixture({...f.activeViewer,earlyAccessSessionHash:"other-session"},input());
    expect(f.metadata.mock.calls[2][0].admissionKey.ownerBinding).not.toBe(first.admissionKey.ownerBinding);
    expect(f.issue.mock.calls[2][0].sessionBindingHash).not.toBe(firstFacts.sessionBindingHash);
    expect(f.records.size).toBe(0);
  });
  it("fingerprints actual agreement time and optional facts without rewriting the frozen input",async()=>{
    const f=preparationSetup(),original=input();
    await f.service.prepareFixture(f.activeViewer,original);
    const first=f.metadata.mock.calls[0][0];
    const changed={...input(),agreements:input().agreements.map(row=>({...row,acceptedAt:"2026-10-14T11:59:59.999Z"})),
      optionalIntake:{goal:"compare_options" as const,referralCode:"REPORTED"}};
    await f.service.prepareFixture(f.activeViewer,changed);
    const second=f.metadata.mock.calls[1][0];
    expect(second.fingerprint).not.toBe(first.fingerprint);
    expect(second.attemptHash).toBe(first.attemptHash);
    expect(second.snapshot.agreements).toEqual(changed.agreements);
    expect(original.agreements.every(row=>row.acceptedAt===now)).toBe(true);expect(f.records.size).toBe(0);
  });
  it("does not issue or return a witness after metadata/issuer latency crosses its actual expiry",async()=>{
    const f=preparationSetup();
    f.metadata.mockImplementationOnce(async query=>{
      vi.spyOn(f.deps.clock,"now").mockReturnValue(new Date("2026-10-14T12:06:00Z"));
      return {protocol:REQUEST_INTENT_PREPARATION_PROTOCOL,snapshotSha256:"d".repeat(64),issuedAt:"2026-10-14T12:00:00Z",
        expiresAt:"2026-10-14T12:05:00Z",admissionExpiresAt:"2026-10-14T12:07:00Z",admissionPolicyRevision:query.admissionKey.policyRevision};
    });
    await expect(f.service.prepareFixture(f.activeViewer,input())).rejects.toMatchObject({code:"request_preparation_unavailable"});
    expect(f.issue).not.toHaveBeenCalled();
    const g=preparationSetup();g.issue.mockImplementationOnce(async()=>{
      vi.spyOn(g.deps.clock,"now").mockReturnValue(new Date("2026-10-14T12:06:00Z"));return "late.witness";
    });
    await expect(g.service.prepareFixture(g.activeViewer,input())).rejects.toMatchObject({code:"request_preparation_unavailable"});
    expect(g.records.size).toBe(0);
  });
  it.each([null,{},"unsafe witness","x".repeat(8193)])("refuses malformed issuer output %# without public diagnostics",async output=>{
    const f=preparationSetup();f.issue.mockResolvedValue(output);
    await expect(f.service.prepareFixture(f.activeViewer,input())).rejects.toMatchObject({code:"request_preparation_unavailable",message:"request_preparation_unavailable"});
    expect(f.records.size).toBe(0);
  });
  it("does not expose metadata/provider errors or silently create a working issuer",async()=>{
    const f=preparationSetup();f.metadata.mockRejectedValue(new Error("private SQL diagnostic synthetic"));
    await expect(f.service.prepareFixture(f.activeViewer,input())).rejects.toMatchObject({code:"request_preparation_unavailable",message:"request_preparation_unavailable"});
    expect(f.issue).not.toHaveBeenCalled();
  });
  it("refuses expired approved bounds and malformed custom metadata without a fallback issuer",async()=>{
    const f=preparationSetup();f.preparation.notAfter="2026-10-14T12:00:00.000000Z";
    await expect(f.service.prepareFixture(f.activeViewer,input())).rejects.toMatchObject({code:"request_preparation_unavailable"});
    expect(f.metadata).not.toHaveBeenCalled();expect(f.issue).not.toHaveBeenCalled();
    const g=preparationSetup();g.metadata.mockResolvedValue({protocol:REQUEST_INTENT_PREPARATION_PROTOCOL,extra:"private"});
    await expect(g.service.prepareFixture(g.activeViewer,input())).rejects.toMatchObject({code:"request_preparation_unavailable"});
    expect(g.issue).not.toHaveBeenCalled();
  });
});

describe("private unapproved mixed request intent", () => {
  it("derives use_saved custody from the owner and freezes its explicit command for replay",async()=>{
    const {deps,records}=setup();
    const admittedViewer={...viewer,earlyAccessSessionHash:"fixture-session"};
    const admission=makeCatalogAdmission(deps.legal,deps.hasher,{present:async()=>true,saveFirst:async()=>"committed"},7200,true);
    const service=new RequestIntentService({...deps,optionalIntakeEnabled:true,contactAdmission:admission});
    const command={...input(),optionalIntake:{goal:"ask_about_process" as const,referralChoice:{mode:"use_saved" as const,admissionRevision:key}}};
    const saved=await service.submit(admittedViewer,command);
    expect([...records.values()][0].referralAdmission).toEqual(await admission.key([...records.values()][0].ownerHash,"fixture-session"));
    vi.mocked(deps.standing.accepted).mockRejectedValue(new Error("expired or erased"));
    expect(await service.submit(admittedViewer,command)).toEqual(saved);
    await expect(service.submit(admittedViewer,{...command,optionalIntake:{referralChoice:{mode:"omit"}}})).rejects.toMatchObject({code:"attempt_conflict"});
    expect(records.size).toBe(1);
  });
  it("does not infer a name or code as account or AE authority",async()=>{
    const {deps,records}=setup();
    const admission=makeCatalogAdmission(deps.legal,deps.hasher,{present:async()=>true,saveFirst:async()=>"committed"},7200,true);
    const service=new RequestIntentService({...deps,optionalIntakeEnabled:true,contactAdmission:admission});
    await service.submit({...viewer,earlyAccessSessionHash:"fixture-session"},{...input(),optionalIntake:{referralChoice:{mode:"replace",referralName:"Unknown Sam"}}});
    expect([...records.values()][0].detail.optionalIntake).toEqual({referralChoice:{mode:"replace",referralName:"Unknown Sam"}});
    await expect(service.staffRead(null,{purpose:"request_intent_pending_read",actorSubjectId:"unknown",enabled:true},{get:vi.fn(),list:vi.fn()},key)).rejects.toMatchObject({status:401});
  });
  it("checks the authenticated owner's current policy before listing or searching any variants", async () => {
    const { service, deps } = setup();
    vi.mocked(deps.standing.accepted).mockResolvedValue(false);
    await expect(service.list(viewer, { search: "one", page: 1, pageSize: 24 }))
      .rejects.toMatchObject({ status: 403, code: "agreement_standing_required" });
    expect(deps.catalog.list).not.toHaveBeenCalled();
    vi.mocked(deps.standing.accepted).mockResolvedValue(true);
    expect((await service.list(viewer, { page: 1, pageSize: 24 })).total).toBe(2);
    expect(deps.catalog.list).toHaveBeenCalledTimes(1);
  });
  it("saves clinical plus RUO exact variants and quantities once; returns only a genuine minimal receipt", async () => {
    const { service, records, sideEffect } = setup();
    const receipt = await service.submit(viewer, input());
    expect(records.size).toBe(1);
    const stored = [...records.values()][0].detail;
    expect(stored.lines.map((line) => [line.productId, line.quantity, line.reviewState])).toEqual([
      ["clinical", 2, "pending"], ["research", 3, "pending"],
    ]);
    expect(stored.lines.map((line) => [line.clinicalReviewRequired, line.researchUseOnly])).toEqual([[true, false], [false, true]]);
    expect(receipt.publicReference).toBe(stored.publicReference);
    expect(Object.keys(receipt).sort()).toEqual(["createdAt", "kind", "publicReference", "requestId", "status"]);
    expect(JSON.stringify(receipt)).not.toContain("clinical");
    expect(sideEffect).not.toHaveBeenCalled();
    expect(() => service.rejectCommercialTransition()).toThrow("unapproved_intent_has_no_commercial_authority");
  });

  it("replays a lost committed response without re-resolving changing catalog or inventing another reference", async () => {
    const { service, deps, records } = setup();
    vi.mocked(deps.repository.createOrReplay).mockImplementationOnce(async (record) => {
      records.set(record.ownerHash + ":" + record.attemptHash, record);
      throw new Error("synthetic lost response after commit");
    });
    await expect(service.submit(viewer, input())).rejects.toThrow("synthetic lost response");
    const retry = await service.submit(viewer, input());
    expect(records.size).toBe(1);
    expect(retry.requestId).toBe([...records.values()][0].detail.requestId);
    expect(deps.catalog.resolveMany).toHaveBeenCalledTimes(1);
    expect(await service.recover(viewer, key)).toEqual(retry);
  });

  it("changed facts under the same attempt conflict rather than duplicate", async () => {
    const { service, records } = setup();
    await service.submit(viewer, input());
    await expect(service.submit(viewer, { ...input(), lines: [{ productId: "clinical", variantId: "clinical-variant", quantity: 4 }] }))
      .rejects.toMatchObject({ code: "attempt_conflict", status: 409 });
    expect(records.size).toBe(1);
  });

  it("same-attempt concurrent service calls converge in the atomic repository contract", async () => {
    const { service, records } = setup();
    const results = await Promise.all([service.submit(viewer, input()), service.submit(viewer, input())]);
    expect(results[0]).toEqual(results[1]);
    expect(records.size).toBe(1);
    // This memory contract test does NOT establish PostgreSQL race behavior.
  });

  it("another owner with the same contact email cannot recover a saved request", async () => {
    const { service } = setup();
    await service.submit(viewer, input());
    expect(await service.recover({ ...viewer, authUserId: "20000000-0000-4000-8000-000000000002" }, key)).toBeNull();
    await expect(service.recover({ ...viewer, authUserId: null }, key)).rejects.toMatchObject({ status: 401 });
  });

  it("private staff readback requires purpose-bound canonical staff authority, not general admin or unassigned clinician", async () => {
    const { service, records } = setup();
    const receipt = await service.submit(viewer, input());
    const get = vi.fn(async () => [...records.values()][0].detail);
    const capability = { purpose: "request_intent_pending_read" as const, actorSubjectId: "synthetic-staff", enabled: true };
    for (const roles of [["research_admin" as const], ["clinician" as const]]) {
      await expect(service.staffRead({ subjectId: "synthetic-staff", roles }, capability, { get, list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }) }, receipt.requestId)).rejects.toMatchObject({ status: 403 });
    }
    expect(get).not.toHaveBeenCalled();
    const detail = await service.staffRead({ subjectId: "synthetic-staff", roles: ["clinical_admin"] }, capability, { get, list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }) }, receipt.requestId);
    expect(detail?.lines).toHaveLength(2);
    await expect(service.staffRead({ subjectId: "synthetic-staff", roles: ["clinical_admin"] },
      { ...capability, enabled: false }, { get, list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }) }, receipt.requestId)).rejects.toMatchObject({ status: 403 });
  });

  it("binds both pending read operations to the actor and preserves backend approval refusal", async () => {
    const { service } = setup();
    const principal = { subjectId: "synthetic-staff", roles: ["clinical_admin" as const] };
    const context = { purpose: "request_intent_pending_read" as const, actorSubjectId: "synthetic-staff", enabled: true };
    const reader = { get: vi.fn(async () => { throw new Error("synthetic SQL refusal"); }),
      list: vi.fn(async () => { throw new Error("synthetic SQL refusal"); }) };
    for (const invalid of [{ ...context, actorSubjectId: "another-actor" }, { ...context, enabled: false },
      { ...context, purpose: "care" as typeof context.purpose }]) {
      await expect(service.staffRead(principal, invalid, reader, key)).rejects.toMatchObject({ status: 403 });
      await expect(service.staffList(principal, invalid, reader, 1)).rejects.toMatchObject({ status: 403 });
    }
    expect(reader.get).not.toHaveBeenCalled(); expect(reader.list).not.toHaveBeenCalled();
    await expect(service.staffRead(principal, context, reader, key)).rejects.toThrow("synthetic SQL refusal");
    await expect(service.staffList(principal, context, reader, 1)).rejects.toThrow("synthetic SQL refusal");
    expect(reader.get).toHaveBeenCalledWith(key, principal.subjectId);
    expect(reader.list).toHaveBeenCalledWith(principal.subjectId, 1);
    // Mock refusal propagation is not evidence that SQL ACL/capability checks ran.
  });

  it("clinical-only acknowledgments do not fabricate RUO acceptance", async () => {
    const { service, records } = setup();
    await service.submit(viewer, input(false));
    expect([...records.values()][0].detail.agreements.some((ack) => ack.kind.endsWith(":research_use_only"))).toBe(false);
  });

  it("missing legal facts, unaccepted facts and unknown medical/payment fields refuse before persistence", async () => {
    for (const raw of [
      { ...input(), medicalHistory: "not collected" },
      { ...input(), paymentVerificationId: "not authority" },
      { ...input(), agreements: [] },
      { ...input(), agreements: input().agreements.map((ack) => ({ ...ack, accepted: false })) },
      { ...input(), lines: [{ productId: "clinical", variantId: "clinical-variant", quantity: 2, reviewState: "approved" }] },
    ]) {
      const { service, records } = setup();
      await expect(service.submit(viewer, raw)).rejects.toThrow();
      expect(records.size).toBe(0);
    }
  });

  it("unavailable legal authority, unknown variants, coming-soon and excessive quantities do not save", async () => {
    const first = setup();
    vi.mocked(first.deps.legal.requiredAgreements).mockRejectedValue(new Error("synthetic unavailable"));
    await expect(first.service.submit(viewer, input())).rejects.toMatchObject({ code: "legal_requirements_unavailable" });
    expect(first.records.size).toBe(0);
    const second = setup();
    second.items[0] = { ...second.items[0], selectableForReview: false, intentExclusion: "coming_soon" };
    await expect(second.service.submit(viewer, input())).rejects.toMatchObject({ code: "selection_requires_refresh" });
    expect(second.records.size).toBe(0);
    const third = setup();
    await expect(third.service.submit(viewer, { ...input(), lines: [{ productId: "research", variantId: "research-variant", quantity: 101 }] }))
      .rejects.toMatchObject({ code: "selection_requires_refresh" });
  });

  it.each([true, false])("rejects stale legal versions before persistence and accepts refreshed exact requirements; RUO=%s", async (includesResearchUseOnly) => {
    const { service, deps, records } = setup();
    vi.mocked(deps.legal.requiredAgreements).mockResolvedValue([{ kind: "fixture-terms", version: "fixture-v2" }]);
    const stale = input(includesResearchUseOnly);
    await expect(service.submit(viewer, stale)).rejects.toMatchObject({ status: 400, code: "current_acknowledgments_required" });
    expect(records.size).toBe(0); expect(deps.repository.createOrReplay).not.toHaveBeenCalled();
    const refreshed: RequestIntentInput = { ...stale, idempotencyKey: "10000000-0000-4000-8000-000000000002",
      agreements: stale.agreements.map((agreement) => agreement.kind === "fixture-terms" ? { ...agreement, version: "fixture-v2" } : agreement) };
    const result = await service.submit(viewer, refreshed);
    expect(records.size).toBe(1); expect(deps.repository.createOrReplay).toHaveBeenCalledTimes(1);
    const saved = [...records.values()][0].detail;
    expect(saved.contact).toEqual(validateRequestIntentInput(refreshed).contact);
    expect(saved.contact.billingAddress).toEqual(saved.contact.shippingAddress);
    expect(saved.agreements).toEqual(refreshed.agreements);
    expect(result.publicReference).toBe(saved.publicReference);
    await expect(service.recover(viewer, refreshed.idempotencyKey)).resolves.toEqual(result);
  });

  it("a persistence failure never manufactures a confirmation", async () => {
    const { service, deps, records } = setup();
    vi.mocked(deps.repository.createOrReplay).mockRejectedValue(new Error("synthetic unavailable"));
    await expect(service.submit(viewer, input())).rejects.toThrow();
    expect(records.size).toBe(0);
  });

  it("RPC failures do not disclose provider messages or turn an uncertain write into success", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "XX000", message: "private provider diagnostic" } }));
    const repository = requestIntentRepository({ rpc });
    await expect(repository.findAttempt("a".repeat(64), "b".repeat(64))).rejects.toMatchObject({
      code: "request_intent_persistence_uncertain", status: 503,
    });
    expect(rpc).toHaveBeenCalledWith("request_intent_find_attempt", { p_owner_hash: "a".repeat(64), p_attempt_hash: "b".repeat(64) });
  });
});

describe("explicit optional private intake", () => {
  it("refuses brand-new optional data when the flag is off, leaving skipped requests unchanged", async () => {
    const { service, records } = setup();
    await expect(service.submit(viewer, { ...input(), optionalIntake: { goal: "check_availability" } }))
      .rejects.toMatchObject({ code: "optional_intake_unavailable" });
    expect(records.size).toBe(0);
    await service.submit(viewer, input());
    expect(records.size).toBe(1);
    expect([...records.values()][0].detail).not.toHaveProperty("optionalIntake");
  });
  it("preserves only voluntarily submitted fields, deduplicates retries and withholds them from the receipt", async () => {
    const { deps, records } = setup();
    const service = new RequestIntentService({ ...deps, optionalIntakeEnabled: true });
    const value = { ...input(), optionalIntake: { goal: "compare_options" as const, referralCode: "TEAM-12" } };
    const receipt = await service.submit(viewer,value);
    expect(receipt).not.toHaveProperty("optionalIntake");
    expect((await service.recover(viewer,key))).toEqual(receipt);
    expect((await service.submit(viewer,value))).toEqual(receipt);
    expect(records.size).toBe(1);
    expect([...records.values()][0].detail.optionalIntake).toEqual(value.optionalIntake);
    await expect(service.submit(viewer,{...value,optionalIntake:{...value.optionalIntake,referralCode:"TEAM-13"}}))
      .rejects.toMatchObject({ code: "attempt_conflict" });
    // Disabling new collection must still allow recovery of a committed attempt.
    expect(await new RequestIntentService(deps).submit(viewer,value)).toEqual(receipt);
  });
});

import express, { type RequestHandler } from "express";
import request from "supertest";
import { createRequestIntentRouter } from "./express";
import { requestIntentMutationGuard } from "./production";
import { makeCatalogAdmission, type ContactAdmissionCustody } from "./catalog-admission";

describe("private version-bound admission before a catalog read",()=>{
  const qa={...viewer,actorType:"early_access_session",memberId:null,authUserId:null,earlyAccessCustomerRef:"eac-synthetic",
    earlyAccessSessionHash:"hash-A",normalizedEmail:null} as const;
  const postalAddress={line1:"12 Sample Street",city:"Austin",region:"TX",postalCode:"78701",countryCode:"US"};
  const form={postalAddress,fullLegalName:"  Andre\u0301   Example  ",email:"  EXAMPLE@EXAMPLE.INVALID  "};
  function gate() {
    const base=setup();const store=new Map<string,{fullLegalName:string;email:string}>();
    const custody: ContactAdmissionCustody={
      present:vi.fn(async k=>store.has(JSON.stringify(k))),
      saveFirst:vi.fn(async (k,contact)=>{
        const key=JSON.stringify(k);const prev=store.get(key);
        if(prev) return JSON.stringify(prev)===JSON.stringify(contact)?"already_same":"different_contact";
        store.set(key,contact);return "committed";
      }),
    };
    const contactAdmission=makeCatalogAdmission(base.deps.legal,base.deps.hasher,custody);
    return {...base,store,custody,service:new RequestIntentService({...base.deps,contactAdmission})};
  }
  it("recording requires live resolved identity and server-confirmed waiver before data custody",async()=>{
    const g=gate();
    await expect(g.service.admissionStatus({...qa,capabilities:new Set()})).rejects.toMatchObject({status:401});
    vi.mocked(g.deps.standing.accepted).mockResolvedValue(false);
    await expect(g.service.recordAdmission(qa,form)).rejects.toMatchObject({code:"agreement_standing_required"});
    expect(g.custody.saveFirst).not.toHaveBeenCalled();expect(g.custody.present).not.toHaveBeenCalled();
  });
  it("denies direct listings and new requests before admission, before any catalog read or write",async()=>{
    const g=gate();
    await expect(g.service.list(qa,{search:"example"})).rejects.toMatchObject({code:"catalog_admission_required"});
    await expect(g.service.submit(qa,input())).rejects.toMatchObject({code:"catalog_admission_required"});
    expect(g.deps.catalog.list).not.toHaveBeenCalled();expect(g.deps.catalog.resolveMany).not.toHaveBeenCalled();expect(g.records.size).toBe(0);
  });
  it("normalizes facts and returns an opaque policy indicator only; duplicate is idempotent and cannot overwrite",async()=>{
    const g=gate();const {policyRevision,admitted}=await g.service.admissionStatus(qa);expect(admitted).toBe(false);
    const recorded=await g.service.recordAdmission(qa,{...form,policyRevision});expect(recorded).toEqual({admitted:true,policyRevision});
    expect([...g.store.values()]).toEqual([{fullLegalName:"André Example",email:"example@example.invalid",postalAddress}]);
    await expect(g.service.recordAdmission(qa,{...form,policyRevision})).resolves.toEqual(recorded);
    await expect(g.service.recordAdmission(qa,{...form,email:"other@example.invalid",policyRevision})).rejects.toMatchObject({status:409});
    expect((await g.service.list(qa,{})).total).toBe(2);
    expect(g.store.size).toBe(1);expect(JSON.stringify([...g.store.keys()])).not.toContain("eac-synthetic");
  });
  it.each([{postalAddress:undefined},{postalAddress:{...postalAddress,region:""}},{postalAddress:{...postalAddress,line1:""}},{postalAddress:{...postalAddress,countryCode:"ZZ"}},
    {postalAddress:{...postalAddress,notes:"extra"}},{postalAddress:{...postalAddress,line2:"A\nB"}},{fullLegalName:" "},{email:"@example.com"},{email:"bad@@example.com"},{email:"foo\r\n@example.com"},{ownerHash:"spoof"},
    {customerRef:"claimed"},{goal:"unrelated medical data"},{fullLegalName:"A".repeat(201)}])("does not write invalid or unowned fields",async(change)=>{
    const g=gate(),{policyRevision}=await g.service.admissionStatus(qa);await expect(g.service.recordAdmission(qa,{...form,policyRevision,...change})).rejects.toThrow();
    expect(g.store.size).toBe(0);
  });
  it("a rotated session, changed customer reference, and changed legal pair cannot reuse old admission",async()=>{
    const g=gate(),{policyRevision}=await g.service.admissionStatus(qa);await g.service.recordAdmission(qa,{...form,policyRevision});
    for(const other of [{...qa,earlyAccessSessionHash:"hash-B"},{...qa,earlyAccessCustomerRef:"eac-other"}]){
      expect((await g.service.admissionStatus(other)).admitted).toBe(false);
      await expect(g.service.list(other,{})).rejects.toMatchObject({status:403});
    }
    vi.mocked(g.deps.legal.requiredAgreements).mockResolvedValue([{kind:"fixture-terms",version:"v2"}]);
    expect((await g.service.admissionStatus(qa)).admitted).toBe(false);
    await expect(g.service.recordAdmission(qa,{...form,policyRevision})).rejects.toMatchObject({code:"catalog_admission_policy_changed"});expect(g.store.size).toBe(1);
  });
  it("custody error/unknown schema or empty/ambiguous legal set cannot grant access",async()=>{
    const g=gate();vi.mocked(g.custody.present).mockRejectedValue(Error("provider private detail"));
    await expect(g.service.list(qa,{})).rejects.toMatchObject({status:503,message:"catalog_admission_unavailable"});
    const rev="a".repeat(64);for(const p of [[],[{kind:"waiver",version:"1"},{kind:"waiver",version:"2"}]]){
      vi.mocked(g.deps.legal.requiredAgreements).mockResolvedValue(p);await expect(g.service.recordAdmission(qa,{...form,policyRevision:rev})).rejects.toMatchObject({status:503});
    }expect(g.deps.catalog.list).not.toHaveBeenCalled();expect(g.store.size).toBe(0);
  });
  it("accepts addresses without a postal code in Hong Kong and rejects a conflicting address on retry",async()=>{
    const g=gate(),{policyRevision}=await g.service.admissionStatus(qa);
    const postalAddress={line1:"16 Sample Road",city:"Kowloon",countryCode:"HK"};
    await g.service.recordAdmission(qa,{...form,policyRevision,postalAddress});
    await expect(g.service.recordAdmission(qa,{...form,policyRevision,postalAddress:{...postalAddress,line1:"18 Sample Road"}})).rejects.toMatchObject({status:409});
    expect(g.store.size).toBe(1);
  });
  it("missing custody adapter fails closed even with a valid current policy",async()=>{
    const b=setup();const s=new RequestIntentService({...b.deps,contactAdmission:makeCatalogAdmission(b.deps.legal,b.deps.hasher,null)});
    await expect(s.admissionStatus(qa)).rejects.toMatchObject({status:503});await expect(s.list(qa,{})).rejects.toMatchObject({status:503});
  });
  it("renewed waiver/temporarily unavailable contact store cannot strand an identical saved receipt",async()=>{
    const g=gate(),{policyRevision}=await g.service.admissionStatus(qa);await g.service.recordAdmission(qa,{...form,policyRevision});
    const receipt=await g.service.submit(qa,input());vi.mocked(g.custody.present).mockRejectedValue(Error("down"));vi.mocked(g.deps.standing.accepted).mockResolvedValue(false);
    expect(await g.service.submit(qa,input())).toEqual(receipt);expect(await g.service.recover(qa,key)).toEqual(receipt);expect(g.records.size).toBe(1);
  });
  it("Express honors the existing origin guard, private cache header and backend owner; never echoes contact",async()=>{
    const g=gate(),app=express(),pass:RequestHandler=(_q,_r,next)=>next();app.use(express.json());
    app.use("/test",createRequestIntentRouter({service:g.service,contactAdmissionRoutes:true,resolveCustomer:async()=>qa,care:{loadCapabilityStatus:async()=>({rail:"care",state:"disabled",enabled:false,publicMessage:"",checkedAt:now}),resolvePrincipal:async()=>null,recordAccessDecision:async()=>{}},staffReadEnabled:()=>false,
      staffReader:{get:async()=>null,list:async()=>{throw Error("unused")}},enabled:()=>true,mutationGuard:requestIntentMutationGuard("https://site.example.invalid"),readRateLimit:pass,writeRateLimit:pass}));
    expect((await request(app).get("/test/catalog")).status).toBe(403);
    const status=await request(app).get("/test/admission");expect(status.headers["cache-control"]).toContain("no-store");
    const payload={...form,policyRevision:status.body.policyRevision};
    expect((await request(app).post("/test/admission").send(payload)).status).toBe(403);
    const post=await request(app).post("/test/admission").set("Origin","https://site.example.invalid").send(payload);
    expect(post.body).toEqual({admitted:true,policyRevision:payload.policyRevision});expect((await request(app).get("/test/catalog")).status).toBe(200);
  });
});
