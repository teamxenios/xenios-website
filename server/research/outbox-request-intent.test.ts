import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({rows:[] as any[], attempts:[] as any[], queries:[] as any[], flipOnClaim:false, flipAtProvider:false, metricsError:false}));
const sent=vi.hoisted(()=>vi.fn(async(..._args: any[])=>({data:{id:"synthetic-provider"},error:null})));
vi.mock("../routes",()=>({requireSupabaseAdmin:(_a:any,_b:any,next:any)=>next()}));
vi.mock("../services/email",()=>({getResendClient:async()=>{
 if(state.flipAtProvider)process.env.RESEARCH_REQUEST_INTENT_NOTIFICATIONS_SEND_ENABLED="false";
 return {client:{emails:{send:sent}}};
}}));
vi.mock("./membership-emails",()=>Object.fromEntries([
 "sendAccountClaimSuccess","sendApprovedCustomerClaim","sendApprovedCustomerWelcome","sendAdminTestEmail",
 "sendApplicationApproved","sendB2BBuyerClaim","sendApplicationDeclined","sendApplicationReceived","sendEmailFailureAlert",
 "sendInternalApplicationAlert","sendMoreInformationRequested","sendResubmittedConfirmation","sendStatusLink",
].map(name=>[name,vi.fn(async()=>true)])));
vi.mock("../supabase",()=>{
 function query(table:string) {
   const rows=table==="research_notification_attempts"?state.attempts:state.rows;
   const conditions:Array<(row:any)=>boolean>=[];
   let update:any=null,insert:any=null,limit=Infinity,head=false,count=false;
   const trace:string[]=[]; state.queries.push({table,trace});
   const finish=()=>{
     const matching=rows.filter(row=>conditions.every(check=>check(row)));
     if(insert){rows.push(insert);return {data:null,error:null};}
     if(update){for(const row of matching)Object.assign(row,update);return {data:matching.map(row=>({...row})),error:null};}
     return {data:head?null:matching.slice(0,limit).map(row=>({...row})),count:count?matching.length:null,error:head&&state.metricsError?{message:"private"}:null};
   };
   const api:any={
     select:(_cols?:string,options?:any)=>{head=!!options?.head;count=options?.count==="exact";return api;},
     insert:(value:any)=>{insert=value;return api;},
     update:(value:any)=>{update=value;return api;},
     eq:(key:string,value:any)=>{conditions.push(row=>row[key]===value);return api;},
     neq:(key:string,value:any)=>{trace.push("neq");conditions.push(row=>row[key]!=null&&row[key]!==value);return api;},
     in:(key:string,values:any[])=>{conditions.push(row=>values.includes(row[key]));return api;},
     lt:(key:string,value:any)=>{conditions.push(row=>row[key]!=null&&row[key]<value);return api;},
     lte:(key:string,value:any)=>{conditions.push(row=>row[key]<=value);return api;},
     limit:(value:number)=>{trace.push("limit");limit=value;return api;},
     single:async()=>{const result=finish();if(update?.status==="processing"&&state.flipOnClaim)process.env.RESEARCH_REQUEST_INTENT_NOTIFICATIONS_SEND_ENABLED="false";return {...result,data:result.data?.[0]??null};},
     then:(resolve:any)=>resolve(finish()),
   }; return api;
 }
 return {supabaseConfigured:()=>true,getSupabaseAdmin:()=>({from:query,rpc:async()=>({data:null,error:"disabled"})})};
});
import { runOutboxTick, requestIntentNotificationHeldMetrics } from "./outbox";
import { REQUEST_INTENT_NOTIFICATION_TEMPLATE as template, REQUEST_INTENT_NOTIFICATION_STAFF_LINK_READY as ready } from "./assisted-order/request-intent/notification-communications";
const now=new Date("2026-10-18T12:00:00Z");
function job(id:string,key=template,status="pending") {
 return {id,event_key:"synthetic:"+id,template_key:key,recipient:"staff@example.invalid",payload:{publicReference:"XRI-"+"A".repeat(32)},status,attempt_count:0,
 next_attempt_at:"2020-01-01T00:00:00Z",updated_at:"2020-01-01T00:00:00Z"};
}
beforeEach(()=>{
 state.rows=[];state.attempts=[];state.queries=[];state.flipOnClaim=false;state.flipAtProvider=false;state.metricsError=false;sent.mockClear();
 vi.stubEnv("RESEARCH_REQUEST_INTENT_NOTIFICATIONS_SEND_ENABLED","");
 vi.stubEnv("RESEARCH_REQUEST_INTENT_NOTIFICATIONS_ENQUEUE_ENABLED","");
 vi.stubEnv("RESEARCH_REQUEST_INTENT_NOTIFICATION_RECIPIENTS","staff@example.invalid");
 vi.stubEnv(ready,"");
 vi.stubEnv("RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED","");
 vi.stubEnv("SITE_URL","https://example.invalid");
});
describe("canonical outbox request-intent hold",()=>{
 it("excludes more than20 held jobs beforeLIMIT so unrelated jobs remain eligible",async()=>{
   state.rows.push(...Array.from({length:25},(_,i)=>job("h"+i)),job("ordinary","applicant_received"));
   expect(await runOutboxTick(now)).toEqual({sent:1,retried:0,failed:0});
   expect(state.rows[0].status).toBe("pending");
   expect(state.rows[25].status).toBe("sent");
   expect(state.attempts).toHaveLength(1);expect(sent).not.toHaveBeenCalled();
   for(const query of state.queries.filter(q=>q.trace.includes("limit")))expect(query.trace).toEqual(["neq","limit"]);
 });
 it("does not reclaim stale processing template or consume any attempts while off",async()=>{
   state.rows.push(job("held",template,"processing"));
   expect(await runOutboxTick(now)).toEqual({sent:0,retried:0,failed:0});
   expect(state.rows[0].status).toBe("processing");expect(state.rows[0].attempt_count).toBe(0);expect(state.attempts).toEqual([]);
 });
 it("delivers only the explicitly enabled approved reference with stable provider key",async()=>{
   vi.stubEnv("RESEARCH_REQUEST_INTENT_NOTIFICATIONS_SEND_ENABLED","true");state.rows.push(job("enabled"));
   expect((await runOutboxTick(now)).sent).toBe(1);
   expect(sent).toHaveBeenCalledOnce();
   expect(sent.mock.calls[0]).toEqual([expect.objectContaining({to:"staff@example.invalid",subject:"Quick Order request pending review"}),{idempotencyKey:"synthetic:enabled"}]);
   expect(sent.mock.calls[0][0].text).toContain(state.rows[0].payload.publicReference);
   expect(sent.mock.calls[0][0].text).not.toMatch(/https:\/\/|Submitted at|Status:/);
   expect(state.rows[0].status).toBe("sent");
 });
 it("passes a complete validated metadata payload through the existing sender with the same logical event key",async()=>{
   vi.stubEnv("RESEARCH_REQUEST_INTENT_NOTIFICATIONS_SEND_ENABLED","true");
   const item=job("metadata");
   item.payload={...item.payload,status:"pending_review",submittedAt:"2026-10-18T12:00:00.000Z"} as any;
   state.rows.push(item);
   expect(await runOutboxTick(now)).toEqual({sent:1,retried:0,failed:0});
   expect(sent).toHaveBeenCalledOnce();
   expect(sent.mock.calls[0][0].text).toContain("Status: pending review\nSubmitted at (UTC): 2026-10-18T12:00:00.000Z");
   expect(sent.mock.calls[0][0].text).not.toContain("https://");
   expect(sent.mock.calls[0][1]).toEqual({idempotencyKey:"synthetic:metadata"});
   expect(item.event_key).toBe("synthetic:metadata");
   expect(await runOutboxTick(now)).toEqual({sent:0,retried:0,failed:0});
   expect(sent).toHaveBeenCalledOnce();
 });
 it("includes only the fixed private queue link when both operator readiness and staff-read enablement are explicit",async()=>{
   vi.stubEnv("RESEARCH_REQUEST_INTENT_NOTIFICATIONS_SEND_ENABLED","true");
   vi.stubEnv(ready,"true");vi.stubEnv("RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED","true");
   state.rows.push(job("ready"));
   expect((await runOutboxTick(now)).sent).toBe(1);
   expect(sent.mock.calls[0][0].text).toContain("https://example.invalid/care/request-intents");
   expect(sent.mock.calls[0][0].text).not.toMatch(/\?|token=/);
   expect(sent.mock.calls[0][1]).toEqual({idempotencyKey:"synthetic:ready"});
 });
 it("does not send malformed metadata through the provider or manufacture a successful notification",async()=>{
   vi.stubEnv("RESEARCH_REQUEST_INTENT_NOTIFICATIONS_SEND_ENABLED","true");
   const item=job("invalid-metadata");item.payload={...item.payload,status:"paid"} as any;state.rows.push(item);
   const result=await runOutboxTick(now);
   expect(result.sent).toBe(0);expect(sent).not.toHaveBeenCalled();
   expect(item.status).not.toBe("sent");
 });
 it("does not infer retrospective delivery for prior sent or uncertain processing jobs",async()=>{
   vi.stubEnv("RESEARCH_REQUEST_INTENT_NOTIFICATIONS_SEND_ENABLED","true");
   const recent=now.toISOString();
   state.rows.push({...job("already-sent",template,"sent"),updated_at:recent},
     {...job("uncertain",template,"processing"),updated_at:recent});
   expect(await runOutboxTick(now)).toEqual({sent:0,retried:0,failed:0});
   expect(sent).not.toHaveBeenCalled();expect(state.attempts).toEqual([]);
   expect(state.rows.map(row=>row.status)).toEqual(["sent","processing"]);
 });
 it("restores a mid-claim gate closure without a send, attempt increment or false success",async()=>{
   vi.stubEnv("RESEARCH_REQUEST_INTENT_NOTIFICATIONS_SEND_ENABLED","true");state.flipOnClaim=true;state.rows.push(job("race"));
   expect(await runOutboxTick(now)).toEqual({sent:0,retried:0,failed:0});
   expect(state.rows[0].status).toBe("pending");expect(state.rows[0].attempt_count).toBe(0);
   expect(state.attempts).toEqual([]);expect(sent).not.toHaveBeenCalled();
 });
 it("reports aggregate held counts and unknown on metrics failure",async()=>{
   state.rows.push(job("held"),job("other","applicant_received"));
   expect(await requestIntentNotificationHeldMetrics()).toEqual({deliveryEnabled:false,heldCount:1});
   state.metricsError=true;expect(await requestIntentNotificationHeldMetrics()).toEqual({deliveryEnabled:false,heldCount:null});
 });
 it("rechecks the send gate after asynchronous provider-client acquisition",async()=>{
   vi.stubEnv("RESEARCH_REQUEST_INTENT_NOTIFICATIONS_SEND_ENABLED","true");state.flipAtProvider=true;state.rows.push(job("late-race"));
   expect(await runOutboxTick(now)).toEqual({sent:0,retried:0,failed:0});
   expect(state.rows[0].status).toBe("pending");expect(state.attempts).toEqual([]);expect(sent).not.toHaveBeenCalled();
 });
});
