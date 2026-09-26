// Local-only browser fixture: real claim route, production dependencies, signed
// token validation and actual candidate SQL. Auth protocol is synthetic and
// verifies exact fixture sessions; it never grants membership itself.
import express from "express";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { buildNativeCloseoutPreview } from "../../../scripts/preview-native-closeout";

const port = 5305;
const dist = process.argv[2];
const modulePath = process.argv[3];
if (!dist || !modulePath) throw Error("Explicit isolated bundle and PGlite module required");
const native = await buildNativeCloseoutPreview(port, dist);
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);");
for (const source of ["supabase/research-membership.sql", "supabase/research-members.sql", "supabase/research-notification-outbox.sql"]) {
  await db.exec(readFileSync(source, "utf8").replace(/^create extension if not exists "pgcrypto";\s*$/gm, ""));
}
await db.exec(readFileSync("supabase/candidates/20260905_research_approved_customer_access.sql", "utf8"));
const people = [
  { id: "10000000-0000-4000-8000-000000000001", email: "admin@preview.invalid" },
  { id: "20000000-0000-4000-8000-000000000001", email: "member@preview.invalid" },
  { id: "20000000-0000-4000-8000-000000000002", email: "other@preview.invalid" },
];
for (const p of people) await db.query("insert into auth.users values($1,$2,clock_timestamp())", [p.id,p.email]);
const approved = (await db.query("select public.research_admin_approve_customer_access($1,$2,$3,$4,$5,null,null,$6) result", [people[0].id,people[1].email,"Synthetic","Applicant","Isolated audit fixture approval","audit-sql-approval-one"])).rows[0].result;
if (!approved.ok) throw Error("Actual SQL fixture approval refused");
const { registerMembershipApi, makeResearchToken } = await import("../../../server/research/membership");
const { registerMemberApi } = await import("../../../server/research/members");
const { registerApprovedCustomerAccessApi } = await import("../../../server/research/approved-customer-access");
const { createApprovedCustomerAccessDependencies } = await import("../../../server/research/approved-customer-access-production");
const { requireSupabaseAdmin } = await import("../../../server/routes");
const app = express(); app.use(express.json());
app.use((_req,res,next) => {res.set({"Cache-Control":"no-store","Referrer-Policy":"no-referrer"});next();});
const sessions = new Map<string, typeof people[number]>();
const tokenFor = (p: typeof people[number], recovery = false) => ["synthetic",Buffer.from(JSON.stringify({sub:p.id,email:p.email,amr:[{method:recovery?"recovery":"password",timestamp:Math.floor(Date.now()/1000)}]})).toString("base64url"),"local-only"].join(".");
const bearer = (req: express.Request) => String(req.headers.authorization??"").replace(/^Bearer /,"");
const user = (p: typeof people[number]) => ({id:p.id,email:p.email,email_confirmed_at:"2026-09-24T00:00:00Z",aud:"authenticated",role:"authenticated",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},identities:[]});
app.post("/preview-backend/auth/v1/token",(req,res)=>{
  const p = req.query.grant_type === "refresh_token" ? sessions.get(String(req.body.refresh_token).replace(/^refresh:/,"")) : people.find(p=>p.email===req.body.email && req.body.password==="native-preview-password");
  if(!p)return res.status(400).json({error:"invalid_grant"});
  const token=tokenFor(p);sessions.set(token,p);return res.json({access_token:token,refresh_token:"refresh:"+token,token_type:"bearer",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:user(p)});
});
app.get("/preview-backend/auth/v1/user",(req,res)=>{const p=sessions.get(bearer(req));return p?res.json(user(p)):res.status(401).json({message:"Invalid synthetic session"});});
app.post("/preview-backend/auth/v1/logout",(req,res)=>{sessions.delete(bearer(req));res.status(204).end();});
app.post("/preview-backend/rest/v1/rpc/:name",async(req,res)=>{
  if(bearer(req)!=="native-preview-service")return res.sendStatus(403);
  const n=req.params.name;
  const calls:Record<string,{sql:string;values:unknown[]}>={
    research_approved_customer_access_authority:{sql:"select public.research_approved_customer_access_authority() result",values:[]},
    research_claim_approved_customer_access:{sql:"select public.research_claim_approved_customer_access($1,$2) result",values:[req.body.p_application_id,req.body.p_auth_user_id]},
    research_admin_approve_customer_access:{sql:"select public.research_admin_approve_customer_access($1,$2,$3,$4,$5,$6,$7,$8) result",values:[req.body.p_actor_auth_user_id,req.body.p_email,req.body.p_first_name,req.body.p_last_name,req.body.p_reason,req.body.p_expected_application_id,req.body.p_expected_updated_at,req.body.p_idempotency_key]},
  };
  if(!calls[n])return res.status(503).json({message:"Unimplemented local RPC; production fallback remains in effect"});
  try{const c=calls[n];const result=await db.transaction(async(tx:any)=>{await tx.exec("set local role service_role");return (await tx.query(c.sql,c.values)).rows[0].result;});res.json(result);}catch{res.status(500).json({message:"Actual SQL operation refused"});}
});
const allowedTables=new Set(["research_applications","research_application_events","research_members"]);
app.get("/preview-backend/rest/v1/:table",async(req,res)=>{
  if(bearer(req)!=="native-preview-service"||!allowedTables.has(req.params.table))return res.sendStatus(403);
  const where:string[]=[],values:string[]=[];
  for(const [key,value] of Object.entries(req.query)){
    if(["select","limit","order"].includes(key))continue;
    if(!["id","application_id","auth_user_id","email","member_id","status"].includes(key)||typeof value!=="string"||!value.startsWith("eq."))return res.sendStatus(400);
    values.push(value.slice(3));where.push('"'+key+'"=$'+values.length);
  }
  try{let rows=(await db.query('select * from public."'+req.params.table+'"'+(where.length?' where '+where.join(' and '):''),values)).rows;
    const fields=String(req.query.select??"*");if(fields!=="*"){if(!/^[a-z_,]+$/.test(fields))return res.sendStatus(400);rows=rows.map((r:any)=>Object.fromEntries(fields.split(',').map(f=>[f,r[f]])));}
    res.json(String(req.headers.accept??"").includes("vnd.pgrst.object")?(rows[0]??null):rows);
  }catch{res.status(500).json({message:"Actual local table query failed"});}
});
app.get("/__audit_claim/:purpose",async(req,res)=>{
  const other=req.params.purpose==='recovery'?(await db.query("select id from public.research_applications where email=$1",[people[2].email])).rows[0]:null;
  let token=makeResearchToken(req.params.purpose==='status'?'status':'account_claim',other?.id??approved.applicationId);
  if(req.params.purpose==='expired'){
    const payload=`v2.account_claim.${approved.applicationId}.${Date.now()-60000}`;
    const key=crypto.createHash('sha256').update(process.env.RESEARCH_SESSION_SECRET!).digest();
    token=payload+'.'+crypto.createHmac('sha256',key).update(payload).digest('base64url');
  }
  res.redirect('/research/apply/status?token='+encodeURIComponent(token)+(req.params.purpose==='recovery'?'#type=recovery':''));
});
app.get("/__audit_state",async(_req,res)=>{
  const application=(await db.query("select status,access_approval_version from public.research_applications where id=$1",[approved.applicationId])).rows[0];
  const members=(await db.query("select auth_user_id,status,access_basis,billing_state from public.research_members")).rows;
  const outbox=(await db.query("select event_type,status,count(*)::int count from public.research_notification_outbox group by event_type,status")).rows;
  res.json({application,members,outbox,productionMutated:false,externalDelivery:false});
});
// Test-controller API admits synthetic sessions solely for direct negative
// route tests. It supplies no membership; real claim SQL decides that.
app.get("/__audit_fixture",(_req,res)=>{
  const recovery=tokenFor(people[1],true);sessions.set(recovery,people[1]);
  res.json({claim:makeResearchToken('account_claim',approved.applicationId),status:makeResearchToken('status',approved.applicationId),recovery});
});
app.use((req,res,next)=>{
  if(req.path==='/api/research/member/claim'||req.path==='/api/research/applications/status'||req.path==='/api/admin/research/access/approve-customer')return next();
  return native.app(req,res,next);
});
registerMembershipApi(app);registerMemberApi(app);
registerApprovedCustomerAccessApi(app,createApprovedCustomerAccessDependencies(),requireSupabaseAdmin);
app.listen(port,'127.0.0.1',()=>console.log('[audit-sql-claims] local real SQL + claim validation; no external network; port5305'));
