/** Export-only one-shot unarmed installer. No CLI/env/credential/provider authority.
 * Preserve seven source bodies; actual custody and reviewed images mandatory. */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { Client, PoolClient } from "pg";
export const sha256=(value:string|Uint8Array)=>createHash("sha256").update(value).digest("hex");
function insist(value:unknown,code:string):asserts value {if(!value)throw Error(code);}
export const SOURCE_COMMIT="9e9be238040baec38a83ad72a8b9c10746b7aebd";
export const SOURCE_UNITS=[
  {
    "path": "supabase/candidates/request_intent_optional_context.sql",
    "bytes": 4562,
    "sha256": "e559c6f79daf8e8c41484fc4b9527904dcdc8a934a00ec1e0386939c39f36491",
    "begin": 177,
    "commit": 4554,
    "payloadSha256": "90d0d0c769f1a84795576a5fffefdca2919d6ac0fbac4192b5a9ff7b0e7e19a3"
  },
  {
    "path": "supabase/candidates/request_intent_policy_capture.sql",
    "bytes": 22364,
    "sha256": "64db21a50984d8979138f4336f474303579425e045b90b09e42de5ba9b443243",
    "begin": 236,
    "commit": 22356,
    "payloadSha256": "8fd65809b4e1b4ede63c00c5e56707136d716375c295603eadd615aad062c014"
  },
  {
    "path": "supabase/candidates/request_intent_referral_capture.sql",
    "bytes": 15870,
    "sha256": "7671df44ae86819f88be9fb8046791ec76cab0009e45994525a9c57d10968cfc",
    "begin": 236,
    "commit": 15862,
    "payloadSha256": "ff4f54fc92abdd24d1aef317d946f651b8a452d97948d903218cef20626af539"
  },
  {
    "path": "supabase/migrations/20261118172136_request_customer_notice_delivery_receipts.sql",
    "bytes": 8986,
    "sha256": "8931d8e738e691748bc3b81f5c59123a277d5156531cf6ba455cc77389c010a8",
    "begin": 0,
    "commit": 8978,
    "payloadSha256": "2ffb2120cb2e9d812fc2d645f924e0bf0786113bb53ca0dd3c69f70f0f73bf93"
  },
  {
    "path": "supabase/migrations/20261118194612_request_customer_notice_delivery_state.sql",
    "bytes": 3494,
    "sha256": "5af8ece2e1dc5f7d16a9a1e40ca107619d557d956be7b41ac2f3e81621e86b61",
    "begin": 0,
    "commit": 3486,
    "payloadSha256": "5f0b00eda4601c85f2667d53397be6e798faad5c42beb3b903fe2671a482a840"
  },
  {
    "path": "supabase/candidates/request_intent_staff_notice_retention_lock.sql",
    "bytes": 4852,
    "sha256": "a378be5b5162140f7d9e73774b5f05037edc2091fdd0f3a5e91487b820127d5e",
    "begin": 399,
    "commit": 4845,
    "payloadSha256": "63adb0ad751cbe205eb76ab78d9c0346479422ea871ca1ab1e877bdb8d10368e"
  },
  {
    "path": "supabase/candidates/request_intent_fixture_no_mail.sql",
    "bytes": 75224,
    "sha256": "359beac52aff6be61bf183d351870d9e96b5b81bf3074b96212182936ee83236",
    "begin": 243,
    "commit": 75216,
    "payloadSha256": "7f46231d4b4d4c48e16855ccfaf45434e3927f7b348ad1772883641292adff7c"
  }
] as const;
export const PRE_BODY_PINS={
  "request_intent_private.create_or_replay(text,text,text,jsonb)": "8af7c8fc530c6b0d0183ba6598f8aa22fff17d159c4b8835f91ba6fda4089bf1",
  "request_intent_private.enqueue_staff_notices(timestamptz,text[])": "c42abeb02f458b530d8b1fe7c718f3d76c6e502a5ae159aa6958c3eddb48c9ee",
  "request_intent_private.enqueue_staff_notices(timestamptz,text[],timestamptz)": "5a096e1085d2e5b6bbfd4c0170d79c9ca5b0903efc81bace79ba0f7f32edab2a",
  "request_intent_private.workflow_customer_notice(uuid,uuid)": "cfdede53ad497d3e27c5daa1d1d0513a3105293ac26d0ae172e917440694b915",
  "request_intent_private.deny_mutation()": "b48cf18e1a9a21b8f65c10a6f32daee2d22b5f8eb06c7a8a4e4c7622a2cd2052",
  "request_intent_private.enqueue_workflow_notice(uuid,uuid,text,bigint,text)": "1b9225d91f1081df0537ab0e6e0f441572c317e3a007e93c472e5359c5313a75",
  "request_intent_private.workflow_initialize()": "4207d60470c184128abaaed27f1a87a1ff18f5a327e2abc025fc340d170aad3d"
} as const;
export const POST_BODY_PINS={
  "request_intent_private.create_with_context(text,text,text,jsonb,jsonb)": "69a830fdb9234c3b7b153fdbca14f275b63c0ced7d3666d253cb198f45f2a246",
  "request_intent_private.staff_get_with_context(uuid,uuid)": "d8571220f53e0e4efe52acb65eea5ffcb73091cdcd4a1bfacc956928a3cc084d",
  "public.request_intent_create_with_context(text,text,text,jsonb,jsonb)": "4a50862ea2374ede60cf18d7cbb3f2866750abf9f8dc64003ad496a23f67a65e",
  "public.request_intent_staff_get_with_context(uuid,uuid)": "cae5e7ea9a64786d83050417cbb8bffdace82bc7287f9407a1656232da4126c4",
  "request_intent_private.valid_policy_agreement_pairs(jsonb)": "5c5081b2e31be4707d98a5270cd3dd2310142a42d5f5dc18867f739ed71c1c8e",
  "request_intent_private.policy_capture_setting_pin()": "1456da38965ca4207fd8d27dc23e6f7d209c2426c0f48b8cd59b62823dd9d359",
  "request_intent_private.policy_capture_publication_insert()": "55f8cf7ea265d48618add808daed624f507e473dc55427c6d23f266af7941dff",
  "request_intent_private.policy_capture_initialize_publication()": "38a5cd7df655a7f8a25bf18c81b97b72021fbb2d4245419d311e953347d5269b",
  "request_intent_private.publish_policy_capture_bundle(uuid,uuid,timestamptz,uuid)": "069572f85439bcc64db45c213fa0d0fd449a72c4159c7f0aafb87b6c767727dc",
  "request_intent_private.capture_request_policy(uuid)": "6320f11142fc0f1c54b15c26e211918cf68babde9f4d45c20948b63be9e197f8",
  "request_intent_private.workflow_initialize()": "2487ea8d78d0abee7a46f1690d940a018b14286ea9ea86bb35cf249649194eae",
  "request_intent_private.valid_reported_referral(jsonb)": "8ec442bdf0f459554c78ebfa5b0de9de8d694c2fddb7ca4c5d011fb7f9daad42",
  "request_intent_private.catalog_referral_status(text,text)": "583e5433e5bb8ae004c5d00dcb84e7978da4c86e1d000881713ace2edd97eea4",
  "request_intent_private.catalog_referral_put(text,text,text,text,jsonb,integer,jsonb)": "07738f02f242d342ca3c36aa9d174820a7215682fd9972f3cc5c5f5ba930398e",
  "request_intent_private.create_with_referral(text,text,text,jsonb,jsonb,jsonb)": "c0bdece4b965d389319fce6c59760e4fc3e767a3f7bfa528ac5fabc5ed984913",
  "request_intent_private.referral_staff_get(uuid,uuid,text)": "66239ce2e3350d873aab703c44ec03673c09c25c7efde94f699eceeb140b803d",
  "public.request_intent_catalog_referral_status(text,text)": "7f586764e0bcc965525da3351e5b3cda6b6714091fd4038477ad243e1e014879",
  "public.request_intent_catalog_referral_put(text,text,text,text,jsonb,integer,jsonb)": "70da264bb71f37487db799c93b0efbd72bfce2e267301bcb88a783ea7d6651aa",
  "public.request_intent_create_with_referral(text,text,text,jsonb,jsonb,jsonb)": "4dcccec2d5979a4cd367c663b9736cc599f24443173953f2c524de2efd52077c",
  "public.request_intent_referral_staff_get(uuid,uuid,text)": "d2f084589d3a02e73a820deb6014d60634c2dea433e3e3dfc095f30efefa2455",
  "request_intent_private.customer_notice_receipt_record(text,uuid,text,text)": "c545e459c33f8fd8d7e1ed38dfb4b636a9c91de518677d78d9cbd6f50e6aa4fe",
  "public.request_intent_customer_notice_receipt_record(text,uuid,text,text)": "918f76ff47a4f5d07af1cbe6522fd3ea4633cf30db44518ebb1b513f9eb89cca",
  "request_intent_private.customer_notice_receipt_evidence(uuid,uuid)": "937884155515d1e6f5d68d268313d4d9760cb698ef275c38b6a5d1a09feecb9c",
  "request_intent_private.purge_unmatched_customer_notice_receipts(timestamptz)": "d9886e882b451c119aa1980bde42a1143058937ed8ca9d40faf9c6183c5db2c5",
  "request_intent_private.workflow_customer_notice(uuid,uuid)": "91840e12fd0b17721921895385765d5994bc28f38503c2491cfad95d058bfb86",
  "request_intent_private.enqueue_staff_notices(timestamptz,text[])": "f6a46969c33331c01c19b42d4fba12443054cc2f94848ff7012f5fddbb9aa8ca",
  "request_intent_private.enqueue_staff_notices(timestamptz,text[],timestamptz)": "1b991c292f4f9e289a36c7ec8dbb362695b74055f2511498bd19d30f903be007",
  "request_intent_private.fixture_locks(text,text)": "9c7b92de33aadb8c2695c9181ad24b4584f0b47facd0697a55037974fd02d7e3",
  "request_intent_private.fixture_snapshot_digest(jsonb)": "b43a1aac37fb7daad9baf9765e8e7c6cc1a3118c49eaffb395b83e5ed2ea7836",
  "request_intent_private.fixture_admission(jsonb,uuid)": "793937d31ea4a300f07f767909453a42b0e83eeb541b51b195bbb76d5dfb1506",
  "request_intent_private.fixture_prepare_metadata(text,text,text,jsonb,jsonb,uuid,timestamptz)": "8a8430ba22896c488c56dd60f887bb4de5447725cf45102ecae499ac8232e3e4",
  "public.request_intent_fixture_prepare_metadata(text,text,text,jsonb,jsonb,uuid,timestamptz)": "2f760b5f3dc2740514fa637fb68a3f6aa8e9120f0c634d38dc0d4a5c2193f34f",
  "request_intent_private.fixture_no_mail_publish(uuid,text,text,text,text,text,text,timestamptz,timestamptz,jsonb,timestamptz,uuid)": "0c272141fb7600c1db9a401115a22c2b358f4d3759dd09b282fb99716111de2d",
  "request_intent_private.fixture_assert_submission(text,text,text,jsonb)": "ba3d4ccc26912eb7cb2da0c87040adf5fc2e0709c1da1334342d3e2f48ea2e4d",
  "request_intent_private.fixture_birth()": "95a52af4559f05885563c8dd9fae85aafb7c297b367dfef8b5942ab69acdd5ba",
  "request_intent_private.fixture_consume()": "593dfab5ee255091038429a2a38f20585e62abbd8c774527b8f5db139886cb22",
  "request_intent_private.fixture_control_pin()": "4c3f8058782db012201efcce389fff7499e607811798adf6d3dd71da86038baa",
  "request_intent_private.fixture_request_lineage(uuid)": "9887fa674409fc1b0bfb7d77ce60fe444d2eefbce05392d06d9e8f43897cd2b4",
  "request_intent_private.fixture_job_lineage(text,text,text,jsonb)": "4cfdd08eccadea7d2eb9613c3a17aed3a06807fc3dd0fe70e6c0851ecf5d3da4",
  "request_intent_private.fixture_workflow_lineage()": "685c8f267b37e4627d1f1279f56b05689dc68eaad76dfb874513126f79db417a",
  "request_intent_private.fixture_outbox_fence()": "3de949c9c130c73462e932517738e008edeb9ba66fda6622b9ddc9fcb645ca18",
  "request_intent_private.fixture_attempt_fence()": "9457b714f689972a200a4df5e4faa655cba408ac64e37e56c1cefdecce7f808d",
  "request_intent_private.fixture_quote_fence()": "58a7d87e45a8db322be900c42950591cc3806e9877d7ffdf0c74124a9f969863",
  "public.request_intent_fixture_mail_disposition(uuid)": "7bdac606b1ee1d51eac723e112b2884b61813f20d29f8f575bbe1090088665dc",
  "request_intent_private.fixture_has_send_evidence(uuid)": "3f3abcff1aac43607fe59539a6174662db8d8c87b4d1418e177472a856b40954",
  "request_intent_private.create_or_replay(text,text,text,jsonb)": "58b4296388dce802f401d2fdc92768f57a53c62b8cd30965eddcaf5cdb70a903",
  "request_intent_private.enqueue_workflow_notice(uuid,uuid,text,bigint,text)": "34db6b63b536810bb797907fd24694c1910bc9e4844ac680058ebb5f336f40e1",
  "public.request_intent_fixture_mail_guard_status()": "7d58ca4ba4a970d435d59af4d85d94dc41e16b0753d19c272f7d4d15277e894e"
} as const;

export const ADDED_COLUMNS:Readonly<Record<string,readonly string[]>>=Object.freeze({
  "request_intent_private.workflow_settings":["policy_capture_enabled","policy_capture_bundle_id","fixture_control_id","fixture_environment","fixture_owner_hash","fixture_attempt_hash","fixture_fingerprint","fixture_snapshot_sha256","fixture_approval_evidence_id","fixture_approval_sha256","fixture_prepared_at","fixture_authorized_until","fixture_admission_owner","fixture_admission_policy","fixture_admission_expires_at","fixture_referral_revision","fixture_request_id"],
  "request_intent_private.requests":["fixture_no_mail_control_id","fixture_no_mail_approval_sha256","fixture_no_mail_environment"],
  "public.research_notification_outbox":["mail_disposition","fixture_control_id","fixture_request_id"],
  "quote_delivery_private.qd_notification_intents":["mail_disposition","fixture_control_id","fixture_request_id"],
  "request_intent_private.workflow_staff_intents":["mail_disposition","fixture_control_id"],
  "request_intent_private.workflow_notice_intents":["mail_disposition","fixture_control_id"],
});
export const NEW_RELATIONS=Object.freeze(["catalog_referral_admission","optional_context","policy_bundles","policy_capture_publications","reported_referral_snapshots","request_policy_snapshots","workflow_notice_receipts"].map(n=>"request_intent_private."+n));
// Eight mutation/FK-parent relations and five additional read-conserved relations.
// All are acquired in global lexical order. SHARE preserves reads but fences DML.
export const LOCKS=Object.freeze([
  ["public.research_notification_attempts","ACCESS EXCLUSIVE"],
  ["public.research_notification_outbox","ACCESS EXCLUSIVE"],
  ["quote_delivery_private.qd_directory","SHARE"],
  ["quote_delivery_private.qd_notification_intents","ACCESS EXCLUSIVE"],
  ["quote_delivery_private.qd_quotes","SHARE"],
  ["request_intent_private.access_events","SHARE"],
  ["request_intent_private.catalog_contact_admission","ACCESS EXCLUSIVE"],
  ["request_intent_private.requests","ACCESS EXCLUSIVE"],
  ["request_intent_private.workflow","SHARE"],
  ["request_intent_private.workflow_events","SHARE"],
  ["request_intent_private.workflow_notice_intents","ACCESS EXCLUSIVE"],
  ["request_intent_private.workflow_settings","ACCESS EXCLUSIVE"],
  ["request_intent_private.workflow_staff_intents","ACCESS EXCLUSIVE"],
] as const);
export const CAPTURE_SQL=readFileSync(new URL("./request-intent-no-mail-capture.sql",import.meta.url),"utf8");
// No relation deparsing before NOWAIT locks: identity must not wait behind an
// existing table lock merely to discover that that lock is unavailable.
export const IDENTITY_SQL=`select jsonb_build_object('pid',pg_backend_pid(),
 'backendStart',to_char((select backend_start from pg_stat_activity where pid=pg_backend_pid()) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'sessionUser',session_user,'currentUser',current_user,'role',current_setting('role'),'version',current_setting('server_version_num')::integer,
 'superuser',(select rolsuper from pg_roles where rolname=current_user),'bypassRls',(select rolbypassrls from pg_roles where rolname=current_user),
 'transactionMs',(select setting::bigint from pg_settings where name='transaction_timeout'),
 'statementMs',(select setting::bigint from pg_settings where name='statement_timeout'),
 'idleMs',(select setting::bigint from pg_settings where name='idle_in_transaction_session_timeout'),
 'lockMs',(select setting::bigint from pg_settings where name='lock_timeout')) as identity`;
export function canonical(value:unknown):string {
  const text=JSON.stringify(value,(_k,v:unknown)=>v!==null&&typeof v==="object"&&!Array.isArray(v)
    ?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)):v);
  insist(typeof text==="string","canonical_shape");return text;
}
export const CODE_PINS=Object.freeze({capture:sha256(CAPTURE_SQL),controller:sha256(readFileSync(new URL("./request-intent-no-mail-install.ts",import.meta.url),"utf8")),
  lockfile:sha256(readFileSync(new URL("../../package-lock.json",import.meta.url),"utf8"))});
export function assembleSources(read:(path:string)=>Uint8Array=(p)=>readFileSync(p)) {
  return SOURCE_UNITS.map(u=>{
    const s=Buffer.from(read(u.path));insist(s.length===u.bytes&&sha256(s)===u.sha256,"source_pin");
    insist(s.subarray(u.begin,u.begin+6).toString()==="begin;"&&s.subarray(u.commit,u.commit+7).toString()==="commit;","envelope");
    const p=Buffer.concat([s.subarray(0,u.begin),s.subarray(u.begin+6,u.commit),s.subarray(u.commit+7)]);
    const inverse=Buffer.concat([p.subarray(0,u.begin),Buffer.from("begin;"),p.subarray(u.begin,u.commit-6),Buffer.from("commit;"),p.subarray(u.commit-6)]);
    insist(inverse.equals(s)&&sha256(p)===u.payloadSha256,"inverse_or_payload_pin");
    return Object.freeze({path:u.path,sha256:u.payloadSha256,sql:p.toString("utf8")});
  });
}
type Row=Record<string,unknown>;
export type Catalog={relations:Array<{name:string;present:boolean;owner:string|null;columns:Array<{name:string}>|null}>,routines:Array<{identity:string;bodySha256:string;owner:string}>,[key:string]:unknown};
export type Capture={identity:{pid:number;backendStart:string;sessionUser:string;currentUser:string;role:string;version:number;superuser:boolean;bypassRls:boolean;transactionMs:number;statementMs:number;idleMs:number;lockMs:number},catalog:Catalog};
export type QueryEvidence={rows:Row[];commands:string[];wire:"I"|"T"|"E";backendPid:number};
// Boolean-only row proof, shared by the locked writer and read-only observer.
// Catalog equality cannot establish publication/designation state.
export const UNARMED_SQL=`select count(*)::integer as n,bool_and(
 policy_capture_enabled is false and policy_capture_bundle_id is null
 and fixture_control_id is null and fixture_environment is null
 and fixture_owner_hash is null and fixture_attempt_hash is null
 and fixture_fingerprint is null and fixture_snapshot_sha256 is null
 and fixture_approval_evidence_id is null and fixture_approval_sha256 is null
 and fixture_prepared_at is null and fixture_authorized_until is null
 and fixture_admission_owner is null and fixture_admission_policy is null
 and fixture_admission_expires_at is null and fixture_referral_revision is null
 and fixture_request_id is null) as unarmed
 from request_intent_private.workflow_settings where singleton`;
export function isUnarmedEvidence(value:unknown):boolean {
  if(value===null||typeof value!=="object")return false;
  const q=value as Partial<QueryEvidence>;
  if(q.wire!=="T"||!Number.isInteger(q.backendPid)||Number(q.backendPid)<=0
    ||!Array.isArray(q.commands)||q.commands.length!==1||q.commands[0]!=="SELECT"
    ||!Array.isArray(q.rows)||q.rows.length!==1)return false;
  const row=q.rows[0];return row!==null&&typeof row==="object"&&!Array.isArray(row)
    &&Object.keys(row).sort().join(",")==="n,unarmed"&&row.n===1&&row.unarmed===true;
}
export interface NoMailConnection {query(sql:string):Promise<QueryEvidence>;destroy():void;close():Promise<void>}
/** Actual pg8.22 source updates this public API before resolving query results.
 * @types8.20 omits it: require the actual method, never infer from a version.
 * A private dedicated leased PoolClient is allowed only with destroy-on-release.
 * The factory must never supply a shared application pool/client. */
export function noMailPgConnection(client:Client|PoolClient,close:()=>Promise<void>=async()=>{
  if("release" in client)client.release(true);
  else await client.end();
}):NoMailConnection {
  type Native={getTransactionStatus?:()=>unknown;processID?:number;pipeline?:boolean;connectionParameters?:{query_timeout?:number};connection?:{stream?:{destroy():void}}};
  const native=client as unknown as Native;
  insist(typeof native.getTransactionStatus==="function"&&native.getTransactionStatus()==="I"&&Number.isInteger(native.processID),"native_wire_api");
  insist(!native.pipeline&&!native.connectionParameters?.query_timeout&&native.connection?.stream?.destroy,"dedicated_transport_required");
  const socket=native.connection.stream,initialPid=native.processID!;
  client.on("error",()=>undefined); // Query rejection remains observed; never emit raw diagnostics.
  return {destroy:()=>socket.destroy(),close,query:async(sql)=>{
    const raw:unknown=await client.query(sql);
    const results=(Array.isArray(raw)?raw:[raw]) as Array<{rows:Row[];command:string}>;
    const status=native.getTransactionStatus!();
    insist((status==="I"||status==="T"||status==="E")&&native.processID===initialPid,"wire_or_pid_changed");
    return {rows:results.length===1?results[0].rows:[],commands:results.map(r=>r.command),wire:status,backendPid:initialPid};
  }};
}
export type InstallRequest={executionId:string;implementationSource:string;target:{project:string;service:string};expectedVersion:170006|170011;wallMs:number;
  reviewedPreimage:Catalog;reviewedPostimage:Catalog;preimageSha256:string;postimageSha256:string};
export type InstallIntent=Omit<InstallRequest,"reviewedPreimage"|"reviewedPostimage">&{source:typeof SOURCE_COMMIT;codePins:typeof CODE_PINS;sourcePins:readonly string[]};
export type InstallReceipt={executionId:string;intentSha256:string|null;outcome:"unavailable"|"refused"|"rolled_back_verified"|"cleanup_unverified"|"commit_unknown"|"committed_verified_unarmed"|"committed_unjournaled";
  replayAllowed:false;phase:string;commitSent:boolean;commitAcknowledged:boolean;pid:number|null;backendStart:string|null;
  actualPreimageSha256:string|null;actualPostimageSha256:string|null;ordinaryBeforeSha256:string|null;ordinaryAfterSha256:string|null;unarmedVerified:boolean;
  preparedJournal:string|null;finalJournal:string|null;sqlState:string|null;observations:Array<{phase:string;pid:number;wire:string;commands:string[]}>};
export interface NoMailOperator {
  /** Existing trusted custody must durably reserve once across processes and
   * verify both independently REVIEWED images, exact source/code/provider pin,
   * actor/exclusive-DDL/closed-consumer/data-conservation scope and full expiry.
   * No implementation/default or production credential reader is supplied. */
  authorizeAndReserve(intent:Readonly<InstallIntent>,signal:AbortSignal):Promise<{intentSha256:string;evidenceId:string;validUntilUnixMs:number}>;
  /** New dedicated direct session; native startup caps BEFORE first query:
   * transaction40s,statement30s,lock5s,idle5s; client query_timeout MUST be0. */
  openFreshConnection(intent:Readonly<InstallIntent>,signal:AbortSignal):Promise<NoMailConnection>;
  journal(stage:"prepared"|"final",receipt:Readonly<InstallReceipt>,signal:AbortSignal):Promise<string>;
}
function assertBodies(catalog:Catalog,pins:Readonly<Record<string,string>>) {
  for(const [identity,body] of Object.entries(pins)) {
    const found=catalog.routines.filter(r=>r.identity===identity);
    insist(found.length===1&&found[0].owner==="postgres"&&found[0].bodySha256===body,"native_body_pin");
  }
}
function assertImage(actual:Catalog,expected:Catalog) {insist(canonical(actual)===canonical(expected),"catalog_image_diff");}
function assertPre(c:Catalog) {
  insist(c.relations.length===20&&Array.isArray(c.routines),"capture_shape");
  for(const r of c.relations) {
    insist(NEW_RELATIONS.includes(r.name)?!r.present:r.present&&r.owner==="postgres","relation_preimage");
    insist(!(r.columns??[]).some(a=>(ADDED_COLUMNS[r.name]??[]).includes(a.name)),"added_column_collision");
  }
  assertBodies(c,PRE_BODY_PINS);
  for(const identity of ["auth.uid()","request_intent_private.catalog_address_put(text,text,text,text,jsonb,integer)","request_intent_private.find_attempt(text,text)",
    "request_intent_private.only_keys(jsonb,text[])","request_intent_private.operator_get(uuid,uuid,boolean)","request_intent_private.receipt(request_intent_private.requests)",
    "request_intent_private.staff_get(uuid,uuid)","request_intent_private.valid_agreements(jsonb)","request_intent_private.valid_lines(jsonb)",
    "request_intent_private.workflow_backend()","request_intent_private.workflow_setting_pin()"])
    insist(c.routines.filter(r=>r.identity===identity).length===1,"canonical_delegate_missing");
  insist(Array.isArray(c.roles)&&c.roles.length<=256&&Array.isArray(c.eventHooks)&&c.eventHooks.length<=64,"catalog_authority_scope_bound");
  const prior=new Set(Object.keys(PRE_BODY_PINS));
  const changedNames=new Set(Object.keys(POST_BODY_PINS).map(identity=>identity.split("(")[0]));
  for(const routine of c.routines) if(changedNames.has(routine.identity.split("(")[0])) insist(prior.has(routine.identity),"new_routine_or_overload_collision");
  insist(Array.isArray(c.collisions)&&c.collisions.length===0,"new_name_collision");
}
export function conservationSQL(relation:string):string {
  insist(LOCKS.some(([r])=>r===relation),"conservation_scope");
  const omit=(ADDED_COLUMNS[relation]??[]).map(n=>"'"+n+"'").join(",");
  // Bounded DB-only digests; customer fields never leave the server. Separate
  // data-custody authorization is required even though only hashes are returned.
  return `select count(*)::integer as n,encode(sha256(convert_to(coalesce(string_agg(d,E'\\n' order by d),''),'UTF8')),'hex') as digest from (select encode(sha256(convert_to((to_jsonb(t)-array[${omit}]::text[])::text,'UTF8')),'hex') as d from ${relation} t limit 10001) bounded`;
}
const positiveCaps=(c:Capture["identity"])=>c.transactionMs>0&&c.transactionMs<=40000
  &&c.statementMs>0&&c.statementMs<=30000&&c.idleMs>0&&c.idleMs<=5000&&c.lockMs>0&&c.lockMs<=5000;
/** One mutation attempt. Nothing is retried or returned to a shared pool. */
export async function runNoMailInstall(raw:InstallRequest,operator?:NoMailOperator):Promise<InstallReceipt> {
  const r:InstallReceipt={executionId:raw.executionId,intentSha256:null,outcome:"unavailable",replayAllowed:false,phase:"unavailable",commitSent:false,commitAcknowledged:false,pid:null,backendStart:null,
    actualPreimageSha256:null,actualPostimageSha256:null,ordinaryBeforeSha256:null,ordinaryAfterSha256:null,unarmedVerified:false,preparedJournal:null,finalJournal:null,sqlState:null,observations:[]};
  if(!operator)return r;
  const request=structuredClone(raw),units=assembleSources();
  insist(/^[a-zA-Z0-9_-]{8,96}$/.test(request.executionId)&&/^[a-f0-9]{40}$/.test(request.implementationSource)&&Number.isInteger(request.wallMs)&&request.wallMs>=1000&&request.wallMs<=60000,"request_bounds");
  insist(request.expectedVersion===170006||request.expectedVersion===170011,"pg17_pin");
  insist(request.target.project!=="srcphrgnxreqyirkitxd"||request.expectedVersion===170011,"stage_version_pin");
  const preText=canonical(request.reviewedPreimage),postText=canonical(request.reviewedPostimage);
  insist(Buffer.byteLength(preText)<=2000000&&Buffer.byteLength(postText)<=2000000,"reviewed_images_bound");
  insist(sha256(preText)===request.preimageSha256&&sha256(postText)===request.postimageSha256,"reviewed_images_pin");
  const {reviewedPreimage:_,reviewedPostimage:__,...bound}=request;
  const intent:InstallIntent={...bound,source:SOURCE_COMMIT,codePins:CODE_PINS,sourcePins:SOURCE_UNITS.map(u=>u.sha256)};
  r.intentSha256=sha256(canonical(intent));
  let c:NoMailConnection|undefined,started=false,expired=false,unexpectedEnd=false;
  const abort=new AbortController(),deadline=performance.now()+request.wallMs;
  let expire!:()=>void;
  const timeout=new Promise<never>((_ok,no)=>{expire=()=>{if(expired)return;expired=true;abort.abort();try{c?.destroy();}catch{}no(Error("wall_deadline"));};});
  void timeout.catch(()=>undefined);
  const timer=setTimeout(()=>expire(),request.wallMs);
  const live=()=>{if(expired||performance.now()>=deadline){expire();throw Error("wall_deadline");}};
  const step=async<T>(promise:Promise<T>):Promise<T>=>{
    // Observe settlement BEFORE checking the wall; even a synchronous budget
    // refusal must not leave a started query/opening as an unhandled rejection.
    const observed=promise.then(value=>({ok:true as const,value}),error=>({ok:false as const,error}));
    live();const settled=await Promise.race([observed,timeout]);live();
    if(!settled.ok)throw settled.error;return settled.value;
  };
  const query=async(sql:string,wire:"I"|"T")=>{
    live();insist(c,"connection_missing");const q=await step(c.query(sql));
    if(started&&wire==="T"&&q.wire==="I")unexpectedEnd=true;
    insist(q.wire===wire&&(r.pid===null||q.backendPid===r.pid),"native_wire_phase");
    r.observations.push({phase:r.phase,pid:q.backendPid,wire:q.wire,commands:q.commands});return q;
  };
  const capture=async(wire:"I"|"T")=>{
    const data=(await query(CAPTURE_SQL,wire)).rows[0]?.evidence as Capture;
    insist(data,"capture_missing");verifyIdentity(data.identity);return data;
  };
  const verifyIdentity=(identity:Capture["identity"])=>{
    insist(identity&&identity.version===request.expectedVersion&&identity.sessionUser==="postgres"&&identity.currentUser==="postgres"&&identity.role==="none"
      &&identity.superuser===false&&identity.bypassRls===true&&positiveCaps(identity),"actual_actor_or_caps");
    insist(r.pid===null||identity.pid===r.pid,"native_backend_changed");r.pid=identity.pid;r.backendStart=identity.backendStart;
  };
  const conserved=async()=>{
    const values:Record<string,unknown>={};
    for(const [name] of LOCKS) {const row=(await query(conservationSQL(name),"T")).rows[0];insist(row&&Number(row.n)<=10000,"conservation_bound");values[name]=row;}
    return canonical(values);
  };
  try {
    r.phase="authorization";r.outcome="refused";
    const v=await step(operator.authorizeAndReserve(Object.freeze(structuredClone(intent)),abort.signal));
    insist(v.intentSha256===sha256(canonical(intent))&&v.evidenceId&&v.validUntilUnixMs>=Date.now()+request.wallMs,"custody_unavailable");
    r.phase="connect";
    const opening=operator.openFreshConnection(intent,abort.signal).then(client=>{c=client;if(expired||performance.now()>=deadline){client.destroy();throw Error("late_connection");}return client;});
    c=await step(opening);r.phase="identity";
    await query("SET search_path=pg_catalog;SET TimeZone='UTC';SET DateStyle='ISO,YMD'","I");
    verifyIdentity((await query(IDENTITY_SQL,"I")).rows[0]?.identity as Capture["identity"]);
    const remaining=Math.min(40000,Math.floor(deadline-performance.now()-1000));insist(remaining>0,"native_budget");
    await query(`SET transaction_timeout='${remaining}ms'`,"I");
    r.phase="begin";started=true;await query("BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE","T");
    r.phase="locks";
    for(const [name,mode] of LOCKS) await query(`LOCK TABLE ${name} IN ${mode} MODE NOWAIT`,"T");
    r.phase="locked_preimage";const before=(await capture("T")).catalog;assertImage(before,request.reviewedPreimage);assertPre(before);r.actualPreimageSha256=sha256(canonical(before));
    const ordinary=await conserved();r.ordinaryBeforeSha256=sha256(ordinary);
    for(const [i,unit] of units.entries()) {
      r.phase="unit_"+(i+1);insist(sha256(unit.sql)===unit.sha256,"payload_changed");
      const q=await query(unit.sql,"T");insist(!q.commands.some(tag=>["BEGIN","COMMIT","ROLLBACK","PREPARE TRANSACTION"].includes(tag)),"unexpected_transaction_tag");
      await capture("T");
    }
    r.phase="postimage";const after=(await capture("T")).catalog;
    assertImage(after,request.reviewedPostimage);assertBodies(after,POST_BODY_PINS);insist(after.relations.every(t=>t.present&&t.owner==="postgres"),"post_relation_owner");r.actualPostimageSha256=sha256(canonical(after));
    const ordinaryAfter=await conserved();r.ordinaryAfterSha256=sha256(ordinaryAfter);insist(ordinaryAfter===ordinary,"ordinary_conservation");
    for(const name of NEW_RELATIONS)insist((await query(`select exists(select 1 from ${name} limit 1) as any_row`,"T")).rows[0]?.any_row===false,"new_table_not_empty");
    insist(isUnarmedEvidence(await query(UNARMED_SQL,"T")),"designation_or_publication_not_closed");r.unarmedVerified=true;
    const guard=(await query("select public.request_intent_fixture_mail_guard_status() as guard","T")).rows[0]?.guard as Row;
    insist(guard?.protocol==="request-intent/fixture-no-mail/v1"&&guard.ready===true,"fixed_guard_not_ready");
    r.phase="prepared_journal";r.preparedJournal=await step(operator.journal("prepared",structuredClone(r),abort.signal));insist(r.preparedJournal,"durable_precommit_evidence");
    r.phase="commit";live();r.commitSent=true;
    const committed=await query("COMMIT","I");insist(committed.commands.length===1&&committed.commands[0]==="COMMIT","commit_ack");
    r.commitAcknowledged=true;started=false;r.outcome="committed_verified_unarmed";
    r.phase="final_journal";r.finalJournal=await step(operator.journal("final",structuredClone(r),abort.signal));insist(r.finalJournal,"durable_final_evidence");
    r.phase="complete";
  } catch(error) {
    const state=String((error as {code?:unknown})?.code??"");r.sqlState=/^[0-9A-Z]{5}$/.test(state)?state:null;
    if(r.commitSent)r.outcome=r.commitAcknowledged?"committed_unjournaled":"commit_unknown";
    else if(started) {
      r.outcome="cleanup_unverified";
      if(!expired&&!unexpectedEnd)try{r.phase="rollback";const q=await query("ROLLBACK","I");insist(q.commands.length===1&&q.commands[0]==="ROLLBACK","rollback_ack");r.outcome="rolled_back_verified";}catch{}
    }
  } finally {
    try{c?.destroy();}catch{r.outcome=r.commitAcknowledged?"committed_unjournaled":r.commitSent?"commit_unknown":"cleanup_unverified";}
    abort.abort();clearTimeout(timer);
    // Do not await end() without a bound or claim socket destruction is rollback.
  }
  return r;
}

/** Explicit read-only reconciliation; never releases reservation or retries DDL.
 * Caller supplies an independently authorized fresh, native-bounded connection.
 * Exact catalog pre/postimage is observed only after original backend is gone.
 * Ordinary row hashes are deliberately NOT compared after live locks release.
 * An unarmed result additionally needs the final same-transaction Boolean row
 * observation. It is observation-only, never authority or replay clearance. */
export interface NoMailReadOnlyObserver {
  /** Must verify ACTUAL durable reservation/journal, original intent and
   * provider/project/actor/connection scope; no authority adapter is supplied.
   * Startup caps precede first query. Never clears or reuses the reservation. */
  openForRecordedIntent(request:Readonly<InstallRequest>,receipt:Readonly<InstallReceipt>,signal:AbortSignal):Promise<NoMailConnection>;
}
export async function reconcileNoMailInstall(request:InstallRequest,receipt:InstallReceipt,observer?:NoMailReadOnlyObserver):Promise<"preimage_observed"|"postimage_unarmed_observed"|"unresolved"> {
  if(!observer)return "unresolved";
  const abort=new AbortController();let connection:NoMailConnection|undefined,expired=false;
  let expire!:()=>void;
  const timeout=new Promise<never>((_yes,no)=>{expire=()=>{expired=true;abort.abort();try{connection?.destroy();}catch{}no(Error("observer_deadline"));};});void timeout.catch(()=>undefined);
  const timer=setTimeout(()=>expire(),6000);
  const step=async<T>(work:Promise<T>)=>Promise.race([work,timeout]);
  const query=(sql:string)=>{insist(!expired&&connection,"observer_not_live");return step(connection.query(sql));};
  try {
    insist(sha256(canonical(request.reviewedPreimage))===request.preimageSha256&&sha256(canonical(request.reviewedPostimage))===request.postimageSha256,"recorded_images_pin");
    insist(receipt.pid!==null&&Number.isInteger(receipt.pid)&&receipt.pid>0&&receipt.backendStart!==null&&/^\d{4}-\d\d-\d\dT[0-9:.]+Z$/.test(receipt.backendStart),"original_backend_binding");
    connection=await step(observer.openForRecordedIntent(structuredClone(request),structuredClone(receipt),abort.signal).then(c=>{connection=c;if(expired){c.destroy();throw Error("late_observer");}return c;}));
    // Set before BEGIN: changing an already-active PG17 transaction timer may
    // not shorten its existing expiry. This next transaction starts with5s.
    insist((await query("SET transaction_timeout='5s'")).wire==="I","observer_clean");
    const begun=await query("BEGIN READ ONLY;SET LOCAL statement_timeout='5s';SET LOCAL idle_in_transaction_session_timeout='3s';SET LOCAL search_path=pg_catalog");
    insist(begun.wire==="T","readonly_wire");
    const old=await query(`select exists(select 1 from pg_stat_activity where pid=${receipt.pid} and backend_start='${receipt.backendStart}'::timestamptz) as alive`);
    if(old.rows[0]?.alive!==false)return "unresolved";
    const seen=(await query(CAPTURE_SQL)).rows[0]?.evidence as Capture;
    insist(seen.identity.version===request.expectedVersion&&seen.identity.sessionUser==="postgres"&&seen.identity.currentUser==="postgres"&&!seen.identity.superuser&&seen.identity.bypassRls,"observer_actor");
    let result:"preimage_observed"|"postimage_unarmed_observed"|"unresolved"="unresolved";
    if(canonical(seen.catalog)===canonical(request.reviewedPreimage))result="preimage_observed";
    else if(canonical(seen.catalog)===canonical(request.reviewedPostimage)) {
      const unarmed=await query(UNARMED_SQL);
      if(unarmed.backendPid===seen.identity.pid&&isUnarmedEvidence(unarmed))result="postimage_unarmed_observed";
    }
    const ended=await query("ROLLBACK");insist(ended.wire==="I"&&ended.commands[0]==="ROLLBACK","readonly_end");return result;
  }catch{return "unresolved";}finally{abort.abort();clearTimeout(timer);try{connection?.destroy();}catch{}}
}
