/** Actions-only, provider-free static preview. No application/Auth composition. */
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AssistedOrderViewer } from "../../server/research/assisted-order/ports";
import { buildRawHttpDocumentResponse } from "../../server/research/seo/raw-http-document-policy";
import { policies, EARLY_ACCESS_PRODUCT_POLICY_SLUG, EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT } from "../../server/research/policies-data";
import { ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS, assistedOrderFormPair } from "../../shared/research/assisted-order/form";
import { HCG_STRENGTH_REVIEW } from "../../shared/research/master-offerings/hcg-strength-review";
import { classifyRequest, safeNetworkUrl, scenarioDefinition, PUBLIC_SCENARIO, WHOLESALE_ROUTE,
  PARTNER_COMPONENT_SCENARIO, partnerSafeNetworkTarget, DISPLAY_SCENARIO, DISPLAY_SOURCE_PINS, DISPLAY_MEDIA_PINS, DISPLAY_CATALOG_PATH,
  READ_ONLY_GET_FIXTURES, sourceDerivedDisplayRows, displayCatalogPage, MC10_DISPLAY_CONTRACT, LEGACY_DISPLAY_CONTRACT, MC10_SCOPE,
  MC10_CANONICAL_PINS, MC10_CONFIGURATIONS, MC10_ADMISSION_PATH, MC10_POLICY_REVISION, MC10_CONTACT_WIRE } from "./owned-runner-browser-qa.mjs";

export const UNAVAILABLE_FIXTURE = Object.freeze({
  ok: false,
  message: "API not available in this isolated preview.",
});
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const MIME: Record<string, string> = {
  js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8", webmanifest: "application/manifest+json",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  avif: "image/avif", txt: "text/plain; charset=utf-8", map: "application/json",
  html: "text/html; charset=utf-8",
};
type Asset = { path: string; bytes: number; sha256: string };
type RecordRow = {
  method: string; target: string; kind: string; status: number;
  responseSha256: string; responseBytes: number; headers: Record<string, string>;
};
type SyntheticDisplayRow = { productName: string; specification: string; unitPriceCents: null; priceVersion: null;
  selectableForReview: boolean; intentExclusion: string | null;
  reviewedContent?: { brand?: string; summary: string }; reviewedMedia?: { primary?: { href: string }; representation?: string } };

/** Only exact, public, immutable source data. Never a real application port. */
export function createSyntheticDisplayData(repo: string) {
  const root = realpathSync(repo);
  for (const pin of DISPLAY_SOURCE_PINS) {
    const file = resolve(root, pin.path);
    if (!file.startsWith(root + sep) || !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()
      || realpathSync(file) !== file || hash(readFileSync(file)) !== pin.sha256) throw new Error("DISPLAY_SOURCE_PIN_MISMATCH");
  }
  const data = (name: string) => JSON.parse(readFileSync(resolve(root, "server/research/master-offerings/data/" + name), "utf8"));
  const items = sourceDerivedDisplayRows({ catalog: data("member-safe-master-offerings.generated.json"),
    bindings: data("master-offering-bindings.generated.json"), media: data("reviewed-public-media.json"),
    content: data("reviewed-public-content.json"), hcg: HCG_STRENGTH_REVIEW }) as SyntheticDisplayRow[];
  const fixtures: Record<string, { status: number; body: unknown }> = {
    "/api/config": READ_ONLY_GET_FIXTURES["/api/config"],
    "/api/research/me": READ_ONLY_GET_FIXTURES["/api/research/me"],
    "/api/research/early-access/session": { status: 200, body: { authenticated: true, expiresAt: null } },
    "/api/research/early-access/assisted-orders/config": { status: 503, body: { enabled: false } },
    "/api/research/policies": { status: 200, body: { policies: {
      [EARLY_ACCESS_PRODUCT_POLICY_SLUG]: policies[EARLY_ACCESS_PRODUCT_POLICY_SLUG],
    } } },
    "/api/research/early-access/agreements": { status: 200, body: { accepted: true, required: [EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT] } },
    "/api/research/early-access/request-intents/config": { status: 200, body: { enabled: true, contactAdmissionRequired: true,
      requiredAgreements: [EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT], formAcknowledgments: ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((ack) => ({
        id: ack.id, scope: ack.scope, copy: ack.copy, ...assistedOrderFormPair(ack),
      })) } },
    "/api/research/early-access/request-intents/admission": { status: 200, body: { admitted: true,
      policyRevision: "e222864ba2bcd022bd3404ac6f2372a03bfb1d479a56b849fb4eb470080ff303", retentionSeconds: 7200 } },
  };
  const normalize = (text: string) => text.trim().replace(/\s+/gu, " ");
  return { fixtures, items, assetPins: DISPLAY_MEDIA_PINS,
    expectations: items.map((item) => ({ name: item.productName, specification: item.specification,
      summary: item.reviewedContent ? normalize((item.reviewedContent.brand ? item.reviewedContent.brand + " · " : "") + item.reviewedContent.summary) : null,
      media: item.reviewedMedia?.primary?.href ?? null, representation: item.reviewedMedia?.representation ?? null,
      selectableForReview: item.selectableForReview, intentExclusion: item.intentExclusion })),
    receipt: { kind: "SYNTHETIC_DISPLAY_ONLY_NOT_REAL_AUTH_ASSENT_CONTACT_OR_ELIGIBILITY",
      rows: items.length, rowsSha256: hash(JSON.stringify(items)), pricesNull: items.every((item) => item.unitPriceCents === null && item.priceVersion === null),
      persisted: false, actualActor: false, actualAssent: false, contactRecord: false } };
}

/** Verify exact canonical bytes before importing the real projector. No env/DB ports. */
export function verifyMC10CanonicalInputs(repo: string) {
  const root = realpathSync(repo);
  const receipts = MC10_CANONICAL_PINS.map((pin: {path:string;bytes:number;sha256:string;blob:string}) => {
    const file = resolve(root,pin.path), stat = lstatSync(file);
    if(!file.startsWith(root+sep)||!stat.isFile()||stat.isSymbolicLink()||realpathSync(file)!==file)
      throw new Error('MC10_CANONICAL_SOURCE_UNSAFE');
    const bytes=readFileSync(file);
    if(bytes.length!==pin.bytes||hash(bytes)!==pin.sha256)throw new Error('MC10_CANONICAL_SOURCE_MISMATCH');
    return {...pin,actualSha256:hash(bytes)};
  });
  const names=readdirSync(resolve(root,'config/research')).filter(name=>/^master-catalog-reconciliation-.*\.json$/u.test(name)).sort();
  if(names.at(-1)!=='master-catalog-reconciliation-20260821.json')throw new Error('MC10_HOLD_SOURCE_CHANGED');
  return receipts;
}

/** Real canonical public reader -> real inquiry projection, with no price authority. */
export async function createMC10DisplayData(repo: string) {
  const root=realpathSync(repo);
  if(root!==realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../..')))throw new Error('MC10_FIXED_SOURCE_ROOT_REQUIRED');
  const pins=verifyMC10CanonicalInputs(root);
  const [{GeneratedMasterOfferingCatalogReader},{MasterOfferingCatalogService},{loadBindingIndex,bindingsByOfferingVariantId},
    {readReviewedCommerceHolds,normalizeSpecification},{createRequestIntentCatalog},{mixedInquiryCatalogPage,catalogPriceFields}]
    = await Promise.all([
      import('../../server/research/master-offerings/dataset-reader'),
      import('../../server/research/master-offerings/service'),
      import('../../server/research/master-offerings/production-bindings'),
      import('../../server/research/master-offerings/reviewed-holds'),
      import('../../server/research/assisted-order/request-intent/catalog'),
      import('../../shared/research/early-access/quote-only'),
    ]);
  const reader=new GeneratedMasterOfferingCatalogReader(resolve(root,'server/research/master-offerings/data/member-safe-master-offerings.generated.json'));
  const loaded=reader.load(), declared=JSON.parse(readFileSync(resolve(root,MC10_CANONICAL_PINS[0].path),'utf8'));
  if(declared.canonicalProductCount!==476||declared.variantCount!==476
    ||loaded.summary.offerings!==476||loaded.summary.variants!==476)throw new Error('MC10_DECLARED_DATASET_CHANGED');
  const bindings=loadBindingIndex({env:{XENIOS_MASTER_OFFERING_BINDINGS:resolve(root,'server/research/master-offerings/data/master-offering-bindings.generated.json')},cwd:root});
  if(bindings.problem!==null)throw new Error('MC10_BINDING_ARTIFACT_INVALID');
  const forward=bindingsByOfferingVariantId(bindings.index), reverse=new Map<string,string>();
  for(const binding of forward.values()){
    const key=JSON.stringify([binding.productId,binding.variantId]);
    if(reverse.has(key))throw new Error('MC10_BINDING_IDENTITY_AMBIGUOUS');
    reverse.set(key,binding.offeringVariantId);
  }
  const holds=new Set(readReviewedCommerceHolds(root).map(hold=>normalizeSpecification(hold.specification)));
  const service=new MasterOfferingCatalogService(reader,async()=>({binding:null,selection:null}));
  const catalog=createRequestIntentCatalog({serviceFor:()=>service,bindingFor:id=>forward.get(id)??null,
    offeringVariantFor:identity=>reverse.get(JSON.stringify([identity.productId,identity.variantId]))??null,
    catalogVersion:'owned-mc10-canonical-'+MC10_CANONICAL_PINS[0].sha256,
    reviewedFormulationHolds:holds,allListedInquirable:false},async()=>null,()=>1795132800000);
  // Canonical anonymous shape (express.ts175–187), with no customer grants.
  const viewer: AssistedOrderViewer = Object.freeze({
    actorType:'early_access_session' as const,memberId:null,authUserId:null,
    earlyAccessSessionHash:null,earlyAccessCustomerRef:null,normalizedEmail:null,
    capabilities:new Set<never>(),
  });
  const privateKeys=new Set(['supplier','supplierOrOwner','supplierSku','sourceSku','sourceNotes','wholesaleCost','costCents','margin','staffReviewCode','reviewCode']);
  const audit=(value:unknown):void=>{
    if(Array.isArray(value)){for(const entry of value)audit(entry);return;}
    if(!value||typeof value!=='object')return;
    for(const [key,entry]of Object.entries(value)){
      if(privateKeys.has(key))throw new Error('MC10_PUBLIC_DTO_PRIVATE_FIELD');audit(entry);
    }
  };
  async function readPage(query:{search?:string;page:number;pageSize:number}){
    const page=mixedInquiryCatalogPage(await catalog.list(viewer,query));
    if(catalogPriceFields(page).length||page.items.some(row=>row.unitPriceCents!==null||row.priceVersion!==null))
      throw new Error('MC10_PUBLIC_DTO_PRICE_PRESENT');
    audit(page);
    // The actual DTO, not a second projection or an empty audit input.
    return JSON.parse(JSON.stringify(page)) as typeof page;
  }
  const first=await readPage({page:1,pageSize:24}), items=[...first.items];
  if(!Number.isSafeInteger(first.total)||first.total<1||first.total>476)throw new Error('MC10_PROJECTION_TOTAL_INVALID');
  const pages=[first];
  for(let page=2;page<=Math.ceil(first.total/24);page++){
    const next=await readPage({page,pageSize:24});
    if(next.total!==first.total||next.page!==page||next.pageSize!==24)throw new Error('MC10_PROJECTION_CHANGED');
    pages.push(next);items.push(...next.items);
  }
  const sourceVariants=new Set(loaded.products.flatMap(product=>product.variants.map(variant=>variant.id)));
  const identities=new Set<string>(),projected=new Set<string>();
  for(const item of items){
    const id=item.sourceSelection?.variantId,key=JSON.stringify([item.productId,item.variantId]);
    if(!id||!sourceVariants.has(id)||projected.has(id)||identities.has(key))throw new Error('MC10_PROJECTION_IDENTITY_INVALID');
    projected.add(id);identities.add(key);
  }
  if(items.length!==first.total)throw new Error('MC10_PROJECTION_INCOMPLETE');
  // Independently walk the canonical selection, before inquiry projection.
  const readerSelections=new Set<string>();let selectionTotal:number|null=null;
  for(let page=1;page<=5;page++){
    const selection=await service.select({page,pageSize:100});
    if(selectionTotal!==null&&selection.page.total!==selectionTotal)throw new Error('MC10_READER_SELECTION_CHANGED');
    selectionTotal=selection.page.total;
    for(const offering of selection.offerings)for(const variant of offering.variants){
      if(readerSelections.has(variant.id))throw new Error('MC10_READER_SELECTION_AMBIGUOUS');readerSelections.add(variant.id);
    }
    if(readerSelections.size===selectionTotal)break;
  }
  if(readerSelections.size!==selectionTotal)throw new Error('MC10_READER_SELECTION_INCOMPLETE');
  const media=JSON.parse(readFileSync(resolve(root,'server/research/master-offerings/data/reviewed-public-media.json'),'utf8'));
  const assetMap=new Map<string,{path:string;sha256:string}>();
  for(const item of items){
    if(!item.reviewedMedia)continue;
    const records=media.records.filter((record:{sourceVariantId:string})=>record.sourceVariantId===item.sourceSelection!.variantId);
    if(records.length!==1)throw new Error('MC10_REVIEWED_MEDIA_IDENTITY_INVALID');
    for(const kind of ['primary','labelPreview'] as const){
      const image=item.reviewedMedia[kind];if(!image)continue;
      const path=image.href,sha256=records[0][kind+'Sha256'];
      if(!/^\/research\/product-media\/[a-zA-Z0-9._-]+\.(png|webp|jpe?g|svg)$/u.test(path)
        ||records[0].media[kind]?.href!==path||!/^[a-f0-9]{64}$/u.test(sha256)
        ||item.sourceSelection!.variantId===HCG_STRENGTH_REVIEW.variantId)throw new Error('MC10_REVIEWED_MEDIA_UNSAFE');
      if(assetMap.has(path)&&assetMap.get(path)!.sha256!==sha256)throw new Error('MC10_MEDIA_CONFLICT');
      assetMap.set(path,{path,sha256});
    }
  }
  const count=(predicate:(item:typeof items[number])=>boolean)=>items.filter(predicate).length;
  const representatives={
    clinical:items.find(item=>item.clinicalReviewRequired),
    laboratory:items.find(item=>item.researchUseOnly&&!item.clinicalReviewRequired&&item.selectableForReview),
    supplement:items.find(item=>item.family==='supplements'),
    longName:[...items].sort((a,b)=>b.productName.length-a.productName.length||a.variantId.localeCompare(b.variantId))[0],
    held:items.find(item=>item.sourceRefusal==='formulation_hold'||item.intentExclusion==='specification_review'),
    missingMedia:items.find(item=>!item.reviewedMedia?.primary),
    nonMerchandise:items.find(item=>item.intentExclusion==='non_merchandise'),
  };
  for(const [name,item]of Object.entries(representatives))if(!item)throw new Error('MC10_REQUIRED_REPRESENTATIVE_MISSING_'+name.toUpperCase());
  const search=await readPage({search:'BPC-157',page:1,pageSize:24});
  const selection=search.items.find(item=>item.selectableForReview&&!item.clinicalReviewRequired&&item.productName.includes('BPC-157'));
  if(!selection)throw new Error('MC10_NATIVE_SELECTION_REPRESENTATIVE_MISSING');
  const base=createSyntheticDisplayDataFixtures();
  return {fixtures:base,items,readPage,selection:{productId:selection.productId,variantId:selection.variantId},assetPins:[...assetMap.values()],expectations:null,
    receipt:{kind:MC10_SCOPE,canonicalSourcePins:pins,declaredProducts:476,declaredVariants:476,
      canonicalReaderSelectionTotal:selectionTotal,projectedTotal:first.total,uniqueSourceVariants:projected.size,
      sourceNotProjected:[...sourceVariants].filter(id=>!projected.has(id)).sort(),
      readerNotProjected:[...readerSelections].filter(id=>!projected.has(id)).sort(),
      counts:{selectable:count(item=>item.selectableForReview),nonselectable:count(item=>!item.selectableForReview),
        clinical:count(item=>item.clinicalReviewRequired),excluded:count(item=>item.intentExclusion!==null),
        refused:count(item=>item.sourceRefusal!==null),missingMedia:count(item=>!item.reviewedMedia?.primary)},
      representatives:Object.fromEntries(Object.entries(representatives).map(([name,item])=>[name,{productId:item!.productId,variantId:item!.variantId,sourceVariantId:item!.sourceSelection!.variantId}])),
      pageHashes:pages.map(page=>({page:page.page,items:page.items.length,sha256:hash(JSON.stringify(page))})),
      rowsSha256:hash(JSON.stringify(items)),pricesNull:true,publicDtoAudited:true,allListedInquirable:false,
      sourceCoverageIsNotPaintedCoverage:true,actualActor:false,actualAssent:false,persisted:false},
  };
}

/** Shared inert bytes; the legacy factory remains unchanged. */
function createSyntheticDisplayDataFixtures():Record<string,{status:number;body:unknown}>{
  return {
    '/api/config':READ_ONLY_GET_FIXTURES['/api/config'],'/api/research/me':READ_ONLY_GET_FIXTURES['/api/research/me'],
    '/api/research/early-access/session':{status:200,body:{authenticated:true,expiresAt:null}},
    '/api/research/early-access/assisted-orders/config':{status:503,body:{enabled:false}},
    '/api/research/policies':{status:200,body:{policies:{[EARLY_ACCESS_PRODUCT_POLICY_SLUG]:policies[EARLY_ACCESS_PRODUCT_POLICY_SLUG]}}},
    '/api/research/early-access/agreements':{status:200,body:{accepted:true,required:[EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT]}},
    '/api/research/early-access/request-intents/config':{status:200,body:{enabled:true,contactAdmissionRequired:true,
      requiredAgreements:[EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT],formAcknowledgments:ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map(ack=>({id:ack.id,scope:ack.scope,copy:ack.copy,...assistedOrderFormPair(ack)}))}},
    [MC10_ADMISSION_PATH]:{status:200,body:{admitted:false,policyRevision:MC10_POLICY_REVISION,retentionSeconds:7200}},
  };
}

type AdmissionReply={status:number;body:{admitted:boolean;policyRevision:string;retentionSeconds:number}};
/** Memory only, exact generation. A late held reply cannot authorize a successor. */
export function createMC10AdmissionFixture(){
  let generation=0,profile:string|null=null,phase='RETIRED',posts=0,catalogReads=0;
  let held:{generation:number;resolve:(reply:AdmissionReply)=>void;off:()=>void}|null=null;
  const histories:Array<{generation:number;profile:string;posts:number;catalogReads:number;phase:string}>=[];
  const reply=(admitted:boolean,status=200):AdmissionReply=>({status,body:{admitted,policyRevision:MC10_POLICY_REVISION,retentionSeconds:7200}});
  const closeHeld=()=>{const old=held;held=null;if(old){old.off();old.resolve(reply(false,409));}};
  return Object.freeze({
    begin(selectedProfile:string){
      if(!MC10_CONFIGURATIONS.some(config=>config.name===selectedProfile)||phase!=='RETIRED'||generation>=6||MC10_CONFIGURATIONS[generation].name!==selectedProfile)throw new Error('MC10_GENERATION_BEGIN_REFUSED');
      generation++;profile=selectedProfile;phase='REQUIRED';posts=0;catalogReads=0;return generation;
    },
    status(){if(phase==='RETIRED')throw new Error('MC10_GENERATION_RETIRED');return reply(phase==='CONFIRMED');},
    record(wire:string,signal:AbortSignal,requestGeneration:number):Promise<AdmissionReply>{
      if(requestGeneration!==generation||phase!=='REQUIRED'||posts!==0||signal.aborted||wire!==MC10_CONTACT_WIRE||Buffer.byteLength(wire)>4096)
        throw new Error('MC10_ADMISSION_REFUSED');
      posts++;phase='PENDING_HELD';
      return new Promise(resolve=>{
        const current=generation;
        const abort=()=>{if(held?.generation===current){phase='EXPIRED';closeHeld();}};
        held={generation:current,resolve,off:()=>signal.removeEventListener('abort',abort)};
        signal.addEventListener('abort',abort,{once:true});
      });
    },
    release(expectedGeneration:number){
      if(arguments.length!==1||expectedGeneration!==generation)throw new Error('MC10_ADMISSION_RELEASE_REFUSED');
      if(phase!=='PENDING_HELD'||!held||held.generation!==generation)throw new Error('MC10_ADMISSION_RELEASE_REFUSED');
      const old=held;held=null;old.off();phase='CONFIRMED';old.resolve(reply(true));
    },
    catalog(){if(phase!=='CONFIRMED')throw new Error('MC10_CATALOG_BEFORE_ADMISSION');catalogReads++;},
    expire(expectedGeneration:number){if(arguments.length!==1||expectedGeneration!==generation||phase!=='CONFIRMED'||held)throw new Error('MC10_EXPIRY_REFUSED');phase='EXPIRED';},
    retire(){if(phase==='RETIRED')return;closeHeld();histories.push({generation,profile:profile!,posts,catalogReads,phase});phase='RETIRED';profile=null;},
    current(expectedGeneration:number){return expectedGeneration===generation&&phase!=='RETIRED';},
    snapshot(){return {generation,profile,phase,posts,catalogReads,pending:held!==null,synthetic:true,persisted:false};},
    census(){return histories.map(entry=>({...entry}));},
  });
}
/** Public mode has one synthetic404 POST; premium entry refuses every POST. */
export async function startOwnedPreview({ root, inventory, ledger, scenario = PUBLIC_SCENARIO,
  displayContract = LEGACY_DISPLAY_CONTRACT }: {
  root: string; inventory: readonly Asset[]; ledger: RecordRow[]; scenario?: string; displayContract?:string;
}) {
  const definition = scenarioDefinition(scenario,displayContract), mc10=displayContract===MC10_DISPLAY_CONTRACT;
  const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const display = scenario === DISPLAY_SCENARIO
    ? mc10 ? await createMC10DisplayData(sourceRoot) : createSyntheticDisplayData(sourceRoot) : null;
  const admission=mc10?createMC10AdmissionFixture():null;
  const fixtures = display?.fixtures ?? definition.fixtures;
  const realRoot = realpathSync(root);
  const assets = new Map(inventory.map((item) => [item.path, item]));
  if (assets.size !== inventory.length || !assets.has("index.html")) throw new Error("PREVIEW_INVENTORY_INVALID");
  for (const pin of display?.assetPins ?? []) {
    if (assets.get(pin.path.slice(1))?.sha256 !== pin.sha256) throw new Error("DISPLAY_ASSET_PIN_MISMATCH");
  }
  let origin = "";
  const counters = { resolve404: 0, refused: 0, unexpected: 0, credentialAttempts: 0,
    readOnlyGET: Object.fromEntries([...Object.keys(fixtures), ...(display ? [DISPLAY_CATALOG_PATH] : [])].map((path) => [path, 0])) as Record<string, number> };
  const catalogQueries: Array<{ query: unknown; responseSha256: string; total: number }> = [];
  const mc10Counters = counters as typeof counters & {admissionPOST?:number;preAdmissionCatalog?:number};
  if(mc10){mc10Counters.admissionPOST=0;mc10Counters.preAdmissionCatalog=0;}
  const queryOptions={displayContract,projectedTotal:display?.items.length,
    mc10MediaPaths:mc10?display!.assetPins.map(pin=>pin.path):[]};
  const bytesFor = (name: string): Buffer => {
    const expected = assets.get(name);
    if (!expected) throw new Error("PREVIEW_ASSET_MISSING");
    const filename = resolve(realRoot, name);
    if (!filename.startsWith(realRoot + sep) || lstatSync(filename).isSymbolicLink()
      || realpathSync(filename) !== filename || !lstatSync(filename).isFile()) throw new Error("PREVIEW_ASSET_UNSAFE");
    const bytes = readFileSync(filename);
    if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256) throw new Error("PREVIEW_ASSET_CHANGED");
    return bytes;
  };
  const template = bytesFor("index.html").toString("utf8");
  function answer(req: IncomingMessage, res: ServerResponse, kind: string, status: number,
    body: Buffer | string, headers: Record<string, string> = {}) {
    if (Object.keys(headers).some((name) => name.toLowerCase() === "set-cookie")) throw new Error("PREVIEW_COOKIE_FORBIDDEN");
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const finalHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...headers };
    ledger.push({ method: req.method ?? "", target: scenario === PARTNER_COMPONENT_SCENARIO
      ? partnerSafeNetworkTarget(req.url ?? '',origin,new Set(assets.keys())) : safeNetworkUrl(req.url ?? ""), kind, status,
      responseSha256: hash(bytes), responseBytes: bytes.length, headers: finalHeaders });
    res.writeHead(status, { ...finalHeaders, "Content-Length": bytes.length });
    res.end(req.method === "HEAD" ? undefined : bytes);
  }
  const server = createServer((req, res) => {
    req.setTimeout(3000, () => req.destroy());
    try {
      const premiumCredentialHeader = scenario !== PUBLIC_SCENARIO
        && (Object.hasOwn(req.headers, "authorization") || Object.hasOwn(req.headers, "cookie"));
      if (req.headers.host !== new URL(origin).host || req.headers.authorization || req.headers.cookie || premiumCredentialHeader) {
        counters.credentialAttempts++;
        req.resume();
        return answer(req, res, "refused_credentials_or_host", 403, "", {});
      }
      const kind = classifyRequest(req.method, req.url, assets, scenario,queryOptions);
      if(kind.kind==='mc10_admission'){
        if(!admission||req.headers.origin!==origin||req.headers['content-type']!=='application/json'
          ||req.headers['sec-fetch-site']&&!['same-origin','none'].includes(String(req.headers['sec-fetch-site']))){
          counters.refused++;req.resume();return answer(req,res,'MC10_ADMISSION_REFUSED',403,'');
        }
        const requestGeneration=admission.snapshot().generation;
        let size=0,oversized=false;const chunks:Buffer[]=[];const abort=new AbortController();
        req.once('aborted',()=>abort.abort());res.once('close',()=>{if(!res.writableEnded)abort.abort();});
        req.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>4096){oversized=true;counters.refused++;abort.abort();req.destroy();}else chunks.push(chunk);});
        req.once('end',()=>{
          if(oversized||abort.signal.aborted)return;
          try{
            const pending=admission.record(Buffer.concat(chunks).toString('utf8'),abort.signal,requestGeneration);
            mc10Counters.admissionPOST!++;
            void pending.then(reply=>{const current=admission.current(requestGeneration);if(!res.destroyed)answer(req,res,'MC10_SYNTHETIC_ADMISSION_NOT_REAL_ASSENT',current?reply.status:409,JSON.stringify(current?reply.body:{admitted:false,policyRevision:MC10_POLICY_REVISION,retentionSeconds:7200}),{'Content-Type':'application/json; charset=utf-8','X-Robots-Tag':'noindex, nofollow'});})
              .catch(()=>{counters.unexpected++;if(!res.destroyed&&!res.headersSent)answer(req,res,'MC10_ADMISSION_FAILURE',503,'');});
          }catch{counters.refused++;if(!res.destroyed)answer(req,res,'MC10_ADMISSION_REFUSED',400,'');}
        });
        return;
      }
      if (kind.kind === "readonly_fixture" || kind.kind === "catalog_fixture") {
        req.resume();
        if (req.headers.origin && req.headers.origin !== origin
          || req.headers["sec-fetch-site"] && !["same-origin", "none"].includes(String(req.headers["sec-fetch-site"]))) {
          counters.refused++;
          return answer(req, res, "refused_readonly_origin", 403, "");
        }
        if (kind.kind === "catalog_fixture" && (!display || catalogQueries.length >= 40)) throw new Error("DISPLAY_QUERY_LIMIT");
        if(mc10&&kind.kind==='catalog_fixture'){
          try{admission!.catalog();}catch{mc10Counters.preAdmissionCatalog!++;counters.refused++;return answer(req,res,'MC10_PRE_ADMISSION_CATALOG_REFUSED',403,'');}
          if(!display||!('readPage' in display))throw new Error('MC10_CANONICAL_FACTORY_MISSING');
          const requestGeneration=admission!.snapshot().generation;
          void display.readPage(kind.query).then(body=>{
            if(!admission!.current(requestGeneration)||admission!.snapshot().phase!=='CONFIRMED'){counters.refused++;if(!res.destroyed)answer(req,res,'MC10_STALE_CATALOG_GENERATION',409,'');return;}
            catalogQueries.push({query:kind.query,responseSha256:hash(JSON.stringify(body)),total:body.total});
            counters.readOnlyGET[kind.path]++;
            answer(req,res,'MC10_SYNTHETIC_CANONICAL_PUBLIC_DTO',200,JSON.stringify(body),{'Content-Type':'application/json; charset=utf-8','X-Robots-Tag':'noindex, nofollow'});
          }).catch(()=>{counters.unexpected++;if(!res.destroyed&&!res.headersSent)answer(req,res,'MC10_CANONICAL_PROJECTION_REFUSED',503,'');});
          return;
        }
        const fixture = mc10&&kind.path===MC10_ADMISSION_PATH ? admission!.status() : kind.kind === "catalog_fixture"
          ? { status: 200, body: displayCatalogPage(kind.query, display!.items) }
          : fixtures[kind.path as keyof typeof fixtures];
        if (kind.kind === "catalog_fixture") catalogQueries.push({ query: kind.query,
          responseSha256: hash(JSON.stringify(fixture.body)), total: (fixture.body as { total: number }).total });
        counters.readOnlyGET[kind.path]++;
        return answer(req, res, display ? "SYNTHETIC_DISPLAY_FIXTURE_NOT_REAL_AUTH_ASSENT_CONTACT" : scenario === PARTNER_COMPONENT_SCENARIO
          ? 'DEV_ONLY_INERT_BOOTSTRAP_NOT_REAL_AUTH' : "STATIC_READONLY_UNAVAILABLE_FIXTURE", fixture.status, JSON.stringify(fixture.body), {
          "Content-Type": "application/json; charset=utf-8", "X-Robots-Tag": "noindex, nofollow",
        });
      }
      if (kind.kind === "resolve_fixture") {
        if (req.headers.origin !== origin || !String(req.headers["content-type"] ?? "").startsWith("application/json")) {
          counters.refused++;
          req.resume();
          return answer(req, res, "refused_resolve_origin", 403, "");
        }
        let size = 0;
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1024) { counters.refused++; req.destroy(); } else chunks.push(chunk);
        });
        req.on("end", () => {
          try {
            const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!input || Object.keys(input).length !== 1 || input.code !== "SAMPLE-CODE") throw new Error("synthetic only");
            counters.resolve404++;
            answer(req, res, "STATIC_404_UNAVAILABLE_FIXTURE", 404, JSON.stringify(UNAVAILABLE_FIXTURE), {
              "Content-Type": "application/json; charset=utf-8", "X-Robots-Tag": "noindex, nofollow",
            });
          } catch {
            counters.refused++;
            answer(req, res, "refused_resolve_input", 400, "");
          }
        });
        return;
      }
      req.resume();
      if (kind.kind === "partner_document") {
        // DEV component HTML fixture only, never production gallery admission.
        const document = buildRawHttpDocumentResponse({ requestTarget: req.url!, templateHtml: template });
        return answer(req, res, "DEV_ONLY_COMPONENT_DOCUMENT_NOT_PRODUCTION_ROUTE_PROOF", 200, document.html, { ...document.headers,
          "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" });
      }
      if (kind.kind === "document") {
        const document = buildRawHttpDocumentResponse({ requestTarget: req.url!, templateHtml: template,
          ...(req.url === WHOLESALE_ROUTE ? { indexable: false } : {}) });
        return answer(req, res, "document_policy", document.status, document.html, { ...document.headers });
      }
      if (kind.kind === "asset") {
        const bytes = bytesFor(kind.path);
        const extension = kind.path.split(".").at(-1)!;
        return answer(req, res, "inventoried_asset", 200, bytes, { "Content-Type": MIME[extension] ?? "application/octet-stream" });
      }
      counters.unexpected++;
      return answer(req, res, "off_contract_refused", 404, JSON.stringify({ ok: false, message: "Not available in this preview." }), {
        "Content-Type": "application/json; charset=utf-8",
      });
    } catch {
      counters.unexpected++;
      if (!res.headersSent) answer(req, res, "preview_integrity_failure", 500, ""); else res.destroy();
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxConnections = 24;
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("PREVIEW_LISTEN_INVALID"));
      origin = `http://127.0.0.1:${address.port}`;
      done();
    });
  });
  let closed = false;
  return {
    origin, counters, displayReceipt: display?.receipt ?? null, displayExpectations: display?.expectations ?? null,
    fixtureReceipts() { return Object.entries(fixtures).map(([path, fixture]) => ({ path, status: fixture.status,
      responseSha256: hash(JSON.stringify(fixture.body)), count: counters.readOnlyGET[path] })); },
    catalogQueryReceipts() { return catalogQueries.map((entry) => ({ ...entry })); },
    ...(admission?{mc10:Object.freeze({
      beginCase:(profile:string)=>{
        const generation=admission.begin(profile);
        const current=()=>{if(!admission.current(generation))throw new Error('MC10_CASE_HANDLE_RETIRED');};
        return Object.freeze({generation,
          snapshot:()=>{current();return admission.snapshot();},
          releaseAdmission(...args:unknown[]){if(args.length)throw new Error('MC10_ADMISSION_RELEASE_REFUSED');current();admission.release(generation);},
          expire(...args:unknown[]){if(args.length)throw new Error('MC10_EXPIRY_REFUSED');current();admission.expire(generation);},
          retireCase:()=>{current();admission.retire();},
          expectedPage:(page:number)=>{current();if(!display||!('readPage' in display)||![1,2].includes(page))throw new Error('MC10_EXPECTED_PAGE_REFUSED');return display.readPage({page,pageSize:24});},
          expectedSearch:(search='BPC-157')=>{current();if(!['BPC-157','MOTS-c'].includes(search)||!display||!('readPage' in display))throw new Error('MC10_EXPECTED_SEARCH_REFUSED');return display.readPage({search,page:1,pageSize:24});},
          selection:()=>{current();if(!display||!('selection' in display))throw new Error('MC10_SELECTION_REFUSED');return {...display.selection};},
        });
      },
      retireCase:()=>admission.retire(),snapshot:()=>admission.snapshot(),census:()=>admission.census(),

    })}:{}),
    async close() {
      if (closed) return;
      closed = true;
      admission?.retire();
      await new Promise<void>((done, reject) => {
        server.close((error) => error ? reject(error) : done());
        server.closeAllConnections();
      });
      if (server.listening) throw new Error("PREVIEW_CLEANUP_FAILED");
    },
  };
}
