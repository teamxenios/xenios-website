import { describe,expect,it,vi } from "vitest";
import { CAPTURE_SQL,CODE_PINS,IDENTITY_SQL,LOCK_SQL,SESSIONS_SQL,runQuoteAclTransaction,sha256,
  type AclIntent,type AclRequest,type QuoteAclConnection,type QuoteAclOperator,type Verification } from "./quote-acl-controller";
import { CHANGE_SQL,EXACT_DELTA,INVERSE_SQL,equalSnapshot,expectedPostimage,validateRollback,type Snapshot } from "./quote-acl-snapshot";

// Deliberately synthetic catalog/authority doubles for controller fault paths.
// The separate owned-PG file executes this same projection/comparator/controller.
function baseline():Snapshot {
  const rights=()=>Object.fromEntries(["SELECT","INSERT","UPDATE","DELETE","TRUNCATE","REFERENCES","TRIGGER","MAINTAIN"].map(k=>[k,{allowed:false,grantable:false}]));
  const tables=["qd_attempts","qd_audits","qd_directory","qd_events","qd_notification_intents","qd_quotes","qd_replies","qd_verified_receipts","research_notification_outbox"];
  return {snapshotVersion:2,database:"postgres",operator:"postgres",operatorOid:1,serverVersion:"170006",
    roles:[{oid:2,name:"ea_quote_runtime",login:false,inherit:false,super:false,bypassRls:false,createRole:false,createDb:false,replication:false},
      {oid:3,name:"ea_quote_login",login:false,inherit:false,super:false,bypassRls:false,createRole:false,createDb:false,replication:false}],
    memberships:[{roleOid:2,memberOid:3,set:true,inherit:false,admin:false}],
    schemas:[{name:"public",runtimeUsage:true,runtimeCreate:false,anonUsage:true,authenticatedUsage:true,serviceRoleUsage:true},
      {name:"quote_delivery_private",runtimeUsage:true,runtimeCreate:false,anonUsage:false,authenticatedUsage:false,serviceRoleUsage:false}],
    relations:tables.map((table,index)=>{
      const schema=table==="research_notification_outbox"?"public":"quote_delivery_private";
      const cols=[...new Set(EXACT_DELTA.grants.filter(g=>g.table===table).map(g=>g.column))];
      return {oid:100+index,schema,table,kind:"r",owner:"postgres",rls:true,forceRls:schema!=="public",acl:[],runtimeTable:rights(),
        columns:cols.map(name=>({name,acl:[],runtime:rights()})),policies:EXACT_DELTA.policies.some(p=>p.table===table)?[{
          name:"tenant_isolation",command:"*",permissive:true,roles:[{oid:0,name:"PUBLIC"}],
          using:"(tenant = current_setting('xenios.private_quote_tenant'::text, true))",check:"(tenant = current_setting('xenios.private_quote_tenant'::text, true))",
        }]:[]};
    })};
}
function request(pre=baseline()):AclRequest {
  const artifacts={preimageJson:JSON.stringify({snapshot:pre}),deltaJson:JSON.stringify(EXACT_DELTA),changeSql:CHANGE_SQL,inverseSql:INVERSE_SQL};
  return {action:"apply",executionId:"synthetic_apply_1",sourceSha:"a".repeat(40),expectedServerVersion:"170006",
    target:{projectId:"owned-synthetic-only",serviceId:"no-managed-service"},wallMs:1000,artifacts,
    pins:{preimage:sha256(artifacts.preimageJson),delta:sha256(artifacts.deltaJson),change:sha256(CHANGE_SQL),inverse:sha256(INVERSE_SQL)}};
}
function harness(input=request(),snapshots?:Snapshot[]) {
  const pre=JSON.parse(input.artifacts.preimageJson).snapshot as Snapshot;
  const images=snapshots??[pre,expectedPostimage(pre,EXACT_DELTA),expectedPostimage(pre,EXACT_DELTA)];let at=0;
  const connection:QuoteAclConnection={query:vi.fn(async (text:string):Promise<{rows:Record<string,unknown>[]} >=>{
    if(text===IDENTITY_SQL)return{rows:[{session_user:"postgres",current_user:"postgres",role:"none",temp_schema:"0",server_version:"170006",fresh_transaction:true}]};
    if(text===SESSIONS_SQL)return{rows:[{login_sessions:0,runtime_sessions:0}]};
    if(text===CAPTURE_SQL)return{rows:[{evidence:{snapshot:structuredClone(images[at++])}}]};
    return{rows:[]};
  }),close:vi.fn(async()=>undefined),destroy:vi.fn()};
  const reserved=new Set<string>(); // Synthetic double, NOT a durable authority implementation.
  const operator:QuoteAclOperator={authorizeAndReserve:vi.fn(async (intent:Readonly<AclIntent>):Promise<Verification>=>{
    if(reserved.has(intent.executionId))throw Error("Synthetic already-reserved execution.");reserved.add(intent.executionId);
    return{intentSha256:sha256(JSON.stringify(intent)),verificationReceipt:"synthetic-provider-verification",custodyReceipt:"synthetic-custody",
      validUntilUnixMs:Date.now()+60_000,operator:"postgres",providerVerified:true,allActorCustody:true,activationClosed:true,runtimeAssumptionClosed:true,recordedApplyVerified:true};
  }),openFreshConnection:vi.fn(async()=>connection),journal:vi.fn(async (stage:"prepared"|"final")=>"synthetic-private-"+stage)};
  const sql=()=>vi.mocked(connection.query).mock.calls.map(([s])=>s);
  return{input,pre,connection,operator,sql};
}

describe("export-only quote ACL transaction controller",()=>{
  it("has exactly 32 column-operation additions and three restrictive policies",()=>{
    expect(EXACT_DELTA.grants).toHaveLength(32);expect(EXACT_DELTA.policies).toHaveLength(3);
    expect(Object.isFrozen(EXACT_DELTA.grants)).toBe(true);expect(CODE_PINS.capture).toBe(sha256(CAPTURE_SQL));
  });
  it("uses one connection and locks before the accepted baseline; journals before COMMIT and checks after",async()=>{
    const h=harness(),r=await runQuoteAclTransaction(h.input,h.operator);
    expect(r.outcome).toBe("committed_verified");expect(r.replayAllowed).toBe(false);
    expect(h.sql()).toEqual(["SET search_path=pg_catalog",IDENTITY_SQL,SESSIONS_SQL,"BEGIN ISOLATION LEVEL READ COMMITTED","SET LOCAL lock_timeout='5s'",
      "SET LOCAL statement_timeout='30s'","SET LOCAL idle_in_transaction_session_timeout='15s'","SET LOCAL search_path=pg_catalog",LOCK_SQL,
      CAPTURE_SQL,CHANGE_SQL,CAPTURE_SQL,"COMMIT",CAPTURE_SQL]);
    expect(h.operator.openFreshConnection).toHaveBeenCalledTimes(1);expect(h.connection.close).toHaveBeenCalledTimes(1);
    expect(h.connection.destroy).toHaveBeenCalled();expect(h.operator.journal).toHaveBeenCalledTimes(2);
    const prepared=vi.mocked(h.operator.journal).mock.calls[0][1];expect(prepared.commitSent).toBe(false);expect(prepared.post).not.toBeNull();
  });
  it("requires external provider/custody/activation and intent verification, not packet strings",async()=>{
    const h=harness();vi.mocked(h.operator.authorizeAndReserve).mockResolvedValue({intentSha256:"wrong",verificationReceipt:"not-authority",custodyReceipt:"none",
      validUntilUnixMs:Date.now()+60000,operator:"postgres",providerVerified:true,allActorCustody:true,activationClosed:true,runtimeAssumptionClosed:true});
    expect((await runQuoteAclTransaction(h.input,h.operator)).outcome).toBe("refused");expect(h.operator.openFreshConnection).not.toHaveBeenCalled();
  });
  it("external one-shot reservation refuses reuse after success",async()=>{
    const h=harness();await runQuoteAclTransaction(h.input,h.operator);
    expect((await runQuoteAclTransaction(h.input,h.operator)).outcome).toBe("refused");expect(h.operator.openFreshConnection).toHaveBeenCalledTimes(1);
  });
  it("refuses fragment tampering even with a recomputed caller pin",async()=>{
    const h=harness();h.input.artifacts.changeSql+="\nGRANT DELETE ON quote_delivery_private.qd_events TO ea_quote_runtime;";
    h.input.pins.change=sha256(h.input.artifacts.changeSql);
    await expect(runQuoteAclTransaction(h.input,h.operator)).rejects.toThrow("closed reviewed fragments");expect(h.operator.authorizeAndReserve).not.toHaveBeenCalled();
  });
  it("refuses version drift, old sessions and unclean operator identity before BEGIN",async()=>{
    for(const row of [{session_user:"postgres",current_user:"other",role:"other",temp_schema:"0",server_version:"170006"},
      {session_user:"postgres",current_user:"postgres",role:"none",temp_schema:"0",server_version:"170007"}]) {
      const h=harness(),implementation=vi.mocked(h.connection.query).getMockImplementation()!;
      vi.mocked(h.connection.query).mockImplementation(async text=>text===IDENTITY_SQL?{rows:[row]}:implementation(text));
      expect((await runQuoteAclTransaction(h.input,h.operator)).outcome).toBe("refused");expect(h.sql()).not.toContain(LOCK_SQL);
    }
    const h=harness(),implementation=vi.mocked(h.connection.query).getMockImplementation()!;
    vi.mocked(h.connection.query).mockImplementation(async text=>text===SESSIONS_SQL?{rows:[{login_sessions:1,runtime_sessions:0}]}:implementation(text));
    expect((await runQuoteAclTransaction(h.input,h.operator)).outcome).toBe("refused");
    expect(h.sql()).not.toContain("BEGIN ISOLATION LEVEL READ COMMITTED");
  });
  it.each(["locked_preimage","comparison"])("rolls back exact-image drift at %s",async phase=>{
    const pre=baseline(),post=expectedPostimage(pre,EXACT_DELTA),drift=structuredClone(phase==="locked_preimage"?pre:post);
    drift.relations[0].acl.push({grantorOid:1,grantor:"postgres",granteeOid:2,grantee:"ea_quote_runtime",privilege:"DELETE",grantable:false});
    const h=harness(request(pre),phase==="locked_preimage"?[drift]:[pre,drift]);
    expect((await runQuoteAclTransaction(h.input,h.operator)).outcome).toBe("rolled_back");
    expect(h.sql().filter(s=>s==="ROLLBACK")).toHaveLength(1);expect(h.sql()).not.toContain("COMMIT");
  });
  it("prepared-journal failure rolls back; a final-journal failure never invents an undo",async()=>{
    const h=harness();vi.mocked(h.operator.journal).mockRejectedValueOnce(Error("Synthetic private storage unavailable."));
    expect((await runQuoteAclTransaction(h.input,h.operator)).outcome).toBe("rolled_back");
    const h2=harness();vi.mocked(h2.operator.journal).mockResolvedValueOnce("prepared").mockRejectedValueOnce(Error("Lost final receipt."));
    expect((await runQuoteAclTransaction(h2.input,h2.operator)).outcome).toBe("committed_unverified");expect(h2.sql()).not.toContain(INVERSE_SQL);
  });
  it("lost COMMIT response is uncertain, never rolled back or replayed automatically",async()=>{
    const h=harness(),implementation=vi.mocked(h.connection.query).getMockImplementation()!;
    vi.mocked(h.connection.query).mockImplementation(async text=>{if(text==="COMMIT")throw Error("Synthetic lost ACK.");return implementation(text);});
    const r=await runQuoteAclTransaction(h.input,h.operator);expect(r.outcome).toBe("uncertain");expect(r.commitSent).toBe(true);
    expect(h.sql()).not.toContain("ROLLBACK");expect(h.sql()).not.toContain(INVERSE_SQL);expect(h.connection.destroy).toHaveBeenCalled();
  });
  it("SQL failure with lost rollback is uncertain; neither statement is retried",async()=>{
    const h=harness(),implementation=vi.mocked(h.connection.query).getMockImplementation()!;
    vi.mocked(h.connection.query).mockImplementation(async text=>{
      if(text===CHANGE_SQL)throw Object.assign(Error("Synthetic SQL failure."),{code:"42601"});
      if(text==="ROLLBACK")throw Object.assign(Error("Synthetic lost rollback."),{code:"08006"});return implementation(text);
    });
    const receipt=await runQuoteAclTransaction(h.input,h.operator);expect(receipt.outcome).toBe("uncertain");expect(receipt.sqlState).toBe("42601");
    expect(h.sql().filter(s=>s===CHANGE_SQL)).toHaveLength(1);expect(h.sql().filter(s=>s==="ROLLBACK")).toHaveLength(1);
    expect(h.sql()).not.toContain("COMMIT");expect(h.connection.destroy).toHaveBeenCalled();
  });
  it("wall timeout destroys a mutating connection and never resumes to COMMIT",async()=>{
    vi.useFakeTimers();try {
      const h=harness(),implementation=vi.mocked(h.connection.query).getMockImplementation()!;h.input.wallMs=100;
      let release!:()=>void;const pending=new Promise<{rows:Record<string,unknown>[]}>(ok=>{release=()=>ok({rows:[]});});
      vi.mocked(h.connection.query).mockImplementation(async text=>text===CHANGE_SQL?pending:implementation(text));
      const running=runQuoteAclTransaction(h.input,h.operator);await vi.advanceTimersByTimeAsync(101);
      expect((await running).outcome).toBe("uncertain");expect(h.connection.destroy).toHaveBeenCalled();
      release();await Promise.resolve();expect(h.sql()).not.toContain("COMMIT");
    }finally{vi.useRealTimers();}
  });
  it("a connection resolving after the deadline is destroyed without SQL",async()=>{
    vi.useFakeTimers();try {
      const h=harness();h.input.wallMs=100;let resolve!:(c:QuoteAclConnection)=>void;
      vi.mocked(h.operator.openFreshConnection).mockImplementation(()=>new Promise(ok=>{resolve=ok;}));
      const running=runQuoteAclTransaction(h.input,h.operator);await vi.advanceTimersByTimeAsync(101);await running;
      resolve(h.connection);await Promise.resolve();await Promise.resolve();expect(h.connection.destroy).toHaveBeenCalled();expect(h.connection.query).not.toHaveBeenCalled();
    }finally{vi.useRealTimers();}
  });
  it("deadline during post-commit cleanup is committed-unverified and forcibly closes its socket",async()=>{
    vi.useFakeTimers();try{
      const h=harness();h.input.wallMs=100;vi.mocked(h.connection.close).mockImplementation(()=>new Promise(()=>undefined));
      const running=runQuoteAclTransaction(h.input,h.operator);await vi.advanceTimersByTimeAsync(101);
      expect((await running).outcome).toBe("committed_unverified");expect(h.connection.destroy).toHaveBeenCalled();
      expect(h.sql()).not.toContain("ROLLBACK");expect(h.sql()).not.toContain(INVERSE_SQL);
    }finally{vi.useRealTimers();}
  });
  it("rollback requires the actual successful apply receipt and exact current postimage",async()=>{
    const applied=harness(),r=await runQuoteAclTransaction(applied.input,applied.operator);
    const input={...request(),action:"rollback" as const,executionId:"synthetic_inverse_1",recordedApply:r};
    const h=harness(input,[r.post!,r.pre!,r.pre!]);expect((await runQuoteAclTransaction(input,h.operator)).outcome).toBe("committed_verified");
    expect(h.sql()).toContain(INVERSE_SQL);equalSnapshot(r.pre,baseline());
    const drift=structuredClone(r.post!);drift.relations[0].acl.push({grantorOid:1,grantor:"postgres",granteeOid:2,grantee:"ea_quote_runtime",privilege:"DELETE",grantable:false});
    expect(()=>validateRollback(drift,r.post!,r.pre!,EXACT_DELTA)).toThrow();
    const unrecorded={...input,recordedApply:{...r,journalRef:null}};
    await expect(runQuoteAclTransaction(unrecorded,h.operator)).rejects.toThrow("actual apply receipt");
    const wrongRestored=structuredClone(r.pre!);wrongRestored.relations[0].owner="wrong";
    const failed=harness({...input,executionId:"synthetic_wrong_restore"},[r.post!,wrongRestored]);
    expect((await runQuoteAclTransaction(failed.input,failed.operator)).outcome).toBe("rolled_back");
    expect(failed.sql()).toContain(INVERSE_SQL);expect(failed.sql()).not.toContain("COMMIT");
  });
});
