import { readFileSync } from "node:fs";
import type { Client } from "pg";
import { describe,expect,it,vi } from "vitest";
import { assembleSources,canonical,conservationSQL,isUnarmedEvidence,LOCKS,noMailPgConnection,reconcileNoMailInstall,runNoMailInstall,SOURCE_UNITS,UNARMED_SQL,
  type InstallRequest,type InstallReceipt,type NoMailOperator } from "./request-intent-no-mail-install";

describe("seven-source controller closed boundary",()=>{
  it("reconstructs every original source byte after only the pinned outer token removal",()=>{
    for(const [index,unit] of assembleSources().entries()) {
      const p=Buffer.from(unit.sql),u=SOURCE_UNITS[index];
      const restored=Buffer.concat([p.subarray(0,u.begin),Buffer.from("begin;"),p.subarray(u.begin,u.commit-6),Buffer.from("commit;"),p.subarray(u.commit-6)]);
      expect(restored.equals(readFileSync(u.path))).toBe(true);
    }
  });
  it("refuses any source/body or envelope drift instead of normalizing it",()=>{
    for(const offset of [0,SOURCE_UNITS[0].begin]) expect(()=>assembleSources(p=>{
      const bytes=readFileSync(p);if(p===SOURCE_UNITS[0].path)bytes[offset]^=1;return bytes;
    })).toThrow("source_pin");
  });
  it("is unavailable without actual custody and never looks up a client",async()=>{
    expect((await runNoMailInstall({executionId:"unbound_execution"} as InstallRequest)).outcome).toBe("unavailable");
    expect(await reconcileNoMailInstall({} as InstallRequest,{} as InstallReceipt)).toBe("unresolved");
  });
  it("rejects a17.6 staging request before authority/client work",async()=>{
    const authorizeAndReserve=vi.fn();
    await expect(runNoMailInstall({executionId:"owned_request",implementationSource:"a".repeat(40),target:{project:"srcphrgnxreqyirkitxd",service:"stage"},expectedVersion:170006,wallMs:10000} as InstallRequest,
      {authorizeAndReserve} as unknown as NoMailOperator)).rejects.toThrow("stage_version_pin");
    expect(authorizeAndReserve).not.toHaveBeenCalled();
  });
  it("requires actual observable native wire state; version or command tags alone are insufficient",()=>{
    expect(()=>noMailPgConnection({} as Client)).toThrow("native_wire_api");
  });
  it("preserves every multi-command result and its ONE final ReadyForQuery separately",async()=>{
    const destroy=vi.fn(),query=vi.fn(async()=>[{command:"SET",rows:[]},{command:"DO",rows:[]}]);let wire="I";
    const native={on:vi.fn(),end:vi.fn(),query,getTransactionStatus:()=>wire,processID:123,connection:{stream:{destroy}},connectionParameters:{query_timeout:0}};
    const connection=noMailPgConnection(native as unknown as Client);wire="T";
    expect(await connection.query("owned multi-command")).toEqual({rows:[],commands:["SET","DO"],wire:"T",backendPid:123});
    connection.destroy();expect(destroy).toHaveBeenCalledTimes(1);
  });
  it("conserves all13 existing selected relations and refuses arbitrary query identifiers",()=>{
    expect(LOCKS).toHaveLength(13);expect(LOCKS.map(([n])=>n)).toEqual(LOCKS.map(([n])=>n).sort());
    for(const [name] of LOCKS)expect(conservationSQL(name)).toContain("limit 10001");
    expect(()=>conservationSQL("auth.users")).toThrow("conservation_scope");
    expect(conservationSQL("request_intent_private.requests")).toContain("fixture_no_mail_control_id");
  });
  it("binds semantic JSON keys independent of object insertion ordering",()=>{
    expect(canonical({b:[{z:1,a:2}],a:0})).toBe(canonical({a:0,b:[{a:2,z:1}]}));
  });
  it("requires exact positive singleton evidence; absent/false/NULL/malformed proof never means unarmed",()=>{
    const valid={wire:"T",backendPid:123,commands:["SELECT"],rows:[{n:1,unarmed:true}]};
    expect(isUnarmedEvidence(valid)).toBe(true);
    for(const rows of [[],[{n:0,unarmed:null}],[{n:2,unarmed:true}],[{n:1,unarmed:false}],
      [{n:1,unarmed:null}],[{n:1,unarmed:"true"}],[{n:"1",unarmed:true}],[{unarmed:true}],
      [{n:1,unarmed:true},{n:1,unarmed:true}],[{n:1,unarmed:true,extra:true}]])
      expect(isUnarmedEvidence({...valid,rows})).toBe(false);
    for(const bad of [null,undefined,{}, {...valid,wire:"I"},{...valid,commands:[]},{...valid,backendPid:0}])expect(isUnarmedEvidence(bad)).toBe(false);
    expect(UNARMED_SQL.match(/fixture_[a-z_]+ is null/g)).toHaveLength(15);
    expect(UNARMED_SQL).toContain("policy_capture_enabled is false and policy_capture_bundle_id is null");
  });
});
