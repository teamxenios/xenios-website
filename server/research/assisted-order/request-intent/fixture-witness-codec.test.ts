import {createHmac} from "node:crypto";
import {describe,expect,it} from "vitest";
import {REQUEST_INTENT_PREPARATION_PROTOCOL,type RequestIntentPreparedFacts} from "./service";
import {createStageFixtureWitnessCodec,FixtureWitnessCodecError,
 type ExpectedFixtureSubmission,type StageFixtureWitnessCodecConfiguration} from "./fixture-witness-codec";

// Explicit synthetic source/key/time, never runtime environment or credentials.
function setup(){
 let current="2026-11-19T15:00:00.123456Z";
 const configuration:StageFixtureWitnessCodecConfiguration={secret:"synthetic-fixture-key-never-a-real-secret-0123456789",
  runtime:{origin:"https://xenios-research-staging.onrender.com",serviceId:"srv-d9h4f4m7r5hc73ctjng0",projectRef:"srcphrgnxreqyirkitxd"},
  sourceCommit:"a".repeat(40),notAfter:"2026-11-19T16:00:00.999999Z",now:()=>current};
 const codec=createStageFixtureWitnessCodec(configuration);
 expect(codec).not.toBeNull();
 return {configuration,codec:codec!,clock:(value:string)=>{current=value;}};
}
function facts():RequestIntentPreparedFacts{return {
 protocol:REQUEST_INTENT_PREPARATION_PROTOCOL,ownerHash:"a".repeat(64),attemptHash:"b".repeat(64),fingerprint:"c".repeat(64),
 sessionBindingHash:"d".repeat(64),snapshotSha256:"e".repeat(64),admissionKey:{ownerBinding:"f".repeat(64),policyRevision:"a".repeat(64)},
 admissionPolicyRevision:"a".repeat(64),issuedAt:"2026-11-19T15:00:00.123455Z",expiresAt:"2026-11-19T15:00:01.123456Z",
 admissionExpiresAt:"2026-11-19T16:00:00.999999Z",
};}
function expected(value=facts()):ExpectedFixtureSubmission{return {
 ownerHash:value.ownerHash,attemptHash:value.attemptHash,fingerprint:value.fingerprint,sessionBindingHash:value.sessionBindingHash,
 snapshotSha256:value.snapshotSha256,admissionKey:{...value.admissionKey},admissionPolicyRevision:value.admissionPolicyRevision,
 admissionExpiresAt:value.admissionExpiresAt,referralRevision:value.referralRevision??null,
};}
function envelope(token:string){return JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString("utf8"));}
/** Real HMAC over an intentionally adverse payload, using only a synthetic key.
 * This proves canonical/schema rejection even when the signature is valid. */
function signed(text:string|Buffer,config:StageFixtureWitnessCodecConfiguration,domain="xenios:request-intent:stage-fixture-witness:token/v1\0"){
 const context=JSON.stringify([config.runtime.origin,config.runtime.serviceId,config.runtime.projectRef,config.sourceCommit,config.notAfter]);
 const key=createHmac("sha256",config.secret).update("xenios:request-intent:stage-fixture-witness:key/v1\0"+context,"utf8").digest();
 const payload=(typeof text==="string"?Buffer.from(text,"utf8"):Buffer.from(text)).toString("base64url");
 return "fw1."+payload+"."+createHmac("sha256",key).update(domain+payload,"utf8").digest("base64url");
}

describe("pure exact-stage fixture witness codec",()=>{
 it("attests the existing closed facts deterministically with raw microseconds and no publication capability",async()=>{
  const f=setup(),input=facts(),before=JSON.stringify(input);
  const token=await f.codec.issue(input);
  expect(token).toMatch(/^[A-Za-z0-9._~-]{1,8192}$/);
  expect(await f.codec.issue(input)).toBe(token);
  expect(JSON.stringify(input)).toBe(before);
  const inspected=f.codec.inspect(token);
  expect(inspected).toEqual({kind:"verified_stage_fixture_attestation",sourceCommit:f.configuration.sourceCommit,notAfter:f.configuration.notAfter,facts:input});
  expect(f.codec.verifySubmission(token,expected())).toEqual(inspected);
  expect(Object.isFrozen(inspected)&&Object.isFrozen(inspected.facts)&&Object.isFrozen(inspected.facts.admissionKey)).toBe(true);
  expect(Object.keys(f.codec)).toEqual(["issue","inspect","verifySubmission"]);
  expect(Object.keys(inspected).sort()).toEqual(["facts","kind","notAfter","sourceCommit"]);
  const payload=Buffer.from(token.split(".")[1],"base64url").toString("utf8");
  expect(payload).not.toMatch(/https?:|@|email|fullLegalName|cookie|synthetic-fixture-key|password/);
  const another=createStageFixtureWitnessCodec(f.configuration)!;
  expect(another.inspect(token)).toEqual(inspected);
 });
 it.each([undefined,null,{},[],{secret:""}])("has no default availability %#",config=>{
  expect(createStageFixtureWitnessCodec(config)).toBeNull();
 });
 it.each(["origin","service","project","source","bound","key","clock","unknown"])("refuses invalid or non-stage %s configuration",field=>{
  const f=setup(),config={...f.configuration,runtime:{...f.configuration.runtime}};
  if(field==="origin")config.runtime.origin="https://xeniostechnology.com";
  if(field==="service")config.runtime.serviceId="foreign-service";
  if(field==="project")config.runtime.projectRef="yvzeduaxbwgcwllhywff";
  if(field==="source")config.sourceCommit="A".repeat(40);
  if(field==="bound")config.notAfter="2026-11-19T15:00:00.123456Z";
  if(field==="key")config.secret="short";
  if(field==="clock")config.now=()=>"infinity";
  expect(createStageFixtureWitnessCodec(field==="unknown"?{...config,publish:true}:config)).toBeNull();
 });
 it("rejects oversized keys/accessor config without evaluating it or generating a replacement",()=>{
  const f=setup();expect(createStageFixtureWitnessCodec({...f.configuration,secret:"x".repeat(4097)})).toBeNull();
  let reads=0;
  const config=Object.defineProperty({...f.configuration},"secret",{get(){reads++;return "x".repeat(64);}});
  expect(createStageFixtureWitnessCodec(config)).toBeNull();expect(reads).toBe(0);
  expect(createStageFixtureWitnessCodec({...f.configuration,now:()=>{throw Error("synthetic unavailable clock");}})).toBeNull();
 });
 it("does not let caller config mutation renew an existing codec or alter its copied source",async()=>{
  const f=setup(),token=await f.codec.issue(facts());
  const config=f.configuration as {sourceCommit:string;notAfter:string};
  config.sourceCommit="b".repeat(40);config.notAfter="2026-11-20T16:00:00.999999Z";
  expect(f.codec.inspect(token).sourceCommit).toBe("a".repeat(40));
  expect(f.codec.inspect(token).notAfter).toBe("2026-11-19T16:00:00.999999Z");
  expect(()=>createStageFixtureWitnessCodec(f.configuration)!.inspect(token)).toThrow(FixtureWitnessCodecError);
 });
 it.each(["key","source","deadline"])("does not accept a token under a different trusted %s",async change=>{
  const f=setup(),token=await f.codec.issue(facts());
  const config={...f.configuration};
  if(change==="key")config.secret="different-synthetic-fixture-key-0123456789";
  if(change==="source")config.sourceCommit="b".repeat(40);
  if(change==="deadline")config.notAfter="2026-11-19T16:00:01.000000Z";
  const other=createStageFixtureWitnessCodec(config)!;
  expect(other).not.toBeNull();expect(()=>other.inspect(token)).toThrow("fixture_witness_invalid");
 });
 it("rejects truncated, tampered and noncanonical encodings with generic redacted errors",async()=>{
  const f=setup(),token=await f.codec.issue(facts()),parts=token.split(".");
  for(const value of [undefined,null,"",token.slice(0,-1),token+".",token+"=","fw1."+parts[1]+".A",
   "fw2."+parts[1]+"."+parts[2],"fw1."+parts[1]+"."+(parts[2][0]==="A"?"B":"A")+parts[2].slice(1),"x".repeat(8193)]){
   expect(()=>f.codec.inspect(value)).toThrow("fixture_witness_invalid");
  }
  const invalidUtf8=signed(Buffer.from([0xff,0xfe]),f.configuration);
  expect(()=>f.codec.inspect(invalidUtf8)).toThrow("fixture_witness_invalid");
 });
 it.each(["whitespace","order","duplicate","extra","purpose","runtime","source","deadline","facts-order","facts-extra","facts-protocol"])("rejects correctly signed but invalid %s payload",async change=>{
  const f=setup(),token=await f.codec.issue(facts()),body=envelope(token);
  let text:string;
  if(change==="whitespace")text=JSON.stringify(body,null,2);
  else if(change==="order")text=JSON.stringify(Object.fromEntries(Object.entries(body).reverse()));
  else if(change==="duplicate")text=JSON.stringify(body).replace('{"codec":','{"codec":"request-intent/fixture-witness/v1","codec":');
  else {
   if(change==="extra")body.contact="unexpected";
   if(change==="purpose")body.purpose="another-purpose";
   if(change==="runtime")body.runtime="production";
   if(change==="source")body.sourceCommit="b".repeat(40);
   if(change==="deadline")body.notAfter="2026-11-20T16:00:00.999999Z";
   if(change==="facts-order")body.facts=Object.fromEntries(Object.entries(body.facts).reverse());
   if(change==="facts-extra")body.facts.noMail=true;
   if(change==="facts-protocol")body.facts.protocol="unrelated";
   text=JSON.stringify(body);
  }
  expect(()=>f.codec.inspect(signed(text,f.configuration))).toThrow("fixture_witness_invalid");
 });
 it("does not accept a MAC from another purpose domain",async()=>{
  const f=setup(),token=await f.codec.issue(facts());
  const text=Buffer.from(token.split(".")[1],"base64url").toString("utf8");
  expect(()=>f.codec.inspect(signed(text,f.configuration,"business-inquiry-attempt/v1\0"))).toThrow("fixture_witness_invalid");
 });
 it.each([
  {ownerHash:"A".repeat(64)},{attemptHash:7},{fingerprint:"forged"},{sessionBindingHash:null},{snapshotSha256:"x".repeat(64)},
  {issuedAt:"infinity"},{issuedAt:"2026-02-30T15:00:00Z"},{expiresAt:"2026-11-19T15:00:00.123455Z"},
  {referralRevision:"not-a-revision"},{referralRevision:undefined},{email:"raw@example.invalid"},
  {admissionKey:{ownerBinding:"f".repeat(64),policyRevision:"b".repeat(64)}},
 ])("refuses malformed facts without rewriting them %#",async change=>{
  const f=setup(),value={...facts(),...change};
  await expect(f.codec.issue(value as RequestIntentPreparedFacts)).rejects.toMatchObject({code:"fixture_witness_invalid",message:"fixture_witness_invalid"});
 });
 it("does not invoke accessor fields or accept inherited facts/expected values",async()=>{
  const f=setup();let reads=0;
  const raw=Object.defineProperty({...facts()},"ownerHash",{get(){reads++;return "a".repeat(64);}});
  await expect(f.codec.issue(raw)).rejects.toThrow("fixture_witness_invalid");expect(reads).toBe(0);
  await expect(f.codec.issue(Object.create(facts()))).rejects.toThrow("fixture_witness_invalid");
  const token=await f.codec.issue(facts());
  const wanted=Object.defineProperty({...expected()},"ownerHash",{get(){reads++;return "a".repeat(64);}});
  expect(()=>f.codec.verifySubmission(token,wanted)).toThrow("fixture_witness_invalid");expect(reads).toBe(0);
  expect(()=>f.codec.verifySubmission(token,{...expected(),publish:true} as ExpectedFixtureSubmission)).toThrow("fixture_witness_invalid");
 });
 it.each(["owner","attempt","fingerprint","session","snapshot","admission-owner","admission-policy","admission-expiry","revision"])("requires the exact trusted current %s binding",async change=>{
  const f=setup(),token=await f.codec.issue(facts()),wanted=expected();
  let different:ExpectedFixtureSubmission={...wanted};
  if(change==="owner")different={...wanted,ownerHash:"b".repeat(64)};
  if(change==="attempt")different={...wanted,attemptHash:"c".repeat(64)};
  if(change==="fingerprint")different={...wanted,fingerprint:"d".repeat(64)};
  if(change==="session")different={...wanted,sessionBindingHash:"e".repeat(64)};
  if(change==="snapshot")different={...wanted,snapshotSha256:"f".repeat(64)};
  if(change==="admission-owner")different={...wanted,admissionKey:{...wanted.admissionKey,ownerBinding:"a".repeat(64)}};
  if(change==="admission-policy")different={...wanted,admissionPolicyRevision:"b".repeat(64),admissionKey:{...wanted.admissionKey,policyRevision:"b".repeat(64)}};
  if(change==="admission-expiry")different={...wanted,admissionExpiresAt:"2026-11-19T16:00:01.000000Z"};
  if(change==="revision")different={...wanted,referralRevision:"10000000-0000-4000-8000-000000000001"};
  expect(()=>f.codec.verifySubmission(token,different)).toThrow("fixture_witness_invalid");
 });
 it("requires explicit null/UUID revision and admits only a matching v4 instance",async()=>{
  const f=setup(),value={...facts(),referralRevision:"10000000-0000-4000-8000-000000000001"};
  const token=await f.codec.issue(value);
  expect(f.codec.verifySubmission(token,expected(value)).facts.referralRevision).toBe(value.referralRevision);
  expect(()=>f.codec.verifySubmission(token,expected())).toThrow("fixture_witness_invalid");
  const missing=Object.fromEntries(Object.entries(expected(value)).filter(([key])=>key!=="referralRevision"));
  expect(()=>f.codec.verifySubmission(token,missing as ExpectedFixtureSubmission)).toThrow("fixture_witness_invalid");
 });
 it("preserves the exact microsecond expiry without rounding, refresh or implicit renewal",async()=>{
  const f=setup(),token=await f.codec.issue(facts());
  f.clock("2026-11-19T15:00:01.123455Z");expect(f.codec.inspect(token).facts.expiresAt).toBe(facts().expiresAt);
  f.clock("2026-11-19T15:00:01.123456Z");expect(()=>f.codec.inspect(token)).toThrow("fixture_witness_invalid");
  await expect(f.codec.issue(facts())).rejects.toThrow("fixture_witness_invalid");
  f.clock("2026-11-19T15:00:00.123454Z");expect(()=>f.codec.inspect(token)).toThrow("fixture_witness_invalid");
 });
 it("rejects even one microsecond beyond fixed notAfter or actual admission expiry",async()=>{
  const f=setup(),config={...f.configuration,notAfter:"2026-11-19T15:00:01.123455Z"};
  const limited=createStageFixtureWitnessCodec(config)!;
  await expect(limited.issue(facts())).rejects.toThrow("fixture_witness_invalid");
  await expect(f.codec.issue({...facts(),admissionExpiresAt:"2026-11-19T15:00:01.123455Z"})).rejects.toThrow("fixture_witness_invalid");
  const bound={...facts(),expiresAt:f.configuration.notAfter};
  const token=await f.codec.issue(bound);f.clock(f.configuration.notAfter);
  expect(()=>f.codec.inspect(token)).toThrow("fixture_witness_invalid");
 });
});
