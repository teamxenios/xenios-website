/** Pure server-only attestation codec. No environment reads, mounting, request
 * storage, publication authority, terminal context or cleanup is provided. */
import {createHmac,timingSafeEqual} from "node:crypto";
import {preparationInstant,REQUEST_INTENT_PREPARATION_PROTOCOL,type RequestIntentPreparedFacts} from "./service";

const CODEC="request-intent/fixture-witness/v1";
const PURPOSE="staging-fixture-attestation";
const RUNTIME="xenios-research-staging";
const ORIGIN="https://xenios-research-staging.onrender.com";
const SERVICE="srv-d9h4f4m7r5hc73ctjng0";
const PROJECT="srcphrgnxreqyirkitxd";
const KEY_DOMAIN="xenios:request-intent:stage-fixture-witness:key/v1\0";
const TOKEN_DOMAIN="xenios:request-intent:stage-fixture-witness:token/v1\0";
const HASH=/^[a-f0-9]{64}$/;
const SOURCE=/^[a-f0-9]{40}$/;
const REVISION=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE64URL=/^[A-Za-z0-9_-]+$/;
const MAX_TOKEN=8192;
const FACT_KEYS=["protocol","ownerHash","attemptHash","fingerprint","sessionBindingHash","snapshotSha256",
 "admissionKey","admissionPolicyRevision","issuedAt","expiresAt","admissionExpiresAt"];
const EXPECTED_KEYS=["ownerHash","attemptHash","fingerprint","sessionBindingHash","snapshotSha256",
 "admissionKey","admissionPolicyRevision","admissionExpiresAt","referralRevision"];

export class FixtureWitnessCodecError extends Error {
 readonly code="fixture_witness_invalid";
 constructor(){super("fixture_witness_invalid");this.name="FixtureWitnessCodecError";}
}
const invalid=():never=>{throw new FixtureWitnessCodecError();};
export type StageFixtureWitnessCodecConfiguration=Readonly<{
 secret:string;
 runtime:Readonly<{origin:string;serviceId:string;projectRef:string}>;
 sourceCommit:string;
 notAfter:string;
 /** Trusted injected clock for checking, never used to create issuedAt/expiry. */
 now():string;
}>;
export type ExpectedFixtureSubmission=Readonly<{
 ownerHash:string;attemptHash:string;fingerprint:string;sessionBindingHash:string;snapshotSha256:string;
 admissionKey:Readonly<{ownerBinding:string;policyRevision:string}>;
 admissionPolicyRevision:string;
 admissionExpiresAt:string;
 /** Explicit null for v3; exact current UUID for v4. Omission is not a match. */
 referralRevision:string|null;
}>;
export type VerifiedStageFixtureAttestation=Readonly<{
 kind:"verified_stage_fixture_attestation";
 sourceCommit:string;notAfter:string;facts:RequestIntentPreparedFacts;
}>;
export type StageFixtureWitnessCodec=Readonly<{
 issue(facts:RequestIntentPreparedFacts):Promise<string>;
 /** Private inspection attests integrity/time only, never permission to publish. */
 inspect(token:unknown):VerifiedStageFixtureAttestation;
 /** All current expected bindings come from trusted canonical server context. */
 verifySubmission(token:unknown,expected:ExpectedFixtureSubmission):VerifiedStageFixtureAttestation;
}>;

/** Read own data properties only. Never invoke accessors/toJSON or inherited claims. */
function record(raw:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return invalid();
 const prototype=Object.getPrototypeOf(raw);
 if(prototype!==Object.prototype&&prototype!==null)return invalid();
 const keys=Reflect.ownKeys(raw),out:Record<string,unknown>=Object.create(null);
 if(keys.length<required.length||keys.length>required.length+optional.length)return invalid();
 for(const key of keys){
  if(typeof key!=="string"||(!required.includes(key)&&!optional.includes(key)))return invalid();
  const descriptor=Object.getOwnPropertyDescriptor(raw,key);
  if(!descriptor||!("value" in descriptor))return invalid();
  out[key]=descriptor.value;
 }
 if(required.some(key=>!Object.prototype.hasOwnProperty.call(out,key)))return invalid();
 return out;
}
function hash(raw:unknown):string{if(typeof raw!=="string"||!HASH.test(raw))return invalid();return raw;}
function admission(raw:unknown){
 const row=record(raw,["ownerBinding","policyRevision"]);
 return Object.freeze({ownerBinding:hash(row.ownerBinding),policyRevision:hash(row.policyRevision)});
}
function revision(raw:unknown):string{if(typeof raw!=="string"||!REVISION.test(raw))return invalid();return raw;}
function textTime(raw:unknown):string{preparationInstant(raw);if(typeof raw!=="string")return invalid();return raw;}
function normalizeFacts(raw:unknown):RequestIntentPreparedFacts{
 const row=record(raw,FACT_KEYS,["referralRevision"]),key=admission(row.admissionKey);
 if(row.protocol!==REQUEST_INTENT_PREPARATION_PROTOCOL||hash(row.admissionPolicyRevision)!==key.policyRevision)return invalid();
 // Fixed insertion order is the one canonical wire serialization.
 return Object.freeze({protocol:REQUEST_INTENT_PREPARATION_PROTOCOL,
  ownerHash:hash(row.ownerHash),attemptHash:hash(row.attemptHash),fingerprint:hash(row.fingerprint),
  sessionBindingHash:hash(row.sessionBindingHash),snapshotSha256:hash(row.snapshotSha256),admissionKey:key,
  admissionPolicyRevision:key.policyRevision,
  ...(Object.prototype.hasOwnProperty.call(row,"referralRevision")?{referralRevision:revision(row.referralRevision)}:{}),
  issuedAt:textTime(row.issuedAt),expiresAt:textTime(row.expiresAt),admissionExpiresAt:textTime(row.admissionExpiresAt)});
}
function normalizeExpected(raw:unknown):ExpectedFixtureSubmission{
 const row=record(raw,EXPECTED_KEYS),key=admission(row.admissionKey);
 if(hash(row.admissionPolicyRevision)!==key.policyRevision)return invalid();
 return Object.freeze({ownerHash:hash(row.ownerHash),attemptHash:hash(row.attemptHash),fingerprint:hash(row.fingerprint),
  sessionBindingHash:hash(row.sessionBindingHash),snapshotSha256:hash(row.snapshotSha256),admissionKey:key,
  admissionPolicyRevision:key.policyRevision,admissionExpiresAt:textTime(row.admissionExpiresAt),
  referralRevision:row.referralRevision===null?null:revision(row.referralRevision)});
}

/** Missing/invalid/unpinned configuration returns unavailable. Configuration
 * is copied once; mutating a caller's object cannot renew its fixed bound. */
export function createStageFixtureWitnessCodec(configuration:unknown):StageFixtureWitnessCodec|null{
 try{
  const config=record(configuration,["secret","runtime","sourceCommit","notAfter","now"]);
  const runtime=record(config.runtime,["origin","serviceId","projectRef"]);
  if(runtime.origin!==ORIGIN||runtime.serviceId!==SERVICE||runtime.projectRef!==PROJECT
   ||typeof config.secret!=="string"||Buffer.byteLength(config.secret,"utf8")<32||Buffer.byteLength(config.secret,"utf8")>4096
   ||typeof config.sourceCommit!=="string"||!SOURCE.test(config.sourceCommit)||typeof config.now!=="function")return null;
  const sourceCommit=config.sourceCommit,notAfter=textTime(config.notAfter),bound=preparationInstant(notAfter);
  const now=config.now as ()=>unknown;
  const clock=()=>preparationInstant(now());
  if(clock()>=bound)return null;
  // Different purpose AND exact stage/source/deadline key context. No other
  // session/business cookie codec or generic prod-or-stage matcher is reused.
  const context=JSON.stringify([ORIGIN,SERVICE,PROJECT,sourceCommit,notAfter]);
  const key=createHmac("sha256",config.secret).update(KEY_DOMAIN+context,"utf8").digest();
  const signature=(encoded:string)=>createHmac("sha256",key).update(TOKEN_DOMAIN+encoded,"utf8").digest();
  const payload=(facts:RequestIntentPreparedFacts)=>({codec:CODEC,purpose:PURPOSE,runtime:RUNTIME,sourceCommit,notAfter,facts});
  function timeCheck(facts:RequestIntentPreparedFacts){
   const current=clock(),issued=preparationInstant(facts.issuedAt),expires=preparationInstant(facts.expiresAt);
   if(issued>=expires||issued>current||current>=expires||current>=bound
    ||expires>bound||expires>preparationInstant(facts.admissionExpiresAt))return invalid();
  }
  function inspect(raw:unknown):VerifiedStageFixtureAttestation{
   try{
    if(typeof raw!=="string"||raw.length<1||raw.length>MAX_TOKEN)return invalid();
    const parts=raw.split(".");
    if(parts.length!==3||parts[0]!=="fw1"||!BASE64URL.test(parts[1])||parts[2].length!==43||!BASE64URL.test(parts[2]))return invalid();
    const received=Buffer.from(parts[2],"base64url");
    if(received.length!==32||received.toString("base64url")!==parts[2])return invalid();
    const expected=signature(parts[1]);
    if(!timingSafeEqual(expected,received))return invalid();
    const bytes=Buffer.from(parts[1],"base64url");
    if(bytes.toString("base64url")!==parts[1])return invalid();
    const text=bytes.toString("utf8");
    if(!Buffer.from(text,"utf8").equals(bytes))return invalid();
    const envelope=record(JSON.parse(text),["codec","purpose","runtime","sourceCommit","notAfter","facts"]);
    if(envelope.codec!==CODEC||envelope.purpose!==PURPOSE||envelope.runtime!==RUNTIME
      ||envelope.sourceCommit!==sourceCommit||envelope.notAfter!==notAfter)return invalid();
    const facts=normalizeFacts(envelope.facts);
    if(JSON.stringify(payload(facts))!==text)return invalid();
    timeCheck(facts);
    return Object.freeze({kind:"verified_stage_fixture_attestation",sourceCommit,notAfter,facts});
   }catch{throw new FixtureWitnessCodecError();}
  }
  return Object.freeze({
   async issue(raw:RequestIntentPreparedFacts):Promise<string>{
    try{
     const facts=normalizeFacts(raw);timeCheck(facts);
     const encoded=Buffer.from(JSON.stringify(payload(facts)),"utf8").toString("base64url");
     const token="fw1."+encoded+"."+signature(encoded).toString("base64url");
     if(token.length>MAX_TOKEN)return invalid();
     return token;
    }catch{throw new FixtureWitnessCodecError();}
   },
   inspect,
   verifySubmission(token:unknown,rawExpected:ExpectedFixtureSubmission):VerifiedStageFixtureAttestation{
    try{
     const expected=normalizeExpected(rawExpected),verified=inspect(token),facts=verified.facts;
     if(facts.ownerHash!==expected.ownerHash||facts.attemptHash!==expected.attemptHash||facts.fingerprint!==expected.fingerprint
      ||facts.sessionBindingHash!==expected.sessionBindingHash||facts.snapshotSha256!==expected.snapshotSha256
      ||facts.admissionKey.ownerBinding!==expected.admissionKey.ownerBinding||facts.admissionKey.policyRevision!==expected.admissionKey.policyRevision
      ||facts.admissionPolicyRevision!==expected.admissionPolicyRevision||facts.admissionExpiresAt!==expected.admissionExpiresAt
      ||(facts.referralRevision??null)!==expected.referralRevision)return invalid();
     return verified;
    }catch{throw new FixtureWitnessCodecError();}
   },
  });
 }catch{return null;}
}
