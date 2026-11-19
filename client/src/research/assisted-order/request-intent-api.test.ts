import { describe, expect, it, vi } from "vitest";
import { createRequestIntentApi, RequestIntentHttpError, isKnownIntentPrewriteRefusal,parsePreparedFixtureReply,
  RequestIntentPreparationHttpError,REQUEST_INTENT_PREPARATION_PROTOCOL,type RequestIntentPreparedContext } from "./request-intent-api";
import {postIntentAttempt,readIntentAttempt,clearFirstRefusedIntentAttempt} from "./request-intent-attempt";
import type { RequestIntentDetail } from "../../../../shared/research/assisted-order/request-intent";
import type { RequestWorkflowV1, StartReviewV1 } from "../../../../shared/research/assisted-order/request-intent-workflow";
import type {RequestIntentInput} from "../../../../shared/research/assisted-order/request-intent";
it("keeps only normalized reported referral fields in the authorized staff response",async()=>{
 const id="10000000-0000-4000-8000-000000000001";
 const detail={kind:"unapproved_selection_request",status:"pending_review",requestId:id,publicReference:"XRI-"+id.replaceAll("-","").toUpperCase(),createdAt:"2026-11-18T00:00:00Z",
  contact:{},lines:[],agreements:[],optionalIntake:{referralName:" Jane  Smith "}};
 const api=createRequestIntentApi(()=>"fixture",async()=>new Response(JSON.stringify(detail)));
 expect((await api.staff(id)).optionalIntake).toEqual({referralName:"Jane Smith"});
});

describe("explicit private fixture preparation transport",()=>{
 const reply={kind:"request_intent_prepared_fixture",protocol:REQUEST_INTENT_PREPARATION_PROTOCOL,witness:"synthetic.opaque-witness",expiresAt:"2026-11-19T12:01:00.123456Z"};
 it("does nothing until explicitly called and sends the unchanged input/current canonical token once",async()=>{
  let token="synthetic-first";
  const transport=vi.fn(async(_path:string,_init:RequestInit)=>new Response(JSON.stringify(reply)));
  const api=createRequestIntentApi(()=>token,transport);
  expect(transport).not.toHaveBeenCalled();
  // Transport-only synthetic body; the real service separately validates it.
  const input={idempotencyKey:"10000000-0000-4000-8000-000000000001",contact:{},agreements:[],lines:[]} as RequestIntentInput;
  token="synthetic-current";
  expect(await api.prepareFixture!(input)).toEqual(reply);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0][0]).toBe("/api/research/early-access/request-intents/prepare-fixture");
  expect(transport.mock.calls[0][1]).toMatchObject({method:"POST",credentials:"include",cache:"no-store",headers:{Authorization:"Bearer synthetic-current"}});
  expect(JSON.parse(transport.mock.calls[0][1].body as string)).toEqual(input);
  expect(transport.mock.calls[0][1].body).not.toMatch(/ownerHash|noMail|fingerprint|fixtureApproval/);
 });
 it.each([[400,"request_preparation_refused"],[401,"request_preparation_refused"],[403,"request_preparation_refused"],
  [409,"request_preparation_refused"],[503,"request_preparation_unavailable"]] as const)("keeps structured %s preparation refusal separate from submit retry clearance",async(status,error)=>{
  const api=createRequestIntentApi(()=>null,async()=>new Response(JSON.stringify({error}),{status}));
  const failure=await api.prepareFixture!({} as RequestIntentInput).catch((value:unknown)=>value);
  expect(failure).toBeInstanceOf(RequestIntentPreparationHttpError);
  expect(failure).not.toBeInstanceOf(RequestIntentHttpError);expect(isKnownIntentPrewriteRefusal(failure)).toBe(false);
  expect(failure).toMatchObject({status,code:error});expect(String(failure)).not.toContain("not saved");
 });
 it.each([null,{}, {...reply,ownerHash:"private"},{...reply,witness:""},{...reply,witness:"x".repeat(8193)},
  {...reply,witness:"unsafe witness"},{...reply,protocol:"another"},{...reply,expiresAt:"2026-02-30T12:00:00Z"},
  {...reply,expiresAt:"infinity"},{...reply,expiresAt:"2026-11-19T12:01:00.1234567Z"}])("rejects invalid success without accepting a receipt or retrying %#",async body=>{
  const transport=vi.fn(async()=>new Response(JSON.stringify(body)));
  await expect(createRequestIntentApi(()=>null,transport).prepareFixture!({} as RequestIntentInput)).rejects.toThrow("Preparation could not be confirmed");
  expect(transport).toHaveBeenCalledTimes(1);
 });
 it("preserves valid six-digit UTC output while refusing raw/malformed error diagnostics",async()=>{
  expect(parsePreparedFixtureReply(reply).expiresAt).toBe(reply.expiresAt);
  expect(parsePreparedFixtureReply({...reply,expiresAt:"2026-11-19T12:01:00.123456+00:00"}).expiresAt).toContain("+00:00");
  for(const body of ['{"error":"request_preparation_unavailable","message":"private SQL"}',
    '{"error":"request_outcome_unconfirmed"}','{"error":"request_preparation_refused"}','<html>private SQL</html>']){
    const api=createRequestIntentApi(()=>null,async()=>new Response(body,{status:503}));
    const failure=await api.prepareFixture!({} as RequestIntentInput).catch((value:unknown)=>value);
    expect(failure).not.toBeInstanceOf(RequestIntentPreparationHttpError);expect(String(failure)).not.toMatch(/private SQL|request_outcome|not saved/);
  }
 });
 it("does not automatically retry a lost preparation reply or turn it into submit uncertainty",async()=>{
  const transport=vi.fn(async()=>{throw new TypeError("private network detail");});
  const failure=await createRequestIntentApi(()=>null,transport).prepareFixture!({} as RequestIntentInput).catch((value:unknown)=>value);
  expect(String(failure)).toContain("Stop this rehearsal");expect(String(failure)).not.toContain("private network");
  expect(isKnownIntentPrewriteRefusal(failure)).toBe(false);expect(transport).toHaveBeenCalledTimes(1);
 });
});

describe("I2 isolated prepared submission transport",()=>{
 const continuation="synthetic.continuation-v1",witness="fw1.synthetic.signature";
 const id="10000000-0000-4000-8000-000000000001",acceptedAt="2026-11-19T15:00:00.123456Z";
 // Transport-only frozen synthetic input; server validation is a separate boundary.
 const input=Object.freeze({idempotencyKey:id,contact:{},lines:[],agreements:[
  {kind:"synthetic-terms",version:"synthetic-v1",accepted:true,acceptedAt},
 ]}) as RequestIntentInput;
 const receipt={kind:"unapproved_selection_request",status:"pending_review",requestId:id,
  publicReference:"XRI-"+id.replaceAll("-","").toUpperCase(),createdAt:"2026-11-19T15:01:00Z"};
 function fixture(raw:unknown=receipt,status=200){
  const transport=vi.fn(async(_path:string,_init:RequestInit)=>new Response(JSON.stringify(raw),{status}));
  return {transport,api:createRequestIntentApi(()=>"synthetic-current",transport,{continuation})};
 }
 it("has no prepared-submit method without an actual valid private context",async()=>{
  const transport=vi.fn(async()=>new Response("{}"));
  const ordinary=createRequestIntentApi(()=>null,transport);
  expect(ordinary.submitPrepared).toBeUndefined();
  expect(Object.prototype.hasOwnProperty.call(ordinary,"submitPrepared")).toBe(false);
  for(const context of [null,{},[],{continuation:""},{continuation:"unsafe value"},{continuation:"x".repeat(8193)},
   {continuation:"unsafe\r\nInjected:value"},{continuation,ready:true},Object.create({continuation})]){
   const api=createRequestIntentApi(()=>null,transport,context as RequestIntentPreparedContext);
   expect(api.submitPrepared).toBeUndefined();
   await expect(api.prepareFixture!(input)).rejects.toThrow("Preparation could not be confirmed");
  }
  let reads=0;
  const context=Object.defineProperty({},"continuation",{get(){reads++;return continuation;}});
  expect(createRequestIntentApi(()=>null,transport,context as RequestIntentPreparedContext).submitPrepared).toBeUndefined();
  expect(reads).toBe(0);expect(transport).not.toHaveBeenCalled();
 });
 it("posts the exact frozen body once with current token and private headers only on the two private operations",async()=>{
  let token:string|null="synthetic-first";
  const prepare={kind:"request_intent_prepared_fixture",protocol:REQUEST_INTENT_PREPARATION_PROTOCOL,witness,expiresAt:"2026-11-19T15:02:00.123456Z"};
  const transport=vi.fn(async(path:string,_init:RequestInit)=>new Response(JSON.stringify(
   path.endsWith("/prepare-fixture")?prepare:path.endsWith("/recover")?{receipt:null}:receipt)));
  const context={continuation};
  const api=createRequestIntentApi(()=>token,transport,context);
  expect(transport).not.toHaveBeenCalled();
  context.continuation="mutated-mount-context";
  expect(await api.prepareFixture!(input)).toEqual(prepare);
  token="synthetic-current";
  expect(await api.submitPrepared!(input,witness)).toEqual(receipt);
  token=null;await api.submit(input);await api.recover(id);
  const [prepareCall,prepared,ordinary,recover]=transport.mock.calls;
  expect(prepareCall[0]).toBe("/api/research/early-access/request-intents/prepare-fixture");
  expect(prepareCall[1].headers).toEqual({accept:"application/json","content-type":"application/json",
   Authorization:"Bearer synthetic-first","X-Xenios-Fixture-Continuation":continuation});
  expect(prepared[0]).toBe("/api/research/early-access/request-intents");
  expect(prepared[1]).toEqual({method:"POST",credentials:"include",cache:"no-store",
   headers:{accept:"application/json","content-type":"application/json",Authorization:"Bearer synthetic-current",
    "X-Xenios-Fixture-Witness":witness,"X-Xenios-Fixture-Continuation":continuation},body:JSON.stringify(input)});
  expect(ordinary[1]).toEqual({method:"POST",credentials:"include",cache:"no-store",
   headers:{accept:"application/json","content-type":"application/json"},body:prepared[1].body});
  expect(recover[1].headers).toEqual({accept:"application/json","content-type":"application/json"});
  for(const call of [prepareCall,prepared,ordinary])expect(call[1].body).toBe(JSON.stringify(input));
  expect(JSON.parse(prepared[1].body as string).agreements[0].acceptedAt).toBe(acceptedAt);
  expect(prepared[1].body).not.toMatch(/continuation|witness|noMail|preparedMode/);
  expect(transport).toHaveBeenCalledTimes(4);
 });
 it.each([undefined,null,7,"","unsafe value","unsafe\r\nInjected:value","unicode-π","x".repeat(8193)])(
  "rejects malformed witness before any transport %#",async raw=>{
   const {api,transport}=fixture();
   await expect(api.submitPrepared!(input,raw as string)).rejects.toThrow("Keep the same attempt");
   expect(transport).not.toHaveBeenCalled();
  });
 it("accepts the declared safe header bounds without silently truncating or re-encoding",async()=>{
  const transport=vi.fn(async(_path:string,_init:RequestInit)=>new Response(JSON.stringify(receipt)));
  const api=createRequestIntentApi(()=>null,transport,{continuation:"c".repeat(8192)});
  await api.submitPrepared!(input,"w".repeat(8192));
  expect(transport.mock.calls[0][1].headers).toMatchObject({
   "X-Xenios-Fixture-Continuation":"c".repeat(8192),"X-Xenios-Fixture-Witness":"w".repeat(8192)});
 });
 it("uses only the already published preparation refusal type for a closed 409, without marker clearance",async()=>{
  const {api,transport}=fixture({error:"request_preparation_refused"},409);
  const failure=await api.submitPrepared!(input,witness).catch((error:unknown)=>error);
  expect(failure).toBeInstanceOf(RequestIntentPreparationHttpError);
  expect(failure).toMatchObject({status:409,code:"request_preparation_refused"});
  expect(isKnownIntentPrewriteRefusal(failure)).toBe(false);
  expect(String(failure)).not.toMatch(/not saved|witness|continuation/);
  expect(transport).toHaveBeenCalledTimes(1);
 });
 it.each([[503,"request_preparation_unavailable"],[503,"request_preparation_refused"],
  [503,"request_intent_unavailable"],[400,"request_preparation_refused"],[401,"request_preparation_refused"],
  [403,"request_preparation_refused"],[409,"request_outcome_unconfirmed"],[500,"request_preparation_refused"],
  [502,"request_preparation_unavailable"]] as const)("keeps %s/%s uncertain with no ordinary fallback",async(status,error)=>{
   const {api,transport}=fixture({error},status);
   const failure=await api.submitPrepared!(input,witness).catch((value:unknown)=>value);
   expect(failure).not.toBeInstanceOf(RequestIntentPreparationHttpError);
   expect(failure).not.toBeInstanceOf(RequestIntentHttpError);
   expect(isKnownIntentPrewriteRefusal(failure)).toBe(false);
   expect(String(failure)).toContain("Keep the same attempt");expect(transport).toHaveBeenCalledTimes(1);
  });
 it.each(["<html>private diagnostic</html>","null","[]","{}",'{"error":7}',
  '{"error":"request_preparation_refused","private":"diagnostic"}',
  '{"error":"request_preparation_refused"}'+" ".repeat(1024)])("withholds malformed or oversized 409 refusal %#",async raw=>{
   const transport=vi.fn(async()=>new Response(raw,{status:409}));
   const failure=await createRequestIntentApi(()=>null,transport,{continuation}).submitPrepared!(input,witness).catch((value:unknown)=>value);
   expect(failure).not.toBeInstanceOf(RequestIntentPreparationHttpError);
   expect(String(failure)).toContain("Keep the same attempt");expect(String(failure)).not.toContain("diagnostic");
   expect(transport).toHaveBeenCalledTimes(1);
  });
 it.each([null,{},[],{receipt},"not-a-receipt",{...receipt,requestId:"other"}])("keeps malformed successful receipt unconfirmed %#",async raw=>{
  const {api,transport}=fixture(raw);
  await expect(api.submitPrepared!(input,witness)).rejects.toThrow("Keep the same attempt");
  expect(transport).toHaveBeenCalledTimes(1);
 });
 it("redacts lost replies, stream failure and invalid UTF-8 without retrying",async()=>{
  for(const response of [
   async()=>{throw new TypeError("private network detail");},
   async()=>new Response(new ReadableStream({start(controller){controller.error(new Error("private stream detail"));}})),
   async()=>new Response(new Uint8Array([0xff,0xfe])),
  ]){
   const transport=vi.fn(response);
   const failure=await createRequestIntentApi(()=>null,transport,{continuation}).submitPrepared!(input,witness).catch((value:unknown)=>value);
   expect(String(failure)).toContain("Keep the same attempt");expect(String(failure)).not.toContain("private");
   expect(transport).toHaveBeenCalledTimes(1);
  }
 });
 it.each([409,503])("preserves the existing real attempt marker after prepared POST status %s",async status=>{
  let marker:string|null=null;
  const storage={getItem:()=>marker,setItem:(_key:string,value:string)=>{marker=value;},removeItem:vi.fn(()=>{marker=null;})};
  const attempt={key:id,acceptedAt,state:"in_flight" as const};
  const {api,transport}=fixture({error:status===409?"request_preparation_refused":"request_preparation_unavailable"},status);
  const failure=await postIntentAttempt(storage,attempt,()=>api.submitPrepared!(input,witness)).catch((value:unknown)=>value);
  expect(readIntentAttempt(storage)).toMatchObject({key:id,acceptedAt,state:"uncertain"});
  expect(clearFirstRefusedIntentAttempt(storage,attempt,{firstPost:true,stillCurrent:true,error:failure})).toBe(false);
  expect(storage.removeItem).not.toHaveBeenCalled();expect(transport).toHaveBeenCalledTimes(1);
 });
 it("retains existing receipt confirmation and owned-marker clearing after a real successful reply",async()=>{
  let marker:string|null=null;
  const storage={getItem:()=>marker,setItem:(_key:string,value:string)=>{marker=value;},removeItem:vi.fn(()=>{marker=null;})};
  const {api}=fixture();
  await expect(postIntentAttempt(storage,{key:id,acceptedAt,state:"in_flight"},()=>api.submitPrepared!(input,witness))).resolves.toEqual(receipt);
  expect(storage.removeItem).toHaveBeenCalledTimes(1);expect(marker).toBeNull();
 });
});
describe("mixed-request canonical transport", () => {
  it("uses the current member token for each call and the exact method-admitted submit path", async () => {
    let token: string | null = "synthetic-first";
    const transport = vi.fn(async (_path: string, _init: RequestInit) => new Response(JSON.stringify({ receipt: null }), { status: 200 }));
    const api = createRequestIntentApi(() => token, transport);
    await api.recover("10000000-0000-4000-8000-000000000001");
    token = "synthetic-second";
    await api.recover("10000000-0000-4000-8000-000000000001");
    token = null;
    // Deliberately invalid body: this test asserts transport only, not server acceptance.
    await api.submit({} as Parameters<typeof api.submit>[0]);
    expect(transport.mock.calls[0][1].headers).toMatchObject({ Authorization: "Bearer synthetic-first" });
    expect(transport.mock.calls[1][1].headers).toMatchObject({ Authorization: "Bearer synthetic-second" });
    expect(transport.mock.calls[2][0]).toBe("/api/research/early-access/request-intents");
    expect(transport.mock.calls[2][1].headers).not.toHaveProperty("Authorization");
    expect(transport.mock.calls[2][1]).toMatchObject({ credentials: "include", cache: "no-store", method: "POST" });
  });
  it("fails closed on a disabled or noncanonical requirement response", async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ enabled: true, requiredAgreements: [], formAcknowledgments: [] })));
    await expect(createRequestIntentApi(() => null, transport).config()).rejects.toThrow("Request requirements unavailable.");
  });
});

describe("Doc163 structured refusal classification", () => {
  it("exposes well-formed HTTP status and code without copying server message text", async () => {
    for (const status of [400, 401, 403, 429, 409, 500, 503]) {
      const transport = async () => new Response(JSON.stringify({ error: "synthetic_refusal", message: "private diagnostic" }), { status });
      const api = createRequestIntentApi(() => null, transport);
      const error = await api.submit({} as Parameters<typeof api.submit>[0]).catch((value: unknown) => value);
      expect(error).toBeInstanceOf(RequestIntentHttpError);
      expect(error).toMatchObject({ status, code: "synthetic_refusal" });
      expect(String(error)).not.toContain("private diagnostic");
      expect(isKnownIntentPrewriteRefusal(error)).toBe([400, 401, 403, 429].includes(status));
    }
  });
  it("keeps a known HTTP status UNKNOWN when its body is absent or malformed", async () => {
    for (const status of [400, 401, 403, 429]) {
      for (const body of ["<html>", "null", "{}", "[]", '{"error":7}', '{"message":"refused"}']) {
        const api = createRequestIntentApi(() => null, async () => new Response(body, { status }));
        const error = await api.submit({} as Parameters<typeof api.submit>[0]).catch((value: unknown) => value);
        expect(isKnownIntentPrewriteRefusal(error)).toBe(false);
        expect(error).not.toBeInstanceOf(RequestIntentHttpError);
      }
    }
  });
  it("knows only the server's pre-handler 503 intake refusal among 5xx answers", async () => {
    // request_intent_unavailable is answered before the submit handler runs; request_outcome_unconfirmed after.
    for (const [status, code, known] of [
      [503, "request_intent_unavailable", true], [503, "request_outcome_unconfirmed", false], [503, "rate_limited", false],
      [500, "request_intent_unavailable", false], [502, "request_intent_unavailable", false], [504, "request_intent_unavailable", false],
    ] as const) {
      const api = createRequestIntentApi(() => null, async () => new Response(JSON.stringify({ error: code }), { status }));
      const error = await api.submit({} as Parameters<typeof api.submit>[0]).catch((value: unknown) => value);
      expect(error).toMatchObject({ status, code });
      expect(isKnownIntentPrewriteRefusal(error)).toBe(known);
    }
    for (const body of ["<html>", "null", "{}", '{"error":"Request_Intent_Unavailable"}', '{"message":"request_intent_unavailable"}']) {
      const api = createRequestIntentApi(() => null, async () => new Response(body, { status: 503 }));
      const error = await api.submit({} as Parameters<typeof api.submit>[0]).catch((value: unknown) => value);
      expect(isKnownIntentPrewriteRefusal(error)).toBe(false);
    }
  });
});

describe("private queue response page identity and bounds", () => {
  const first = { kind: "unapproved_selection_request", status: "pending_review",
    requestId: "30000000-0000-4000-8000-000000000001",
    publicReference: "XRI-30000000000040008000000000000001",
    createdAt: "2026-10-14T12:00:00.000Z", lineCount: 2 };
  const second = { ...first, requestId: "30000000-0000-4000-8000-000000000002",
    publicReference: "XRI-30000000000040008000000000000002" };
  const valid = { items: [first], total: 51, page: 1, pageSize: 25 };
  function fixture(body: unknown) {
    const transport = vi.fn(async (_path: string, _init: RequestInit) => new Response(JSON.stringify(body), { status: 200 }));
    return { api: createRequestIntentApi(() => "synthetic-staff", transport), transport };
  }
  it.each([0, 1.5, 10001])("refuses invalid requested page %s before transport", async (page) => {
    const { api, transport } = fixture(valid);
    await expect(api.staffQueue(page)).rejects.toThrow("Queue unavailable.");
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    ["missing returned page", { ...valid, page: undefined }],
    ["wrong returned page", { ...valid, page: 2 }],
    ["missing page size", { ...valid, pageSize: undefined }],
    ["zero page size", { ...valid, pageSize: 0 }],
    ["fractional page size", { ...valid, pageSize: 25.5 }],
    ["unsafe page size", { ...valid, pageSize: Number.MAX_SAFE_INTEGER + 1 }],
    ["more rows than page size", { ...valid, items: [first, second], pageSize: 1 }],
    ["more rows than total", { ...valid, total: 0 }],
  ])("refuses a successful envelope with %s", async (_reason, body) => {
    const { api, transport } = fixture(body);
    await expect(api.staffQueue(1)).rejects.toThrow("Queue unavailable.");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("keeps a valid partial page and its supplied positive page size", async () => {
    const partial = { ...valid, pageSize: 7 };
    const { api, transport } = fixture(partial);
    await expect(api.staffQueue(1)).resolves.toEqual(partial);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith("/api/research/early-access/request-intents/staff?page=1",
      expect.objectContaining({ method: "GET", credentials: "include", cache: "no-store" }));
  });
  it("accepts an empty later page at the existing bound without deriving a maximum from total", async () => {
    const empty = { items: [], total: 0, page: 10000, pageSize: 25 };
    const { api, transport } = fixture(empty);
    await expect(api.staffQueue(10000)).resolves.toEqual(empty);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe("/api/research/early-access/request-intents/staff?page=10000");
  });
});

describe("customer catalog response page identity and bounds", () => {
  // The client clears the catalog amount on every item (quote-only), so a served item always carries the field.
  const item = { productId: "synthetic-product", variantId: "synthetic-variant",
    selectableForReview: true, clinicalReviewRequired: false, unitPriceCents: null };
  const valid = { items: [item], total: 51, page: 1, pageSize: 24,
    families: [], channels: [], workflowModes: [] };
  function fixture(body: unknown) {
    const transport = vi.fn(async (_path: string, _init: RequestInit) => new Response(JSON.stringify(body), { status: 200 }));
    return { api: createRequestIntentApi(() => "synthetic-customer", transport), transport };
  }
  it.each([
    { label: "zero page", query: { page: 0 } },
    { label: "fractional page", query: { page: 1.5 } },
    { label: "unsafe page", query: { page: Number.MAX_SAFE_INTEGER + 1 } },
    { label: "NaN page", query: { page: Number.NaN } },
    { label: "infinite page", query: { page: Number.POSITIVE_INFINITY } },
    { label: "zero page size", query: { pageSize: 0 } },
    { label: "fractional page size", query: { pageSize: 1.5 } },
    { label: "page size above the server bound", query: { pageSize: 101 } },
    { label: "unsafe page size", query: { pageSize: Number.MAX_SAFE_INTEGER + 1 } },
  ])("refuses requested $label before transport", async ({ query }) => {
    const { api, transport } = fixture(valid);
    await expect(api.catalog(query)).rejects.toThrow("The current catalog could not be confirmed.");
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    ["wrong returned page", { ...valid, page: 2 }],
    ["zero returned page", { ...valid, page: 0 }],
    ["negative returned page", { ...valid, page: -1 }],
    ["zero returned page size", { ...valid, pageSize: 0 }],
    ["negative returned page size", { ...valid, pageSize: -1 }],
    ["wrong returned page size", { ...valid, pageSize: 100 }],
    ["more rows than requested page size", { ...valid, items: Array.from({ length: 25 }, (_, i) =>
      ({ ...item, productId: "synthetic-" + i, variantId: "synthetic-variant-" + i })) }],
    ["more rows than total", { ...valid, total: 0 }],
  ])("refuses a successful catalog envelope with %s", async (_reason, body) => {
    const { api, transport } = fixture(body);
    await expect(api.catalog({ page: 1, pageSize: 24 })).rejects.toThrow("The current catalog could not be confirmed.");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("preserves the existing default page 1 and page size 24", async () => {
    const { api, transport } = fixture(valid);
    await expect(api.catalog({})).resolves.toEqual(valid);
    expect(transport).toHaveBeenCalledWith("/api/research/early-access/request-intents/catalog?page=1&pageSize=24",
      expect.objectContaining({ method: "GET", credentials: "include", cache: "no-store" }));
  });
  it("sends the topical presentation beside a family, and leaves it out when absent", async () => {
    const { api, transport } = fixture(valid);
    await expect(api.catalog({ family: "clinical_formulations_503a", presentation: "topicals" })).resolves.toEqual(valid);
    expect(transport.mock.calls[0][0]).toBe(
      "/api/research/early-access/request-intents/catalog?family=clinical_formulations_503a&presentation=topicals&page=1&pageSize=24");
  });
  it("accepts the server's maximum requested page size without clamping", async () => {
    const body = { ...valid, total: 1, pageSize: 100 };
    const { api, transport } = fixture(body);
    await expect(api.catalog({ pageSize: 100 })).resolves.toEqual(body);
    expect(transport.mock.calls[0][0]).toBe("/api/research/early-access/request-intents/catalog?page=1&pageSize=100");
  });
  it("keeps the reader's valid nine-row partial page 5 of 105 items", async () => {
    const body = { ...valid, page: 5, total: 105, items: Array.from({ length: 9 }, (_, i) =>
      ({ ...item, productId: "synthetic-" + i, variantId: "synthetic-variant-" + i })) };
    const { api, transport } = fixture(body);
    await expect(api.catalog({ page: 5 })).resolves.toEqual(body);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([10001, Number.MAX_SAFE_INTEGER])("keeps an empty later catalog page %s without an invented ceiling", async (page) => {
    const body = { ...valid, items: [], total: 0, page, pageSize: 100 };
    const { api, transport } = fixture(body);
    await expect(api.catalog({ page, pageSize: 100 })).resolves.toEqual(body);
    expect(transport.mock.calls[0][0]).toBe("/api/research/early-access/request-intents/catalog?page=" + page + "&pageSize=100");
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe("private detail requested identity", () => {
  const id = "a0000000-bbbb-4ccc-8ddd-000000000001";
  const otherId = "b0000000-bbbb-4ccc-8ddd-000000000002";
  const otherReference = "XRI-B0000000BBBB4CCC8DDD000000000002";
  const detail: RequestIntentDetail = {
    kind: "unapproved_selection_request", requestId: id,
    publicReference: "XRI-A0000000BBBB4CCC8DDD000000000001",
    status: "pending_review", createdAt: "2026-10-14T12:00:00.000Z",
    contact: {
      fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid",
      mobilePhone: "+15555550123", ageConfirmed: true,
      shippingAddress: { line1: "1 Synthetic Street", city: "Test", region: "TX",
        postalCode: "00000", countryCode: "US" },
      billingSameAsShipping: true,
    },
    agreements: [{ kind: "synthetic-review-terms", version: "synthetic-v1",
      accepted: true, acceptedAt: "2026-10-14T11:59:00.000Z" }],
    lines: [{ productId: "synthetic-product", variantId: "synthetic-variant",
      sourceVariantId: "synthetic-source-variant", productName: "Synthetic research item",
      specification: "Synthetic specification", family: "research_peptides_materials",
      workflowMode: "direct_order_request", quantity: 1, researchUseOnly: true,
      clinicalReviewRequired: false, sourceDisplayState: "request_access",
      sourceVariantDisplayState: "request_access", sourceRefusal: null,
      catalogVersion: "synthetic-v1", reviewState: "pending" }],
  };
  function fixture(body: RequestIntentDetail) {
    const transport = vi.fn(async (_path: string, _init: RequestInit) => new Response(JSON.stringify(body), { status: 200 }));
    return { api: createRequestIntentApi(() => "synthetic-staff", transport), transport };
  }
  it.each([
    { label: "exact spelling", requested: id, body: detail },
    { label: "uppercase request", requested: id.toUpperCase(), body: detail },
    { label: "uppercase response", requested: id, body: { ...detail, requestId: id.toUpperCase() } },
  ])("preserves matching detail with $label", async ({ requested, body }) => {
    const { api, transport } = fixture(body);
    await expect(api.staff(requested)).resolves.toEqual(body);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith("/api/research/early-access/request-intents/staff/" + requested,
      expect.objectContaining({ method: "GET", credentials: "include", cache: "no-store",
        headers: { accept: "application/json", Authorization: "Bearer synthetic-staff" } }));
  });
  it("refuses another request's complete detail even when its receipt is internally consistent", async () => {
    const { api, transport } = fixture({ ...detail, requestId: otherId, publicReference: otherReference });
    await expect(api.staff(id)).rejects.toThrow("Request detail is unavailable.");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe("/api/research/early-access/request-intents/staff/" + id);
  });
  it("retains receipt refusal when the returned ID and public reference disagree", async () => {
    const { api, transport } = fixture({ ...detail, publicReference: otherReference });
    await expect(api.staff(id)).rejects.toThrow("Request outcome is unconfirmed.");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("retains invalid requested identity refusal before transport", async () => {
    const { api, transport } = fixture(detail);
    await expect(api.staff("not-a-request-id")).rejects.toThrow("Invalid request identity.");
    expect(transport).not.toHaveBeenCalled();
  });
});


describe("explicit staff review command transport", () => {
  const id = "30000000-0000-4000-8000-000000000001";
  const command: StartReviewV1 = { commandId: "70000000-0000-4000-8000-000000000001", expectedRevision: 1 };
  const at = "2026-11-18T03:00:00.000Z";
  function workflow(reviewing = true): RequestWorkflowV1 {
    return { schemaVersion: 1, requestId: id, publicReference: "XRI-" + id.replaceAll("-", "").toUpperCase(),
      state: reviewing ? "reviewing" : "queued", revision: reviewing ? 2 : 1, changedAt: at, customerNotice: "pending",
      events: [
        { id: "40000000-0000-4000-8000-000000000001", revision: 0, kind: "received", occurredAt: at },
        { id: "40000000-0000-4000-8000-000000000002", revision: 1, kind: "queued", occurredAt: at },
        ...(reviewing ? [{ id: "40000000-0000-4000-8000-000000000003", revision: 2, kind: "review_started" as const, occurredAt: at }] : []),
      ] };
  }
  it("posts exactly the frozen command to the UUID leaf with current canonical transport", async () => {
    let token = "synthetic-first";
    const result = { replay: true, workflow: workflow() };
    const transport = vi.fn(async (_path: string, _init: RequestInit) => new Response(JSON.stringify(result)));
    const api = createRequestIntentApi(() => token, transport);
    expect(transport).not.toHaveBeenCalled();
    await expect(api.startReview!(id, command)).resolves.toEqual(result);
    const [path, init] = transport.mock.calls[0];
    expect(path).toBe("/api/research/early-access/request-intents/staff/" + id + "/start-review");
    expect(init).toMatchObject({ method: "POST", credentials: "include", cache: "no-store" });
    expect(init.headers).toMatchObject({ accept: "application/json", "content-type": "application/json", Authorization: "Bearer synthetic-first" });
    expect(JSON.parse(init.body as string)).toEqual(command);
    token = "synthetic-renewed";
    await api.startReview!(id, command);
    expect(transport.mock.calls[1][1].headers).toMatchObject({ Authorization: "Bearer synthetic-renewed" });
    expect(transport.mock.calls[1][1].body).toBe(init.body);
  });
  it("rejects invalid identities and nonclosed commands before dispatch", async () => {
    const transport = vi.fn(async () => new Response("{}"));
    const api = createRequestIntentApi(() => null, transport);
    for (const bad of ["../staff", "", "XRI-30000000000040008000000000000001", id + "?actor=other"]) {
      await expect(api.startReview!(bad, command)).rejects.toThrow();
    }
    for (const bad of [{ ...command, actorId: id }, { ...command, expectedRevision: 0 }, { ...command, commandId: "other" }]) {
      await expect(api.startReview!(id, bad as StartReviewV1)).rejects.toThrow();
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it("recognizes a conflict only from a closed structured server error", async () => {
    const api = createRequestIntentApi(() => null, async () => new Response(JSON.stringify({ error: "workflow_revision_conflict" }), { status: 409 }));
    await expect(api.startReview!(id, command)).rejects.toMatchObject({ name: "RequestIntentHttpError", status: 409, code: "workflow_revision_conflict" });
    for (const raw of ["<html>conflict</html>", "null", "[]", "{}", '{"error":7}', '{"error":"workflow_revision_conflict","private":"diagnostic"}']) {
      const other = createRequestIntentApi(() => null, async () => new Response(raw, { status: 409 }));
      const error = await other.startReview!(id, command).catch((value: unknown) => value);
      expect(error).not.toBeInstanceOf(RequestIntentHttpError);
      expect(String(error)).not.toContain("diagnostic");
    }
  });
  it("holds malformed or mismatched successes as unconfirmed without an automatic retry", async () => {
    const valid = workflow();
    const invalid = [null, {}, { replay: false, workflow: workflow(false) },
      { replay: false, workflow: { ...valid, requestId: "30000000-0000-4000-8000-000000000002" } },
      { replay: false, workflow: valid, staffEmail: "private@example.invalid" }];
    for (const raw of invalid) {
      const transport = vi.fn(async () => new Response(JSON.stringify(raw)));
      const api = createRequestIntentApi(() => null, transport);
      await expect(api.startReview!(id, command)).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(1);
    }
    const transport = vi.fn(async () => { throw new TypeError("synthetic lost response"); });
    await expect(createRequestIntentApi(() => null, transport).startReview!(id, command)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
