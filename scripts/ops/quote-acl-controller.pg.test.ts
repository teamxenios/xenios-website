/** AUTHORED owned-PG17 qualification. No external URL or production snapshot.
 * The exact controller/capture/comparator operate on a freshly created empty
 * synthetic baseline. Provider/custody verification is an explicit test double,
 * not a managed authorization. Both dedicated roles stay NOLOGIN throughout.
 */
import { execFileSync,spawn } from "node:child_process";
import { createHmac,randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { expect,it } from "vitest";
import { CAPTURE_SQL } from "./quote-acl-controller";
import { IDENTITY_SQL,LOCK_SQL,quoteAclPgConnection,runQuoteAclTransaction,sha256,
  type AclReceipt,type AclRequest,type QuoteAclConnection,type QuoteAclOperator } from "./quote-acl-controller";
import { CHANGE_SQL,EXACT_DELTA,INVERSE_SQL,equalSnapshot,expectedPostimage,type Snapshot } from "./quote-acl-snapshot";
import { createResendReceipts,type SignedQuoteReceipt } from "../../server/research/assisted-order/quote/delivery/signed-receipts.mjs";

const pgIt=process.env.CI||process.env.XENIOS_RUN_PG17_QUOTE_ACL==="1"?it:it.skip;
const docker=(...args:string[])=>execFileSync("docker",args,{encoding:"utf8",windowsHide:true,timeout:30_000,stdio:["ignore","pipe","pipe"]}).trim();
function ready(name:string):Promise<void> {
  // Event-driven readiness, no mutation retries/polling loop. Ignore the image's
  // temporary init server; require the subsequent final readiness message.
  return new Promise((ok,no)=>{
    const follower=spawn("docker",["logs","--follow",name],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
    let buffer="",done=false;
    const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);follower.kill();error?no(error):ok();};
    const timer=setTimeout(()=>finish(Error("Owned PG17 startup deadline.")),20_000);
    const ingest=(chunk:Buffer)=>{
      buffer+=chunk.toString("utf8");if(buffer.length>128_000){finish(Error("Owned startup log bound."));return;}
      const lines=buffer.split("\n");buffer=lines.pop()??"";
      for(const line of lines) if(/\[1\].*database system is ready to accept connections/.test(line))finish();
    };
    follower.stdout.on("data",ingest);follower.stderr.on("data",ingest);
    follower.once("error",()=>finish(Error("Owned PG17 log observer failed.")));
    follower.once("exit",()=>{if(!done)finish(Error("Owned PG17 stopped before readiness."));});
  });
}
async function ownedPg17() {
  const owner=randomUUID(),name="xenios-quote-acl-"+owner,password=randomUUID();let attempted=false;
  const connections=new Set<pg.Client>();
  const cleanup=async()=>{
    for(const client of connections){try{quoteAclPgConnection(client).destroy();}catch{/* force-remove the owned server below */}}
    connections.clear();
    if(attempted){
      if(!/^xenios-quote-acl-[0-9a-f-]{36}$/.test(name))throw Error("Owned container identity lost.");
      let actualOwner:string;
      try{actualOwner=docker("inspect","--format",'{{index .Config.Labels "xenios.quote-acl-owned"}}',name);}
      catch(error){if(String(error).includes("No such object")||String(error).includes("No such container")){attempted=false;return;}throw error;}
      if(actualOwner!==owner)throw Error("Refusing cleanup of an unowned container.");
      docker("rm","--force",name);attempted=false;
    }
  };
  try {
    attempted=true;
    docker("run","--detach","--rm","--name",name,"--label","xenios.quote-acl-owned="+owner,"--publish","127.0.0.1::5432","--env","POSTGRES_USER=postgres",
      "--env","POSTGRES_DB=postgres","--env","POSTGRES_PASSWORD="+password,"postgres:17.6");await ready(name);
    const mapping=/^127\.0\.0\.1:(\d+)$/.exec(docker("port",name,"5432/tcp"));if(!mapping)throw Error("Owned loopback mapping required.");
    const port=Number(mapping[1]);
    const connect=async()=>{
      const client=new pg.Client({host:"127.0.0.1",port,database:"postgres",user:"postgres",password,ssl:false,connectionTimeoutMillis:3000});
      client.on("error",()=>undefined);connections.add(client);await client.connect();
      const identity=(await client.query(IDENTITY_SQL)).rows[0];
      if(identity.server_version!=="170006"||identity.current_user!=="postgres")throw Error("Wrong owned engine/operator.");
      return client;
    };
    const admin=await connect();
    await admin.query(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN;
      CREATE ROLE ea_quote_runtime NOLOGIN NOINHERIT;CREATE ROLE ea_quote_login NOLOGIN NOINHERIT;
      GRANT ea_quote_runtime TO ea_quote_login WITH SET TRUE,INHERIT FALSE,ADMIN FALSE;
      CREATE SCHEMA quote_delivery_private;SET search_path=quote_delivery_private,pg_catalog;`);
    for(const source of ["tables.sql","private-pg.sql","verified-receipts.sql"])
      await admin.query(readFileSync(new URL("../../server/research/assisted-order/quote/delivery/"+source,import.meta.url),"utf8"));
    await admin.query(`CREATE TABLE public.research_notification_outbox(id uuid DEFAULT gen_random_uuid(),event_key text UNIQUE NOT NULL,
      event_type text NOT NULL,template_key text NOT NULL,recipient text NOT NULL,payload jsonb NOT NULL,status text DEFAULT 'pending');
      ALTER TABLE public.research_notification_outbox ENABLE ROW LEVEL SECURITY;
      CREATE POLICY fixture_quote_scope ON public.research_notification_outbox TO ea_quote_runtime
        USING(template_key='ea_private_quote_notice_v1' AND event_type='ea_private_quote_notice_v1' AND payload->>'tenant'='ea-production')
        WITH CHECK(template_key='ea_private_quote_notice_v1' AND event_type='ea_private_quote_notice_v1' AND payload->>'tenant'='ea-production');
      GRANT USAGE ON SCHEMA quote_delivery_private TO ea_quote_runtime;
      GRANT SELECT(tenant,id,target_id,xri_id,seller,version,state,snapshot),INSERT(tenant,id,target_id,xri_id,seller,version,state,snapshot),UPDATE(state)
        ON quote_delivery_private.qd_quotes TO ea_quote_runtime;
      GRANT SELECT(tenant,xri_id,opkey,fingerprint,id),INSERT(tenant,xri_id,opkey,fingerprint,id) ON quote_delivery_private.qd_attempts TO ea_quote_runtime;
      GRANT SELECT(tenant,target_id,xri_id,seller),INSERT(tenant,target_id,xri_id,seller) ON quote_delivery_private.qd_directory TO ea_quote_runtime;
      GRANT SELECT(tenant,id,xri_id,contact_tag,bindings_tag,issuer,state,provider_id),INSERT(tenant,id,xri_id,contact_tag,bindings_tag,issuer,state,provider_id),UPDATE(state,provider_id)
        ON quote_delivery_private.qd_notification_intents TO ea_quote_runtime;
      GRANT INSERT(id,tenant,quote_id,kind,at_time) ON quote_delivery_private.qd_audits TO ea_quote_runtime;
      GRANT SELECT(event_key,payload),INSERT(event_key,event_type,template_key,recipient,payload) ON public.research_notification_outbox TO ea_quote_runtime;
      RESET search_path;`);
    const capture=async(client=admin):Promise<Snapshot>=>{await client.query("SET search_path=pg_catalog");return(await client.query(CAPTURE_SQL)).rows[0].evidence.snapshot;};
    const pre=await capture();
    const artifacts={preimageJson:JSON.stringify({snapshot:pre}),deltaJson:JSON.stringify(EXACT_DELTA),changeSql:CHANGE_SQL,inverseSql:INVERSE_SQL};
    const request:AclRequest={action:"apply",executionId:"owned_"+randomUUID(),sourceSha:"b".repeat(40),expectedServerVersion:"170006",
      target:{projectId:"owned-container-only",serviceId:name},wallMs:15_000,artifacts,
      pins:{preimage:sha256(artifacts.preimageJson),delta:sha256(artifacts.deltaJson),change:sha256(CHANGE_SQL),inverse:sha256(INVERSE_SQL)}};
    const reserved=new Set<string>(),sql:string[]=[],errors:string[]=[],journals:AclReceipt[]=[],journalByRef=new Map<string,AclReceipt>();
    let intercept:((text:string,client:pg.Client,run:()=>Promise<{rows:Record<string,unknown>[]}>)=>Promise<{rows:Record<string,unknown>[]}>)|undefined;
    let preparedHook:(()=>Promise<void>)|undefined;
    const operator:QuoteAclOperator={authorizeAndReserve:async intent=>{
      if(intent.target.projectId!=="owned-container-only"||intent.target.serviceId!==name||reserved.has(intent.executionId))throw Error("Owned fixture custody refused.");
      if(intent.action==="rollback") {
        const recorded=journalByRef.get(intent.recordedApplyRef??"");
        if(!recorded||recorded.action!=="apply"||recorded.outcome!=="committed_verified"||sha256(JSON.stringify(recorded))!==intent.recordedApplyDigest)
          throw Error("Owned journal does not attest this apply.");
      }
      reserved.add(intent.executionId);return{intentSha256:sha256(JSON.stringify(intent)),verificationReceipt:"owned-synthetic-verification",custodyReceipt:"owned-synthetic-custody",
        validUntilUnixMs:Date.now()+120_000,operator:"postgres",providerVerified:true,allActorCustody:true,activationClosed:true,runtimeAssumptionClosed:true,recordedApplyVerified:true};
    },openFreshConnection:async()=>{
      const client=await connect(),adapter=quoteAclPgConnection(client);
      return{...adapter,query:async text=>{
        sql.push(text);const run=async()=>{try{return await adapter.query(text);}catch(error){errors.push(String((error as {code?:string}).code??"transport"));throw error;}};
        return intercept?intercept(text,client,run):run();
      }};
    },journal:async(stage,receipt)=>{const copy=structuredClone(receipt);journals.push(copy);if(stage==="prepared")await preparedHook?.();
      const ref="owned-private-"+stage+"-"+journals.length;journalByRef.set(ref,copy);return ref;}};
    const inverse=(recordedApply:AclReceipt):AclRequest=>({...request,action:"rollback",executionId:"owned_inverse_"+randomUUID(),recordedApply});
    return{admin,connect,capture,pre,request,operator,inverse,sql,errors,journals,cleanup,
      intercept:(hook:typeof intercept)=>{intercept=hook;},prepared:(hook:typeof preparedHook)=>{preparedHook=hook;}};
  }catch(error){await cleanup();throw error;}
}

pgIt("owned PG17: exact 32/3 apply, real receipt SQL under runtime role, negative ACL/RLS, and exact inverse",async()=>{
  const f=await ownedPg17();
  try {
    const applied=await runQuoteAclTransaction(f.request,f.operator);expect(applied.outcome).toBe("committed_verified");
    equalSnapshot(await f.capture(),expectedPostimage(f.pre,EXACT_DELTA));
    const runtime=await f.connect();
    const transact=async<T>(tenant:string,_key:string,work:(q:(sql:string,args?:unknown[])=>Promise<Record<string,unknown>[]>)=>Promise<T>):Promise<T>=>{
      await runtime.query("BEGIN");try{
        await runtime.query("SET LOCAL ROLE ea_quote_runtime");await runtime.query("SET LOCAL search_path=quote_delivery_private,pg_catalog");
        await runtime.query("SELECT set_config('xenios.private_quote_tenant',$1,true)",[tenant]);
        const result=await work(async(sql,args)=>(await runtime.query(sql,args)).rows);await runtime.query("COMMIT");return result;
      }catch(error){await runtime.query("ROLLBACK");throw error;}
    };
    const tagKey=Buffer.alloc(32,7),tenant="ea-production",pid=randomUUID(),quote=randomUUID(),xri=randomUUID(),email="synthetic@example.invalid";
    const tag=(purpose:string,value:unknown)=>createHmac("sha256",tagKey).update(JSON.stringify([purpose,value])).digest("hex");
    await f.admin.query("INSERT INTO quote_delivery_private.qd_quotes VALUES($1,$2,'synthetic-target',$3,'synthetic-seller',1,'issued','synthetic-snapshot')",[tenant,quote,xri]);
    await f.admin.query("INSERT INTO quote_delivery_private.qd_notification_intents VALUES($1,$2,$3,'synthetic-contact','synthetic-binding','synthetic-issuer','accepted',$4)",[tenant,quote,xri,pid]);
    await f.admin.query("INSERT INTO public.research_notification_outbox(event_key,event_type,template_key,recipient,payload) VALUES($1,'ea_private_quote_notice_v1','ea_private_quote_notice_v1',$2,$3)",[
      "qd-"+tag("delivery",[tenant,xri,quote]),email,JSON.stringify({tenant})]);
    let event:SignedQuoteReceipt={eid:"synthetic-event",pid,kind:"delivered",digest:"a".repeat(64),addressTag:tag("resend-recipient",email)};
    const receipts=createResendReceipts({tenant,transact,verifier:()=>event,tagKey});
    let reconciled=0;const reconcile=async()=>{await transact(tenant,"synthetic",async q=>{
      const evidence=await receipts.verifiedDispatchEvidence(q,{tenant,xriId:xri,quoteId:quote,proof:{receiptId:event.eid}});
      expect(evidence?.eventId).toBe(event.eid);await q("INSERT INTO qd_events(eid,tenant,provider_id,kind) VALUES($1,$2,$3,$4)",[event.eid,tenant,pid,event.kind]);reconciled++;
    });};
    expect((await receipts.receive(Buffer.from("synthetic"),[],reconcile)).status).toBe(204);
    expect((await receipts.receive(Buffer.from("synthetic"),[],reconcile)).status).toBe(204);expect(reconciled).toBe(1);
    event={...event,digest:"b".repeat(64)};expect((await receipts.receive(Buffer.from("synthetic"),[],reconcile)).status).toBe(409);
    await transact(tenant,"reply",async q=>{await q("INSERT INTO qd_replies(tenant,quote_id,evidence_id) VALUES($1,$2,'synthetic-reply')",[tenant,quote]);
      expect(await q("SELECT tenant,quote_id,evidence_id FROM qd_replies WHERE tenant=$1",[tenant])).toEqual([{tenant,quote_id:quote,evidence_id:"synthetic-reply"}]);
      expect(await q("SELECT tenant,eid,provider_id,kind FROM qd_events WHERE tenant=$1",[tenant])).toEqual([{tenant,eid:event.eid,provider_id:pid,kind:"delivered"}]);
      await q("UPDATE qd_quotes SET state='expired' WHERE tenant=$1 AND id=$2",[tenant,quote]);
      await q("UPDATE qd_notification_intents SET state='delivered' WHERE tenant=$1 AND id=$2",[tenant,quote]);
    });
    await expect(transact("other-tenant","wrong",q=>q("INSERT INTO qd_events VALUES('wrong','ea-production','pid','delivered')"))).rejects.toMatchObject({code:"42501"});
    await expect(transact("","missing",q=>q("INSERT INTO qd_events VALUES('missing','ea-production','pid','delivered')"))).rejects.toMatchObject({code:"42501"});
    await runtime.query("BEGIN;SET LOCAL ROLE ea_quote_runtime;SET LOCAL search_path=quote_delivery_private,pg_catalog");
    try{await expect(runtime.query("INSERT INTO qd_events VALUES('unset','ea-production','pid','delivered')")).rejects.toMatchObject({code:"42501"});}
    finally{await runtime.query("ROLLBACK");}
    await expect(transact(tenant,"mutation",q=>q("UPDATE qd_quotes SET snapshot='changed' WHERE tenant=$1",[tenant]))).rejects.toMatchObject({code:"42501"});
    await expect(transact(tenant,"delete",q=>q("DELETE FROM qd_events"))).rejects.toMatchObject({code:"42501"});
    await expect(transact(tenant,"wrong-outbox",q=>q("INSERT INTO public.research_notification_outbox(event_key,event_type,template_key,recipient,payload) VALUES('bad','other','other','synthetic@example.invalid','{}')"))).rejects.toMatchObject({code:"42501"});
    for(const role of ["anon","authenticated","service_role"]) {
      await f.admin.query("BEGIN");try {await f.admin.query("SET LOCAL ROLE "+role);
        await expect(f.admin.query("SELECT tenant FROM quote_delivery_private.qd_events")).rejects.toMatchObject({code:"42501"});
      }finally{await f.admin.query("ROLLBACK");}
    }
    const rolled=await runQuoteAclTransaction(f.inverse(applied),f.operator);expect(rolled.outcome).toBe("committed_verified");equalSnapshot(await f.capture(),f.pre);
    expect((await f.admin.query("SELECT rolcanlogin FROM pg_roles WHERE rolname IN ('ea_quote_login','ea_quote_runtime')")).rows).toEqual([{rolcanlogin:false},{rolcanlogin:false}]);
  }finally{await f.cleanup();}
},120_000);

pgIt("owned PG17: real DELETE, grant-option and original-policy drift refuse rollback before inverse",async()=>{
  const f=await ownedPg17();try{
    await f.admin.query("ALTER POLICY tenant_isolation ON quote_delivery_private.qd_events USING(true)");
    expect((await runQuoteAclTransaction(f.request,f.operator)).outcome).toBe("rolled_back");expect(f.sql).not.toContain(CHANGE_SQL);
    await f.admin.query("ALTER POLICY tenant_isolation ON quote_delivery_private.qd_events USING(tenant=current_setting('xenios.private_quote_tenant',true))");
    const applied=await runQuoteAclTransaction({...f.request,executionId:"owned_reviewed_"+randomUUID()},f.operator);expect(applied.outcome).toBe("committed_verified");
    for(const [change,undo] of [
      ["GRANT DELETE ON quote_delivery_private.qd_events TO ea_quote_runtime","REVOKE DELETE ON quote_delivery_private.qd_events FROM ea_quote_runtime"],
      ["GRANT SELECT(tenant) ON quote_delivery_private.qd_events TO ea_quote_runtime WITH GRANT OPTION","REVOKE GRANT OPTION FOR SELECT(tenant) ON quote_delivery_private.qd_events FROM ea_quote_runtime"],
      ["ALTER POLICY tenant_isolation ON quote_delivery_private.qd_events USING(true)","ALTER POLICY tenant_isolation ON quote_delivery_private.qd_events USING(tenant=current_setting('xenios.private_quote_tenant',true))"],
    ]) {
      await f.admin.query(change);const before=await f.capture(),start=f.sql.length;
      expect((await runQuoteAclTransaction(f.inverse(applied),f.operator)).outcome).toBe("rolled_back");
      expect(f.sql.slice(start)).not.toContain(INVERSE_SQL);equalSnapshot(await f.capture(),before);await f.admin.query(undo);
      equalSnapshot(await f.capture(),applied.post);
    }
    f.intercept(async(text,client,run)=>{const result=await run();if(text===INVERSE_SQL)await client.query("GRANT DELETE ON quote_delivery_private.qd_events TO ea_quote_runtime");return result;});
    const wrongRestored=await runQuoteAclTransaction(f.inverse(applied),f.operator);expect(wrongRestored.outcome).toBe("rolled_back");
    equalSnapshot(await f.capture(),applied.post);f.intercept(undefined);
    expect((await runQuoteAclTransaction(f.inverse(applied),f.operator)).outcome).toBe("committed_verified");equalSnapshot(await f.capture(),f.pre);
  }finally{await f.cleanup();}
},120_000);

pgIt("owned PG17: visible role drift before final capture rolls back ACLs; relation locks do not claim role custody",async()=>{
  const f=await ownedPg17();try{
    f.intercept(async(text,_client,run)=>{const reply=await run();if(text===CHANGE_SQL)await f.admin.query("ALTER ROLE ea_quote_runtime LOGIN");return reply;});
    expect((await runQuoteAclTransaction(f.request,f.operator)).outcome).toBe("rolled_back");
    await f.admin.query("ALTER ROLE ea_quote_runtime NOLOGIN");equalSnapshot(await f.capture(),f.pre);
  }finally{await f.cleanup();}
},120_000);

pgIt("owned PG17: actual held relation lock times out and interleaved policy DDL cannot cross controller locks",async()=>{
  const f=await ownedPg17();try{
    await f.admin.query("BEGIN;LOCK TABLE public.research_notification_outbox IN ACCESS EXCLUSIVE MODE");
    expect((await runQuoteAclTransaction(f.request,f.operator)).outcome).toBe("rolled_back");expect(f.errors).toContain("55P03");
    await f.admin.query("ROLLBACK");equalSnapshot(await f.capture(),f.pre);
    const contender=await f.connect();
    f.prepared(async()=>{
      await contender.query("SET lock_timeout='100ms'");
      await expect(contender.query("ALTER POLICY tenant_isolation ON quote_delivery_private.qd_events USING(true)")).rejects.toMatchObject({code:"55P03"});
    });
    const next={...f.request,executionId:"owned_after_contention_"+randomUUID()};
    const applied=await runQuoteAclTransaction(next,f.operator);expect(applied.outcome).toBe("committed_verified");
    f.prepared(undefined);expect((await runQuoteAclTransaction(f.inverse(applied),f.operator)).outcome).toBe("committed_verified");
  }finally{await f.cleanup();}
},120_000);

pgIt("owned PG17: wall deadline during actual mutation destroys own socket and leaves no committed ACL delta",async()=>{
  const f=await ownedPg17();try{
    f.intercept(async(text,client,run)=>{const reply=await run();if(text===CHANGE_SQL)await client.query("SELECT pg_sleep(10)");return reply;});
    const timed={...f.request,wallMs:3000};const receipt=await runQuoteAclTransaction(timed,f.operator);
    expect(receipt.outcome).toBe("uncertain");expect(receipt.error).toBe("deadline");expect(f.sql).not.toContain("COMMIT");
    expect(f.sql).toContain(CHANGE_SQL);
    // Acquiring these locks on the independent backend waits for the destroyed
    // session's transaction to release them; it is not a sleep/polling proof.
    await f.admin.query("BEGIN;SET LOCAL lock_timeout='3s';"+LOCK_SQL);await f.admin.query("ROLLBACK");equalSnapshot(await f.capture(),f.pre);
  }finally{await f.cleanup();}
},120_000);

pgIt("owned PG17: lost ACK after actual COMMIT is uncertain and same execution cannot be replayed",async()=>{
  const f=await ownedPg17();try{
    f.intercept(async(text,_client,run)=>{const reply=await run();if(text==="COMMIT")throw Error("Synthetic lost actual COMMIT ACK.");return reply;});
    const receipt=await runQuoteAclTransaction(f.request,f.operator);expect(receipt.outcome).toBe("uncertain");expect(receipt.commitAcknowledged).toBe(false);
    equalSnapshot(await f.capture(),expectedPostimage(f.pre,EXACT_DELTA));expect(f.sql).not.toContain("ROLLBACK");expect(f.sql).not.toContain(INVERSE_SQL);
    const before=f.sql.length;expect((await runQuoteAclTransaction(f.request,f.operator)).outcome).toBe("refused");expect(f.sql).toHaveLength(before);
  }finally{await f.cleanup();}
},120_000);
