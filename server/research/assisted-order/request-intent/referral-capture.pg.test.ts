/** Real owned PostgreSQL16 only. All subjects/policies/contacts are synthetic;
 * no provider, managed URL, installed policy or production action is accepted. */
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {expect} from "vitest";
import {createDurableJourneyFixture,pg16It,submission,guest,OPERATOR,OTHER_ACTOR} from "./durable-journey.pg.fixture";
import {sha256AssistedOrderHasher as hasher} from "../defaults";
import {makeCatalogAdmission} from "./catalog-admission";
import {privateContactAdmissionRpc} from "./contact-admission-rpc";
import {requestIntentRepository,requestIntentStaffReader,type RequestIntentRpcClient} from "./rpc-repository";
import {RequestIntentService,requestIntentOwner} from "./service";
import type {RequestIntentCatalogItem,RequestIntentInput} from "../../../../shared/research/assisted-order/request-intent";
import type {ReferralChoice} from "../../../../shared/research/assisted-order/optional-intake";
const S="request_intent_private",ENV="referral-fixture";
type Db=ReturnType<typeof createDurableJourneyFixture>;
const candidate="supabase/candidates/request_intent_referral_capture.sql";
const legal={requiredAgreements:async()=>[{kind:"fixture-terms",version:"fixture-v1"}]};
const contact={fullLegalName:"Synthetic Customer",email:"synthetic@example.invalid",postalAddress:{line1:"1 Fixture St",city:"Fixture",countryCode:"HK" as const}};
async function boot(db:Db,active=true){
 await db.start({managedCareSchema:true});
 for(const path of ["supabase/research-notification-outbox.sql","supabase/candidates/request_intent_optional_context.sql",
  "server/research/assisted-order/request-intent/private-contact.candidate.sql","supabase/migrations/20261114133643_early_access_postal_admission.sql",
  "supabase/migrations/20261114133500_early_access_pending_request_reader.sql","supabase/migrations/20261118024134_request_intent_workflow.sql",
  "supabase/migrations/20261118033449_early_access_request_customer_notices.sql","supabase/candidates/request_intent_policy_capture.sql",candidate])
  await db.sql(readFileSync(path,"utf8"));
 // Reapply is part of this candidate's real owned-schema qualification.
 await db.sql(readFileSync(candidate,"utf8"));
 if(active){
  const bundle=randomUUID();
  await db.sql(`insert into ${S}.policy_bundles(id,environment,retention_policy_id,retention_policy_version,retention_record_reference,retention_document_sha256,
   recipient_policy_id,recipient_policy_version,recipient_record_reference,recipient_document_sha256,approval_record_reference,approval_received_at,
   required_agreements,notice_agreement_kind,notice_agreement_version,notice_document_sha256)
   values($1,$2,'FIXTURE-RETENTION','v1','fixture:retention:1',$3,'FIXTURE-RECIPIENTS','v1','fixture:recipients:1',$4,
    'fixture:approval:1',clock_timestamp()-interval '1 second',$5::jsonb,'fixture-terms','fixture-v1',$6)`,
   [bundle,ENV,"a".repeat(64),"b".repeat(64),JSON.stringify(await legal.requiredAgreements()),"c".repeat(64)]);
  await db.sql(`update ${S}.workflow_settings set environment=$1,start_at=clock_timestamp(),retention_policy_version='fixture:retention:1',
   recipient_policy_version='fixture:recipients:1',policy_capture_bundle_id=$2,policy_capture_enabled=true,enabled=true`,[ENV,bundle]);
 }
}
function rpc(db:Db,loseReply=false):RequestIntentRpcClient{
 const fields:Record<string,[string[],string[]]>={
  request_intent_catalog_referral_status:[["p_owner_binding","p_policy_revision"],["text","text"]],
  request_intent_catalog_referral_put:[["p_owner_binding","p_policy_revision","p_full_legal_name","p_email","p_postal_address","p_ttl_seconds","p_referral"],["text","text","text","text","jsonb","integer","jsonb"]],
  request_intent_find_attempt:[["p_owner_hash","p_attempt_hash"],["text","text"]],
  request_intent_create_with_referral:[["p_owner_hash","p_attempt_hash","p_fingerprint","p_detail","p_context","p_admission"],["text","text","text","jsonb","jsonb","jsonb"]],
  request_intent_referral_staff_get:[["p_request_id","p_actor_user_id","p_scope"],["uuid","uuid","text"]],
 };
 return {async rpc(name,args){
  const entry=fields[name];if(!entry)throw Error("Unsupported fixture RPC");
  const [keys,types]=entry;
  try{
   const result=await db.asRole("service_role",`select public.${name}(${types.map((type,i)=>`$${i+1}::${type}`).join(",")}) as value`,
    keys.map((key,i)=>types[i]==="jsonb"&&args[key]!==null?JSON.stringify(args[key]):args[key]));
   if(loseReply&&name==="request_intent_create_with_referral"){loseReply=false;throw Error("Synthetic lost committed reply");}
   return {data:result.rows[0].value,error:null};
  }catch(error){if(error instanceof Error && error.message==="Synthetic lost committed reply")throw error;
   const e=error as {code?:string;message?:string};return {data:null,error:{code:e.code,message:e.message}};}
 }};
}
const item:RequestIntentCatalogItem={productId:"product-var-1",variantId:"pc-var-1",productName:"Synthetic product",family:"research_peptides_materials",
 channel:"fixture",specification:"Synthetic variant",format:null,packBasis:null,minimumQuantity:1,maximumQuantity:100,quantityIncrement:1,unitPriceCents:null,currency:"USD",
 workflowMode:"request_pricing",actionLabel:"Add to quote cart",accessNotice:null,researchUseOnly:true,catalogVersion:"fixture-referral",priceVersion:null,
 sourceSelection:{family:"research_peptides_materials",slug:"synthetic",variantId:"var-1"},selectableForReview:true,intentExclusion:null,clinicalReviewRequired:false,
 sourceDisplayState:"request_access",sourceVariantDisplayState:"request_access",sourceRefusal:null};
function setup(db:Db,loseReply=false){
 const client=rpc(db,loseReply),custody=privateContactAdmissionRpc(client,7200,true),admission=makeCatalogAdmission(legal,hasher,custody,7200,true);
 const service=new RequestIntentService({contactAdmission:admission,optionalIntakeEnabled:true,repository:requestIntentRepository(client),legal,hasher,
  standing:{accepted:async()=>true},catalog:{list:async()=>({items:[item],total:1,page:1,pageSize:24,families:[item.family],channels:[],workflowModes:[]}),
   resolveMany:async(_viewer,lines)=>lines.map(line=>line.productId===item.productId&&line.variantId===item.variantId?item:null)},
  ids:{uuid:()=>randomUUID(),publicReference:()=>"unused",opaqueToken:()=>"unused"},clock:{now:()=>new Date()}});
 return {client,custody,admission,service};
}
function input(choice:ReferralChoice,id=randomUUID()):RequestIntentInput{
 return {...submission(),idempotencyKey:id,lines:[{productId:item.productId,variantId:item.variantId,quantity:2}],optionalIntake:{goal:"ask_about_process",referralChoice:choice}};
}
async function admit(db:Db,name?:string){
 const f=setup(db),status=await f.service.admissionStatus(guest);
 const standing=await f.service.recordAdmission(guest,{...contact,policyRevision:status.policyRevision,...(name?{referralName:name}:{})});
 expect(standing.admitted).toBe(true);expect(standing.referralRevision).toMatch(/^[0-9a-f-]{36}$/);
 return {...f,standing,key:await f.admission.key(requestIntentOwner(guest,hasher),guest.earlyAccessSessionHash)};
}
async function counts(db:Db){return (await db.sql(`select (select count(*)::int from ${S}.requests) as requests,
 (select count(*)::int from ${S}.reported_referral_snapshots) as referrals,(select count(*)::int from ${S}.optional_context) as context,
 (select count(*)::int from ${S}.access_events) as audit,(select count(*)::int from ${S}.request_policy_snapshots) as policies,
 (select count(*)::int from public.research_notification_outbox) as outbox`)).rows[0];}

pg16It("referral admission is optional, private, first-write atomic, conflict-safe and purges with contact",async()=>{
 const db=createDurableJourneyFixture();try{
  await boot(db);const {custody,admission,key,standing}=await admit(db,"Élodie O’Neill-Smith");
  expect(await custody.saveFirst(key,{...contact,referralName:"Élodie O’Neill-Smith"})).toBe("already_same");
  expect((await admission.status(requestIntentOwner(guest,hasher),guest.earlyAccessSessionHash)).referralRevision).toBe(standing.referralRevision);
  expect(await custody.saveFirst(key,{...contact,referralName:"Different Person"})).toBe("different_contact");
  expect(await counts(db)).toEqual({requests:0,referrals:0,context:0,audit:0,policies:0,outbox:0});
  const otherKey={...key,ownerBinding:"f".repeat(64)};
  const race=await Promise.all([custody.saveFirst(otherKey,{...contact,referralName:"One Person"}),custody.saveFirst(otherKey,{...contact,referralName:"Another Person"})]);
  expect(race.sort()).toEqual(["committed","different_contact"]);
  expect(await custody.referralStatus!({...key,ownerBinding:"e".repeat(64)})).toEqual({admitted:false});
  for(const role of ["anon","authenticated"] as const){
   await expect(db.asRole(role,`select * from ${S}.catalog_referral_admission`)).rejects.toMatchObject({code:"42501"});
   await expect(db.asRole(role,"select public.request_intent_catalog_referral_status($1,$2)",[key.ownerBinding,key.policyRevision])).rejects.toMatchObject({code:"42501"});
  }
  await db.sql(`update ${S}.catalog_contact_admission set expires_at=clock_timestamp()-interval '1 second'`);
  expect(await custody.referralStatus!(key)).toEqual({admitted:false});
  await db.sql(`select ${S}.purge_expired_contact_admissions(100)`);
  expect((await db.sql(`select count(*)::int as n from ${S}.catalog_referral_admission`)).rows[0].n).toBe(0);
 }finally{await db.close();}
},180_000);

pg16It("winning requests snapshot explicit use/replace/omit under real policy; lost reply replays after expiry and erasure",async()=>{
 const db=createDurableJourneyFixture();try{
  await boot(db);const {standing,key,client}=await admit(db,"Saved Person");
  const lost=setup(db,true),command=input({mode:"use_saved",admissionRevision:standing.referralRevision!});
  await expect(lost.service.submit(guest,command)).rejects.toThrow("lost committed reply");
  const saved=await lost.service.submit(guest,command);
  expect((await db.sql(`select mode,referral_name,referral_code from ${S}.reported_referral_snapshots where request_id=$1`,[saved.requestId])).rows)
   .toEqual([{mode:"use_saved",referral_name:"Saved Person",referral_code:null}]);
  await setup(db).service.submit(guest,input({mode:"replace",referralName:"Unknown Sam",referralCode:"REPORTED"}));
  await setup(db).service.submit(guest,input({mode:"omit"}));
  expect(await counts(db)).toMatchObject({requests:3,referrals:3,context:3,audit:3,policies:3,outbox:3});
  const before=await counts(db);
  await db.sql(`delete from ${S}.reported_referral_snapshots where request_id=$1`,[saved.requestId]);
  await db.sql(`delete from ${S}.optional_context where request_id=$1`,[saved.requestId]);
  await db.sql(`delete from ${S}.catalog_contact_admission where owner_binding=$1 and policy_revision=$2`,[key.ownerBinding,key.policyRevision]);
  expect(await lost.service.submit(guest,command)).toEqual(saved);
  expect(await counts(db)).toEqual({...before,referrals:2,context:2});
  await expect(lost.service.submit(guest,{...command,optionalIntake:{referralChoice:{mode:"omit"}}})).rejects.toMatchObject({code:"attempt_conflict"});
  expect(await requestIntentRepository(client).findAttempt(requestIntentOwner(guest,hasher),hasher.hash(command.idempotencyKey))).toMatchObject({receipt:saved});
 }finally{await db.close();}
},180_000);

pg16It("stale admission instances and snapshot failure roll back request, policy, audit and outbox together",async()=>{
 const db=createDurableJourneyFixture();try{
  await boot(db);const {standing,key,client,service}=await admit(db,"Saved Person");
  const original=input({mode:"use_saved",admissionRevision:standing.referralRevision!});
  await db.sql(`delete from ${S}.catalog_contact_admission where owner_binding=$1 and policy_revision=$2`,[key.ownerBinding,key.policyRevision]);
  const newer=await admit(db,"New Person");expect(newer.standing.referralRevision).not.toBe(standing.referralRevision);
  const before=await counts(db);
  await expect(service.submit(guest,original)).rejects.toMatchObject({code:"referral_information_expired"});
  expect(await counts(db)).toEqual(before);
  await db.sql(`create function ${S}.fixture_referral_fail() returns trigger language plpgsql as $$begin raise exception 'synthetic snapshot boundary';end;$$;
    create trigger fixture_referral_fail before insert on ${S}.reported_referral_snapshots for each row execute function ${S}.fixture_referral_fail()`);
  await expect(setup(db).service.submit(guest,input({mode:"replace",referralName:"Sam"}))).rejects.toMatchObject({code:"request_intent_persistence_uncertain"});
  expect(await counts(db)).toEqual(before);
  await db.sql(`drop trigger fixture_referral_fail on ${S}.reported_referral_snapshots`);
  const command=input({mode:"use_saved",admissionRevision:newer.standing.referralRevision!});
  const results=await Promise.all([setup(db).service.submit(guest,command),setup(db).service.submit(guest,command)]);
  expect(results[0]).toEqual(results[1]);expect(await counts(db)).toMatchObject({requests:1,referrals:1,outbox:1});
  await db.sql(`delete from ${S}.catalog_referral_admission where owner_binding=$1 and policy_revision=$2`,[key.ownerBinding,key.policyRevision]);
  expect(await newer.custody.saveFirst(key,{...contact,referralName:"New Person"})).toBe("different_contact");
  expect(await newer.custody.referralStatus!(key)).toEqual({admitted:false});
  expect(client).toBeDefined();
 }finally{await db.close();}
},180_000);

pg16It("reported names never grant access; current staff read authorization precedes the permitted projection",async()=>{
 const db=createDurableJourneyFixture();try{
  await boot(db);const {service,client}=await admit(db,"Unknown Sam");
  const saved=await service.submit(guest,input({mode:"replace",referralName:"Unknown Sam"}));
  const reader=requestIntentStaffReader(client,true,true);
  await expect(reader.get(saved.requestId,OTHER_ACTOR,"operator")).rejects.toMatchObject({code:"request_intent_persistence_uncertain"});
  expect((await db.sql(`select count(*)::int as n from public.care_role_assignments`)).rows[0].n).toBe(0);
  await db.sql("insert into public.care_role_assignments(user_id,role,granted_by) values($1,'request_intent_reader',$1)",[OPERATOR]);
  expect((await reader.get(saved.requestId,OPERATOR,"operator"))?.optionalIntake).toEqual({goal:"ask_about_process",referralName:"Unknown Sam"});
  expect((await db.sql(`select event_type from ${S}.access_events where request_id=$1 order by id`,[saved.requestId])).rows)
   .toEqual([{event_type:"submitted"},{event_type:"staff_read"}]);
  await db.sql("update public.care_role_assignments set revoked_at=clock_timestamp() where user_id=$1",[OPERATOR]);
  await expect(reader.get(saved.requestId,OPERATOR,"operator")).rejects.toMatchObject({code:"request_intent_persistence_uncertain"});
  await expect(db.asRole("authenticated","select public.request_intent_referral_staff_get($1,$2,'operator')",[saved.requestId,OTHER_ACTOR],OTHER_ACTOR))
   .rejects.toMatchObject({code:"42501"});
 }finally{await db.close();}
},180_000);

pg16It("default-off policy capture refuses new referral snapshots without changing existing legacy request storage",async()=>{
 const db=createDurableJourneyFixture();try{
  await boot(db,false);const {service}=await admit(db);
  await expect(service.submit(guest,input({mode:"omit"}))).rejects.toMatchObject({code:"request_intent_persistence_uncertain"});
  expect(await counts(db)).toEqual({requests:0,referrals:0,context:0,audit:0,policies:0,outbox:0});
  const legacy=await requestIntentRepository(db.adapter().client).createOrReplay({ownerHash:"a".repeat(64),attemptHash:"b".repeat(64),fingerprint:"c".repeat(64),
   detail:{kind:"unapproved_selection_request",requestId:randomUUID(),publicReference:"ignored",status:"pending_review",createdAt:new Date().toISOString(),
    contact:{...submission().contact,billingAddress:submission().contact.shippingAddress},agreements:submission().agreements,
    lines:[{productId:item.productId,variantId:item.variantId,sourceVariantId:"var-1",productName:item.productName,specification:item.specification,family:item.family,
     workflowMode:item.workflowMode,quantity:1,researchUseOnly:true,clinicalReviewRequired:false,sourceDisplayState:"request_access",sourceVariantDisplayState:"request_access",
     sourceRefusal:null,catalogVersion:"fixture-referral",reviewState:"pending"}]}});
  expect(legacy.receipt.status).toBe("pending_review");expect(await counts(db)).toMatchObject({requests:1,referrals:0,policies:0});
 }finally{await db.close();}
},180_000);
