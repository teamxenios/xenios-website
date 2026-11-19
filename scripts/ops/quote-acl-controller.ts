/** Export-only operator library. No CLI, env connection, provider adapter or
 * authority implementation. Root must supply independently verified one-shot
 * operator/provider/custody/closed-activation custody and a private journal.
 * No approval is inferred from a JSON project string, SQL identity or NOLOGIN.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { Client } from "pg";
import { assertBaseline, assertDelta, CHANGE_SQL, equalSnapshot, INVERSE_SQL, insist,
  validateApply, validateRollback, type Delta, type Snapshot } from "./quote-acl-snapshot";

export const CAPTURE_SQL = readFileSync(new URL("./quote-acl-capture.sql",import.meta.url),"utf8");
export const LOCK_SQL = "LOCK TABLE public.research_notification_outbox, quote_delivery_private.qd_events, quote_delivery_private.qd_replies, quote_delivery_private.qd_verified_receipts IN ACCESS EXCLUSIVE MODE";
export const IDENTITY_SQL = "SELECT session_user::pg_catalog.text AS session_user,current_user::pg_catalog.text AS current_user,pg_catalog.current_setting('role') AS role,pg_catalog.pg_my_temp_schema()::pg_catalog.text AS temp_schema,pg_catalog.current_setting('server_version_num') AS server_version,pg_catalog.transaction_timestamp()=pg_catalog.statement_timestamp() AS fresh_transaction";
export const SESSIONS_SQL = "SELECT pg_catalog.count(*) FILTER (WHERE usename='ea_quote_login')::pg_catalog.int4 AS login_sessions,pg_catalog.count(*) FILTER (WHERE usename='ea_quote_runtime')::pg_catalog.int4 AS runtime_sessions FROM pg_catalog.pg_stat_activity WHERE pid<>pg_catalog.pg_backend_pid() AND usename IN ('ea_quote_login','ea_quote_runtime')";
export const sha256 = (text: string): string => createHash("sha256").update(text,"utf8").digest("hex");
export const CODE_PINS = Object.freeze({ capture:sha256(CAPTURE_SQL),
  controller:sha256(readFileSync(new URL("./quote-acl-controller.ts",import.meta.url),"utf8")),
  comparator:sha256(readFileSync(new URL("./quote-acl-snapshot.ts",import.meta.url),"utf8")),
});
type Reply = { rows: Record<string,unknown>[] };
export interface QuoteAclConnection {
  query(text: string): Promise<Reply>;
  close(): Promise<void>;
  /** Synchronous socket destruction of THIS connection, not SQL cancellation
   * queued behind its active statement and never pg_terminate_backend. */
  destroy(): void;
}
/** Adapter for the pinned node-postgres connection; factory retains provider
 * pin/transport custody and must return a NEW connected administrative Client.
 * end() alone may wait on a socket; deadline destruction is synchronous. */
export function quoteAclPgConnection(client: Client): QuoteAclConnection {
  const socket=(client as unknown as {connection?:{stream?:{destroy():void}}}).connection?.stream;
  insist(socket && typeof socket.destroy==="function","Fresh owned transport must support synchronous destruction.");
  client.on("error",()=>undefined); // No raw connection diagnostics in public logs.
  return { query:async text => { const result=await client.query(text); return Array.isArray(result)?{rows:[]}:result; },
    close:async()=>{await client.end();},destroy:()=>{socket.destroy();} };
}
export type ArtifactPins = { preimage:string; delta:string; change:string; inverse:string };
export type AclRequest = {
  action:"apply"|"rollback"; executionId:string; sourceSha:string; expectedServerVersion:string;
  target:{projectId:string;serviceId:string}; wallMs:number;
  artifacts:{preimageJson:string;deltaJson:string;changeSql:string;inverseSql:string}; pins:ArtifactPins;
  recordedApply?: AclReceipt;
};
export type AclIntent = { action:AclRequest["action"];executionId:string;sourceSha:string;expectedServerVersion:string;
  target:AclRequest["target"];wallMs:number;pins:ArtifactPins;codePins:typeof CODE_PINS;recordedApplyRef:string|null;recordedApplyDigest:string|null };
export type Verification = {
  intentSha256:string;verificationReceipt:string;custodyReceipt:string;validUntilUnixMs:number;
  operator:"postgres";providerVerified:true;allActorCustody:true;activationClosed:true;runtimeAssumptionClosed:true;
  recordedApplyVerified?:true;
};
export type AclReceipt = {
  schemaVersion:1;
  executionId:string;action:AclRequest["action"];intent:AclIntent;
  outcome:"committed_verified"|"committed_unverified"|"rolled_back"|"uncertain"|"refused";
  commitSent:boolean;commitAcknowledged:boolean;postCommitVerified:boolean;replayAllowed:false;
  phase:string;error:string|null;sqlState:string|null;verificationReceipt:string|null;preparedJournal:string|null;journalRef:string|null;
  pre:Snapshot|null;post:Snapshot|null;restored:Snapshot|null;
};
export interface QuoteAclOperator {
  /** External trusted implementation must verify actual provider/service and
   * operator, adopted source/packet/code pins, closed activation, absence of
   * runtime assumers and all-actor provisioning custody for the entire window.
   * It MUST durably reserve executionId before returning and refuse reuse after
   * any outcome, across processes. Rollback additionally verifies the ACTUAL
   * recorded successful apply receipt in the private durable journal. There is
   * deliberately no in-memory/boolean/default authority adapter here. */
  authorizeAndReserve(intent:Readonly<AclIntent>,signal:AbortSignal):Promise<Verification>;
  openFreshConnection(intent:Readonly<AclIntent>,verification:Readonly<Verification>,signal:AbortSignal):Promise<QuoteAclConnection>;
  /** Durable PRIVATE evidence; snapshots must never go to public logs/repo.
   * Abort must stop external work; no human pause is allowed while locked. */
  journal(stage:"prepared"|"final",receipt:Readonly<AclReceipt>,signal:AbortSignal):Promise<string>;
}
function freeze<T>(value:T):T {
  if(value && typeof value==="object") { for(const v of Object.values(value)) freeze(v);Object.freeze(value); } return value;
}
function normalizedSql(text:string):string{return text.replace(/\r\n/g,"\n").trim();}
function load(request:AclRequest):{intent:AclIntent;pre:Snapshot;delta:Delta} {
  insist(request.action==="apply"||request.action==="rollback","Invalid action.");
  insist(/^[a-zA-Z0-9_-]{8,96}$/.test(request.executionId)&&/^[a-f0-9]{40}$/.test(request.sourceSha),"Pin execution/source identity.");
  insist(/^17[0-9]{4}$/.test(request.expectedServerVersion),"Only an explicitly reviewed PG17 version is supported.");
  insist(Number.isSafeInteger(request.wallMs)&&request.wallMs>=100&&request.wallMs<=60_000,"Wall deadline must be 100..60000ms.");
  insist(request.target.projectId.length>0&&request.target.serviceId.length>0,"External target pins required.");
  const pairs=[['preimage',request.artifacts.preimageJson],['delta',request.artifacts.deltaJson],['change',request.artifacts.changeSql],['inverse',request.artifacts.inverseSql]] as const;
  for(const [key,bytes] of pairs) insist(typeof bytes==="string"&&bytes.length<=512_000&&/^[a-f0-9]{64}$/.test(request.pins[key])&&sha256(bytes)===request.pins[key],"Artifact byte pin differs.");
  insist(normalizedSql(request.artifacts.changeSql)===normalizedSql(CHANGE_SQL)&&normalizedSql(request.artifacts.inverseSql)===normalizedSql(INVERSE_SQL),"Only the closed reviewed fragments are executable.");
  const pre=JSON.parse(request.artifacts.preimageJson).snapshot as Snapshot, delta=JSON.parse(request.artifacts.deltaJson) as Delta;
  assertBaseline(pre,delta);assertDelta(delta);
  insist(pre.serverVersion===request.expectedServerVersion,"Reviewed server version differs.");
  if(request.action==="rollback") {
    const r=request.recordedApply;
    insist(r&&r.schemaVersion===1&&r.action==="apply"&&r.outcome==="committed_verified"&&r.commitAcknowledged&&r.postCommitVerified&&r.journalRef&&r.pre&&r.post,"Trustworthy actual apply receipt required.");
    equalSnapshot(r.intent.target,request.target);equalSnapshot(r.intent.pins,request.pins);
    equalSnapshot(r.pre,pre);validateRollback(r.post,r.post,r.pre,delta);
  }
  return {pre,delta,intent:freeze({action:request.action,executionId:request.executionId,sourceSha:request.sourceSha,
    expectedServerVersion:request.expectedServerVersion,target:structuredClone(request.target),wallMs:request.wallMs,pins:structuredClone(request.pins),
    codePins:CODE_PINS,recordedApplyRef:request.recordedApply?.journalRef??null,
    recordedApplyDigest:request.recordedApply?sha256(JSON.stringify({...request.recordedApply,journalRef:null})):null})};
}

/** Exactly one attempt. Every error closes this transport; no retry, reconnect,
 * inverse-on-error or background continuation. A timeout races only after
 * wiring synchronous own-socket destruction, including a late-opening client.
 * The server's LOCAL timeouts are additional bounds, not the wall deadline.
 */
export async function runQuoteAclTransaction(raw:AclRequest,operator:QuoteAclOperator):Promise<AclReceipt> {
  const request=structuredClone(raw),{intent,pre:reviewedPre,delta}=load(request);
  const receipt:AclReceipt={schemaVersion:1,executionId:intent.executionId,action:intent.action,intent,outcome:"refused",commitSent:false,
    commitAcknowledged:false,postCommitVerified:false,replayAllowed:false,phase:"authorization",error:null,
    sqlState:null,verificationReceipt:null,preparedJournal:null,journalRef:null,pre:null,post:null,restored:null};
  let connection:QuoteAclConnection|null=null,started=false,closed=false,expired=false,finalJournalAttempted=false;
  const abort=new AbortController(),deadlineAt=performance.now()+intent.wallMs;
  let expire!:()=>void;
  const timeout=new Promise<never>((_ok,no)=>{expire=()=>{if(expired)return;expired=true;abort.abort();try{connection?.destroy();}catch{/* force-close failure remains uncertain */}no(new Error("Wall deadline reached."));};});
  // Keep a rejection handler attached even if authority throws synchronously.
  void timeout.catch(()=>undefined);
  const timer=setTimeout(expire,intent.wallMs);
  const live=()=>{if(expired||performance.now()>=deadlineAt){expire();throw new Error("Wall deadline reached.");}};
  const step=async<T>(work:Promise<T>):Promise<T>=>{live();const result=await Promise.race([work,timeout]);live();return result;};
  const query=async(text:string)=>{live();insist(connection,"Connection missing.");return step(connection.query(text));};
  const capture=async():Promise<Snapshot>=>{
    const result=await query(CAPTURE_SQL),snapshot=(result.rows[0]?.evidence as {snapshot?:Snapshot}|undefined)?.snapshot;
    insist(snapshot&&snapshot.serverVersion===intent.expectedServerVersion,"Capture/version mismatch.");return snapshot;
  };
  try {
    insist(operator&&typeof operator.authorizeAndReserve==="function"&&typeof operator.openFreshConnection==="function"&&typeof operator.journal==="function","External verified operator/custody/journal adapter required.");
    const verification=freeze(structuredClone(await step(operator.authorizeAndReserve(intent,abort.signal))));
    insist(verification.intentSha256===sha256(JSON.stringify(intent))&&verification.verificationReceipt&&verification.custodyReceipt
      &&verification.operator==="postgres"&&verification.providerVerified===true&&verification.allActorCustody===true
      &&verification.activationClosed===true&&verification.runtimeAssumptionClosed===true
      &&Number.isFinite(verification.validUntilUnixMs)&&verification.validUntilUnixMs>=Date.now()+intent.wallMs
      &&(intent.action!=="rollback"||verification.recordedApplyVerified===true),"External authority is absent, mismatched or too short-lived.");
    receipt.verificationReceipt=verification.verificationReceipt;receipt.phase="connect";
    const opening=operator.openFreshConnection(intent,verification,abort.signal).then(client=>{
      connection=client;
      if(expired||performance.now()>=deadlineAt){client.destroy();expire();throw new Error("Late connection refused.");}
      return client;
    });
    connection=await step(opening);
    receipt.phase="identity";
    // This dedicated connection is always destroyed. Keep catalog deparsing
    // and name resolution pinned AFTER COMMIT too, when SET LOCAL has expired.
    await query("SET search_path=pg_catalog");
    const identity=(await query(IDENTITY_SQL)).rows[0];
    insist(identity?.session_user==="postgres"&&identity.current_user==="postgres"&&identity.role==="none"&&identity.temp_schema==="0"&&identity.fresh_transaction===true&&identity.server_version===intent.expectedServerVersion,"Connection is not clean pinned postgres.");
    const sessions=(await query(SESSIONS_SQL)).rows[0];
    insist(sessions?.login_sessions===0&&sessions.runtime_sessions===0,"Old dedicated sessions remain; never terminate them here.");
    receipt.phase="begin";started=true;await query("BEGIN ISOLATION LEVEL READ COMMITTED");
    await query("SET LOCAL lock_timeout='5s'");await query("SET LOCAL statement_timeout='30s'");
    await query("SET LOCAL idle_in_transaction_session_timeout='15s'");await query("SET LOCAL search_path=pg_catalog");
    receipt.phase="locks";await query(LOCK_SQL);
    receipt.phase="locked_preimage";receipt.pre=await capture();
    if(intent.action==="apply") {equalSnapshot(receipt.pre,reviewedPre);assertBaseline(reviewedPre,delta);}
    else validateRollback(receipt.pre,request.recordedApply!.post!,request.recordedApply!.pre!,delta);
    receipt.phase="mutation";await query(intent.action==="apply"?request.artifacts.changeSql:request.artifacts.inverseSql);
    receipt.phase="comparison";
    if(intent.action==="apply") {receipt.post=await capture();validateApply(receipt.pre,reviewedPre,receipt.post,delta);}
    else {receipt.restored=await capture();equalSnapshot(receipt.restored,request.recordedApply!.pre);}
    receipt.phase="prepared_journal";
    receipt.preparedJournal=await step(operator.journal("prepared",freeze(structuredClone(receipt)),abort.signal));
    insist(receipt.preparedJournal,"Durable pre/post evidence must be acknowledged before COMMIT.");
    receipt.phase="commit";live();receipt.commitSent=true;await query("COMMIT");receipt.commitAcknowledged=true;started=false;
    receipt.phase="post_commit";
    const final=await capture();equalSnapshot(final,intent.action==="apply"?receipt.post:receipt.restored);
    receipt.postCommitVerified=true;
    receipt.phase="close";await step(connection.close());closed=true;
    receipt.outcome="committed_verified";receipt.phase="final_journal";
    finalJournalAttempted=true;
    // The durable body and returned receipt differ ONLY by its acknowledged
    // external journal reference, which is excluded from recordedApplyDigest.
    receipt.journalRef=await step(operator.journal("final",freeze({...structuredClone(receipt),phase:"complete"}),abort.signal));
    insist(receipt.journalRef,"Final commit evidence was not durably acknowledged.");receipt.phase="complete";
  } catch(error) {
    receipt.error=expired?"deadline":"operation_refused_or_failed";
    const sqlState=typeof error==="object"&&error!==null?String((error as {code?:unknown}).code??""):"";
    receipt.sqlState=/^[0-9A-Z]{5}$/.test(sqlState)?sqlState:null; // No raw SQL/provider diagnostic or payload.
    if(receipt.commitSent) receipt.outcome=receipt.commitAcknowledged?"committed_unverified":"uncertain";
    else if(started) {
      receipt.outcome="uncertain";
      if(!expired) try {await query("ROLLBACK");started=false;receipt.outcome="rolled_back";}catch{/* no retry */}
    }
    if(connection&&!closed&&!expired) try {await step(connection.close());closed=true;}catch{/* forced below */}
    if(!expired&&!finalJournalAttempted&&receipt.verificationReceipt) {
      finalJournalAttempted=true;
      try{receipt.journalRef=await step(operator.journal("final",freeze(structuredClone(receipt)),abort.signal));}catch{/* durable reservation still forbids replay */}
    }
  } finally {
    // Synchronous destruction happens before disarming the deadline, including
    // COMMIT uncertainty. Never return an active mutating connection to a pool.
    try{connection?.destroy();}catch{receipt.outcome=receipt.commitAcknowledged?"committed_unverified":"uncertain";receipt.error="own_transport_cleanup_failed";}
    finally{abort.abort();clearTimeout(timer);}
  }
  return freeze(receipt);
}
