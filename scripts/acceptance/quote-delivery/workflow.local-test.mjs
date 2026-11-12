// SQLite is a test-only dialect here. Website runtime uses the injected pg transaction port.
import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';
import {makePrivateQuoteDesk} from '../../../server/research/assisted-order/quote/delivery/workflow.mjs';
import {TEAM,PORTAL,resendTransport} from '../../../server/research/assisted-order/quote/delivery/mail.mjs';
import {attachPrivateQuotePortal} from '../../../server/research/assisted-order/quote/delivery/portal.mjs';
import {pgTransactions} from '../../../server/research/assisted-order/quote/delivery/pg.mjs';
const base=process.env.EA_REPO??process.cwd(), imp=p=>import(pathToFileURL(resolve(base,p)));
const {AssistedOrderQuoteService:Engine}=await imp('server/research/assisted-order/quote/service.ts');
const {bindReviewedXriQuoteLines:bind}=await imp('server/research/assisted-order/quote/xri-line-bindings.ts');
import {key,xri,s,tenant,now,viewer,customer,ctx,request} from './synthetic.mjs';
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'qd-synthetic-'));let db=new DatabaseSync(join(dir,'db'));const raw=()=>db;
 db.exec('PRAGMA foreign_keys=ON');db.exec('CREATE TABLE research_notification_outbox(event_key TEXT PRIMARY KEY,event_type TEXT,template_key TEXT,recipient TEXT,payload TEXT)');db.exec(readFileSync(new URL('../../../server/research/assisted-order/quote/delivery/tables.sql',import.meta.url),'utf8'));
 t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
 let serial=Promise.resolve(),when=now,failBefore='',counter=0,proof=null;const history=[];
 const source=ctx();
 const tx=(_t,_x,cb)=>{const next=serial.then(async()=>{db.exec('BEGIN IMMEDIATE');try{
 const value=await cb(async(sql,params=[])=>{if(failBefore && sql.startsWith(failBefore))throw Error('synthetic failure');
 const args=[];const q=sql.replace('public.research_notification_outbox','research_notification_outbox').replace(/\$(\d+)/g,(_,n)=>{args.push(params[Number(n)-1]);return '?';});return db.prepare(q).all(...args);});db.exec('COMMIT');return value;
 }catch(e){db.exec('ROLLBACK');throw e;}});serial=next.catch(()=>{});return next;};
 const transport=resendTransport({enabled:true,apiKey:'not-real',verifiedSender:TEAM,verifiedReplyTo:TEAM,portalVerified:true,
 fetchImpl:async(url,init)=>{history.push({url,init});if(failBefore==='NETWORK')throw Error('unknown');return {ok:true,json:async()=>({id:'provider-'+history.length})};}});
 const authority={forIssue:async()=>source,forCustomer:async()=>source,forDispatch:async()=>source,verifiedDispatchEvidence:async()=>proof,verifiedReplyEvidence:async()=>proof};
 const opts={transact:tx,Engine,bind,authority,transport,tagKey:key,uuid:()=> 'syn-'+(++counter),clock:()=>new Date(when)};
 return {source,history,raw,desk:makePrivateQuoteDesk(opts),setProof:p=>proof=p,fail:s=>failBefore=s,make:extra=>makePrivateQuoteDesk({...opts,...extra}),
 setTime:s=>when=s,reopen:()=>{db.close();db=new DatabaseSync(join(dir,'db'));db.exec('PRAGMA foreign_keys=ON');}};
}
test('real engine: persisted issue, immutable amount, controlled private read; generic mail and provider receipt survive restart',async t=>{
 const f=fixture(t);const out=await f.desk.issue(viewer(),request());
 assert.deepEqual(out,await f.desk.issue(viewer(),request()).then(r=>({...r,replay:false})));
 f.reopen();const [q]=await f.desk.privateForCustomer(customer(),xri,s);assert.equal(q.totalCents,2550);assert.equal(q.lines[0].quantity,2);
 assert(!JSON.stringify(q).includes('private-base'));assert(!JSON.stringify(q).includes('issuedByActorLabel'));
 assert.equal(await f.desk.dispatch(tenant,xri,out.quoteId),'accepted');assert.equal(await f.desk.dispatch(tenant,xri,out.quoteId),'accepted');
 const mail=JSON.parse(f.history[0].init.body);assert.equal(mail.reply_to,TEAM);assert.equal(mail.from,'Team Xenios <'+TEAM+'>');assert.deepEqual(mail.to,['test@example.invalid']);
 assert(mail.text.includes(PORTAL));assert(!/[0-9]|XRI-|XAO-|synthetic item|clinical|private-base|pkg|quantity|\$/i.test(mail.subject+mail.text));
 assert.equal(f.history.length,1);assert.equal(f.raw().prepare('SELECT count(*) AS n FROM qd_notification_intents').get().n,1);
});
test('controlled failure after old supersession, before enqueue: snapshot, audit and version roll back',async t=>{
 const f=fixture(t),r=await f.desk.issue(viewer(),request());f.fail('INSERT INTO qd_notification_intents');
 await assert.rejects(f.desk.issue(viewer(),request({expectedVersion:1,attempt:'cmd2'})));
 assert.deepEqual(f.raw().prepare('SELECT id,state FROM qd_quotes').all().map(o=>({...o})),[{id:r.quoteId,state:'issued'}]);
 assert.equal(f.raw().prepare('SELECT COUNT(*) AS n FROM qd_audits').get().n,1);
});
test('two concurrent operations produce one new version; duplicate attempt is a replay; stale new intent is refused',async t=>{
 const f=fixture(t);let r=await Promise.all([f.desk.issue(viewer(),request()),f.desk.issue(viewer(),request())]);
 assert.equal(r[0].quoteId,r[1].quoteId);assert.notEqual(r[0].replay,r[1].replay);
 await assert.rejects(f.desk.issue(viewer(),request({validUntil:'2027-02-01T00:00:00Z'})),/Attempt conflict/);
 await assert.rejects(f.desk.issue(viewer(),request({attempt:'cmd2'})),/version changed/);
 assert.equal(f.raw().prepare('SELECT COUNT(*) AS n FROM qd_audits').get().n,1);
});
test('assignment, clinical clearance, current waiver, and verified contact each fail closed; no spoofed destination',async t=>{
 const f=fixture(t);await assert.rejects(f.desk.issue(viewer({capabilities:new Set(['assisted_orders:read_all'])}),request()));
 for(const name of ['notifyAuthorized','currentStanding','issueAuthorized']){f.source[name]=false;await assert.rejects(f.desk.issue(viewer(),request()));f.source[name]=true;}
 f.source.contact.email='a@example.invalid,other@example.invalid';await assert.rejects(f.desk.issue(viewer(),request()));f.source.contact.email='test@example.invalid';
 f.source.bindings[0].clearedForQuotation=false;await assert.rejects(f.desk.issue(viewer(),request()));f.source.bindings[0].clearedForQuotation=true;
 await assert.rejects(f.desk.issue(viewer(),request({to:'other@example.invalid'})));assert.equal(f.raw().prepare('SELECT count(*) n FROM qd_quotes').get().n,0);
});
test('another tenant, another session and absent owner identifiers cannot read amounts',async t=>{
 const f=fixture(t);await f.desk.issue(viewer(),request());
 for(const c of [customer({tenant:'other'}),customer({earlyAccessSessionHash:'other'}),customer({earlyAccessSessionHash:undefined,memberId:undefined})]){
 await assert.rejects(f.desk.privateForCustomer(c,xri,s));}
});
test('supersession suppresses old outbox; revocation or changed contact suppresses new without mail or redirect',async t=>{
 const f=fixture(t);const a=await f.desk.issue(viewer(),request()),b=await f.desk.issue(viewer(),request({attempt:'v2',expectedVersion:1}));
 assert.equal(await f.desk.dispatch(tenant,xri,a.quoteId),'suppressed');
 f.source.contact.email='new@example.invalid';assert.equal(await f.desk.dispatch(tenant,xri,b.quoteId),'suppressed');
 assert.equal((await f.desk.privateForCustomer(customer(),xri,s)).length,0);assert.deepEqual(f.history,[]);
});
test('expired price and freshly revoked evidence never trigger a notice',async t=>{
 const f=fixture(t);const a=await f.desk.issue(viewer(),request());
 f.source.bindings[0].approvalEvidenceId='changed';assert.deepEqual(await f.desk.privateForCustomer(customer(),xri,s),[]);
 f.setTime('2027-01-20T00:00:00Z');assert.equal(await f.desk.dispatch(tenant,xri,a.quoteId),'suppressed');assert.deepEqual(f.history,[]);
});
test('ambiguous accepted-or-not response never resends; only trusted matched evidence moves toward delivered',async t=>{
 const f=fixture(t),a=await f.desk.issue(viewer(),request());f.fail('NETWORK');
 assert.equal(await f.desk.dispatch(tenant,xri,a.quoteId),'uncertain');f.reopen();
 assert.equal(await f.desk.dispatch(tenant,xri,a.quoteId),'uncertain');assert.equal(f.history.length,1);
 const k=f.history[0].init.headers['idempotency-key'];const proof={eventId:'ev1',providerId:'provider-A',state:'delivered',deliveryKey:k};
 f.setProof({...proof,deliveryKey:'other'});await assert.rejects(f.desk.reconcile(tenant,xri,a.quoteId,{}));
 f.setProof(proof);assert.equal(await f.desk.reconcile(tenant,xri,a.quoteId,{}),'delivered');assert.equal(await f.desk.reconcile(tenant,xri,a.quoteId,{}),'delivered');
 f.setProof({...proof,eventId:'ev2',state:'accepted'});assert.equal(await f.desk.reconcile(tenant,xri,a.quoteId,{}),'delivered');
 f.setProof({...proof,eventId:'ev3',state:'bounced'});await assert.rejects(f.desk.reconcile(tenant,xri,a.quoteId,{}));
});
test('interrupted worker after committed claim cannot silently retry across restart',async t=>{
 const f=fixture(t),a=await f.desk.issue(viewer(),request());
 f.raw().prepare("UPDATE qd_notification_intents SET state='attempting' WHERE id=?").run(a.quoteId);f.reopen();
 assert.equal(await f.desk.dispatch(tenant,xri,a.quoteId),'attempting');assert.deepEqual(f.history,[]);
});
test('disabled sender/portal returns disabled without claiming work',async t=>{
 const f=fixture(t),q=await f.desk.issue(viewer(),request());const no=f.make({transport:resendTransport({})});
 assert.equal(await no.dispatch(tenant,xri,q.quoteId),'disabled');assert.equal(f.raw().prepare('SELECT state FROM qd_notification_intents').get().state,'queued');
});

test('controlled quote notice uses the verified deployment origin and the fixed private path', async () => {
 const deliveries = [];
 const transport = resendTransport({
  enabled: true, apiKey: 'not-real', verifiedSender: TEAM, verifiedReplyTo: TEAM,
  portalVerified: true, portalOrigin: 'https://quote-qa.example.invalid/',
  fetchImpl: async (_url, options) => {
   deliveries.push(JSON.parse(options.body));
   return { ok: true, json: async () => ({ id: 'fixture-provider' }) };
  }
 });
 assert.equal(transport.ready(), true);
 assert.equal(await transport.send('qd-' + 'a'.repeat(64), 'fixture@example.invalid'), 'fixture-provider');
 assert.equal(deliveries.length, 1);
 assert.match(deliveries[0].text, /https:\/\/quote-qa\.example\.invalid\/earlyaccess\/quotes\b/);
 assert.ok(!deliveries[0].text.includes(PORTAL));
 assert.equal(deliveries[0].reply_to, TEAM);
});

test('unsafe or malformed configured portal origins disable the controlled sender', async () => {
 for (const portalOrigin of [
  '', null, 'http://quote-qa.example.invalid', 'https://user@quote-qa.example.invalid',
  'https://quote-qa.example.invalid/other', 'https://quote-qa.example.invalid?redirect=other',
  'https://quote-qa.example.invalid#other'
 ]) {
  const transport = resendTransport({
   enabled: true, apiKey: 'not-real', verifiedSender: TEAM, verifiedReplyTo: TEAM, portalVerified: true,
   portalOrigin, fetchImpl: () => assert.fail('invalid origin must not send mail')
  });
  assert.equal(transport.ready(), false);
  await assert.rejects(transport.send('qd-' + 'a'.repeat(64), 'fixture@example.invalid'), /not enabled/);
 }
});
test('private HTML uses verified session, no-store, escaped labels and no staff basis; CSRF refusal',async t=>{
 const f=fixture(t);await f.desk.issue(viewer(),request());
 const handlers={};const router={get:(r,h)=>handlers.get=h,post:(r,h)=>handlers.post=h};
 const res={set(h){this.headers=h;return this;},type(){return this;},status(s){this.statusCode=s;return this;},send(v){this.body=v;return this;},json(v){this.body=v;return this;}};
 attachPrivateQuotePortal(router,{desk:f.desk,customerPrincipal:async()=>customer(),ownedRequests:async()=>[{xriId:xri,seller:s,sellerLabel:'Example',requestLineCount:2}],staffPrincipal:async()=>viewer(),csrfChecked:async()=>false});
 await handlers.get({},res);assert.equal(res.statusCode,200);assert.match(res.headers['Cache-Control'],/no-store/);assert.match(res.body,/\$25\.50/);
 assert.match(res.body,/partial quote/);assert.match(res.body,/&lt;script&gt;/);assert.doesNotMatch(res.body,/private-base|<script>/);
 await handlers.post({body:request()},res);assert.equal(res.statusCode,403);
});
test('postgres port locks by request, rolls back failure and releases dedicated connection once',async()=>{
 const seq=[];const c={query:async(s)=>{seq.push(s);return {rows:[]}},release:()=>seq.push('release')};
 await assert.rejects(pgTransactions({connect:async()=>c})('a',xri,async q=>{await q('SELECT 1');throw Error('stop');}));
 assert(seq.some(s=>s.includes('pg_advisory_xact_lock')));assert.deepEqual(seq.slice(-2),['ROLLBACK','release']);
});

test('a receipt is not a reply: verify threaded outbound ID, destination, and customer; replay adds no evidence row',async t=>{
 const f=fixture(t),a=await f.desk.issue(viewer(),request());await f.desk.dispatch(tenant,xri,a.quoteId);
 assert.equal(f.raw().prepare('SELECT COUNT(*) AS n FROM qd_replies').get().n,0);
 const good={to:TEAM,verifiedFrom:'test@example.invalid',outboundProviderId:'provider-1',threadVerified:true,receiptId:'reply-1'};
 for(const [k,v] of Object.entries({to:'other@example.invalid',verifiedFrom:'other@example.invalid',threadVerified:false,outboundProviderId:'provider-2'})){
  f.setProof({...good,[k]:v});await assert.rejects(f.desk.recordReply(tenant,xri,a.quoteId,{}));
 }
 f.setProof(good);assert.equal(await f.desk.recordReply(tenant,xri,a.quoteId,{}),'reply_verified');await f.desk.recordReply(tenant,xri,a.quoteId,{});
 assert.equal(f.raw().prepare('SELECT COUNT(*) AS n FROM qd_replies').get().n,1);
});

test('existing research mail worker consumes an opaque committed job once and returns the stored provider receipt',async t=>{
 const {dispatchSharedQuoteJob}=await import('../../../server/research/assisted-order/quote/delivery/shared-worker.mjs');
 const f=fixture(t);await f.desk.issue(viewer(),request());
 const job=f.raw().prepare('SELECT * FROM research_notification_outbox').get();job.payload=JSON.parse(job.payload);
 assert.deepEqual(Object.keys(job.payload).sort(),['quoteId','tenant','xriId']);
 assert.equal((await dispatchSharedQuoteJob(job,f.desk)).providerId,'provider-1');
 assert.equal((await dispatchSharedQuoteJob(job,f.desk)).providerId,'provider-1');assert.equal(f.history.length,1);
 assert.equal((await dispatchSharedQuoteJob({...job,event_key:'other'},f.desk)).ok,false);
});
test('shared enqueue failure rolls back the new quote, receipt and private intent atomically',async t=>{
 const f=fixture(t);f.fail('INSERT INTO public.research_notification_outbox');await assert.rejects(f.desk.issue(viewer(),request()));
 assert.equal(f.raw().prepare('SELECT COUNT(*) n FROM qd_notification_intents').get().n,0);
 assert.equal(f.raw().prepare('SELECT COUNT(*) n FROM qd_quotes').get().n,0);
});
