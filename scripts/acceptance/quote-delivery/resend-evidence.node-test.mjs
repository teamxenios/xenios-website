import assert from 'node:assert/strict';import {test} from 'node:test';import {createHmac} from 'node:crypto';import {readFileSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';
import {createResendReceipts,signedQuoteReceiptVerifier,attachResendReceiptDoor} from '../../../server/research/assisted-order/quote/delivery/signed-receipts.mjs';
import {makePrivateQuoteDesk} from '../../../server/research/assisted-order/quote/delivery/workflow.mjs';
const vector=JSON.parse(readFileSync(new URL('./reference-signature.json',import.meta.url)));
const key=Buffer.alloc(32,55), raw=Buffer.from(vector.raw),pid=JSON.parse(vector.raw).data.email_id,tenant='synthetic-tenant';
const H=(eid,ts,sig)=>['svix-id',eid,'svix-timestamp',String(ts),'svix-signature',sig];
const verify=(t=vector.ts,secrets=[vector.secret])=>signedQuoteReceiptVerifier({secrets,tagKey:key,now:()=>t*1000});
const verifyv=verify();
function signed(eid,type='email.delivered',mutate=(d)=>{},t=vector.ts){
 const event=JSON.parse(vector.raw);event.type=type;mutate(event.data);const bytes=Buffer.from(JSON.stringify(event));
 const sig='v1,'+createHmac('sha256',Buffer.from(vector.secret.slice(6),'base64')).update(eid+'.'+t+'.').update(bytes).digest('base64');
 return [bytes,H(eid,t,sig)];
}
test('independent Standard Webhooks reference vector: raw UTF-8 and scoped outcome; previous/next key overlap supported',()=>{
 const h=H(vector.eid,vector.ts,vector.signature);assert.equal(verifyv(raw,h).pid,pid);
 const other='whsec_'+Buffer.alloc(32,45).toString('base64');assert.equal(verify(vector.ts,[other,vector.secret])(raw,h).kind,'delivered');
 assert.throws(()=>verify(vector.ts,[other])(raw,h));assert.equal(verifyv(raw,H(vector.eid,vector.ts,'v2,unsupported '+vector.signature)).eid,vector.eid);
});
test('altered bytes, altered timestamp/message ID, reserialization, duplicate or missing headers and large inputs fail',()=>{
 const h=H(vector.eid,vector.ts,vector.signature);
 for(const [bytes,headers] of [[Buffer.concat([raw,Buffer.from(' ')]),h],[raw,H('msg_other',vector.ts,vector.signature)],[raw,H(vector.eid,vector.ts+1,vector.signature)],
 [Buffer.from(JSON.stringify(JSON.parse(raw),null,2)),h],[raw,[...h,'Svix-Id',vector.eid]],[raw,h.slice(0,4)],[raw,H(vector.eid,vector.ts,'v1,garbage')],[Buffer.alloc(65537),h],[JSON.parse(raw),h]])assert.throws(()=>verifyv(bytes,headers));
});
test('signed timestamp has symmetric five-minute freshness; optional payload event timestamp is not the replay clock',()=>{
 const h=H(vector.eid,vector.ts,vector.signature);
 for(const delta of [-301,301])assert.throws(()=>verify(vector.ts+delta)(raw,h));for(const delta of [-300,300])assert(verify(vector.ts+delta)(raw,h));
});
test('signed unrelated traffic including inbound email is ignored, malformed payload rejected; personal contents never returned',()=>{
 for(const [bytes,h] of [signed('evt','email.received'),signed('evt','email.sent',d=>d.from='other@example.invalid'),signed('evt','email.sent',d=>d.subject='another')])
   assert.equal(verifyv(bytes,h),null);
 for(const [b,h] of [signed('evt','email.sent',d=>d.to=['one@example.invalid','two@example.invalid']),signed('evt','email.delivered',d=>d.email_id='not-an-id')])assert.throws(()=>verifyv(b,h));
 assert.deepEqual(Object.keys(verifyv(raw,H(vector.eid,vector.ts,vector.signature))).sort(),['addressTag','digest','eid','kind','pid']);
});
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 const schema=readFileSync(new URL('../../../server/research/assisted-order/quote/delivery/tables.sql',import.meta.url),'utf8');
 db.exec(schema);db.exec("CREATE TABLE research_notification_outbox(event_key TEXT PRIMARY KEY,template_key TEXT,event_type TEXT,recipient TEXT)");
 const rr=readFileSync(new URL('../../../server/research/assisted-order/quote/delivery/verified-receipts.sql',import.meta.url),'utf8');
 db.exec(rr.slice(0,rr.indexOf('ALTER TABLE')).replace('timestamptz NOT NULL DEFAULT now()','TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP'));
 let tail=Promise.resolve(),failInsert=false;const tx=(t,x,cb)=>{const task=tail.then(async()=>{
 db.exec('BEGIN IMMEDIATE');try{ const v=await cb(async(sql,params=[])=>{if(failInsert && sql.startsWith('INSERT INTO qd_events'))throw Error('synthetic storage interruption');
 const vals=[],s=sql.replace('public.research_notification_outbox','research_notification_outbox').replace(/\$(\d+)/g,(_,i)=>{vals.push(params[i-1]);return '?';});return db.prepare(s).all(...vals);});db.exec('COMMIT');return v;
 }catch(e){db.exec('ROLLBACK');throw e;}});tail=task.catch(()=>{});return task;};
 const quoteId='quote-a',xriId='xri-a',ek='qd-'+createHmac('sha256',key).update(JSON.stringify(['delivery',[tenant,xriId,quoteId]])).digest('hex');
 db.prepare("INSERT INTO qd_quotes VALUES(?,?,?,?,?,1,'issued','{}')").run(tenant,quoteId,'target',xriId,'seller');
 db.prepare("INSERT INTO qd_notification_intents VALUES(?,?,?,?,?,?,'attempting',NULL)").run(tenant,quoteId,xriId,'private-tag','private-bind','staff');
 db.prepare('INSERT INTO research_notification_outbox VALUES(?,?,?,?)').run(ek,'ea_private_quote_notice_v1','ea_private_quote_notice_v1','verified@example.invalid');
 const impl=createResendReceipts({tenant,transact:tx,verifier:verifyv,tagKey:key});
 const desk=makePrivateQuoteDesk({transact:tx,authority:{verifiedDispatchEvidence:impl.verifiedDispatchEvidence},tagKey:key});
 const receive=(...args)=>impl.receive(...args,desk.reconcile);
 return {db,impl,receive,desk,ack:()=>db.prepare("UPDATE qd_notification_intents SET state='accepted',provider_id=? WHERE id=?").run(pid,quoteId),
   state:()=>db.prepare('SELECT state FROM qd_notification_intents').get().state,fail:b=>failInsert=b};
}
test('forged event cannot burn its ID; duplicate is idempotent; signed different bytes with same ID conflicts',async t=>{
 const f=fixture(t);f.ack();const [b,h]=signed('evt1');
 assert.equal((await f.receive(Buffer.from('{}'),h)).status,400);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM qd_verified_receipts').get().n,0);
 assert.equal((await f.receive(b,h)).status,204);assert.equal((await f.receive(b,h)).status,204);assert.equal(f.state(),'delivered');
 assert.equal((await f.receive(...signed('evt1','email.bounced'))).status,409);assert.equal(f.state(),'delivered');
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM qd_events').get().n,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM qd_replies').get().n,0);
});
test('delivery before send ACK is held, bound by exact provider ID afterwards; unbound ID stays pending',async t=>{
 const f=fixture(t);await f.receive(...signed('early'));assert.equal(f.state(),'attempting');
 await f.receive(...signed('unknown','email.delivered',d=>d.email_id='a2345678-1234-1234-1234-123456789012'));f.ack();
 assert.equal(await f.impl.drainAfterAck(pid,f.desk.reconcile),1);assert.equal(f.state(),'delivered');
 assert.equal(f.db.prepare("SELECT disposition FROM qd_verified_receipts WHERE eid='unknown'").get().disposition,'pending');
});
test('provider UUID match alone insufficient: wrong actual destination, tenant or quote cannot attach verified evidence',async t=>{
 const f=fixture(t);f.ack();await f.receive(...signed('wrong-to','email.delivered',d=>d.to=['other@example.invalid']));
 assert.equal(f.state(),'accepted');assert.equal(f.db.prepare("SELECT disposition FROM qd_verified_receipts WHERE eid='wrong-to'").get().disposition,'conflict');
 await assert.rejects(f.desk.reconcile('different','xri-a','quote-a',{receiptId:'wrong-to'}));await assert.rejects(f.desk.reconcile(tenant,'xri-a','other',{receiptId:'wrong-to'}));
});
test('late acceptance does not downgrade terminal outcome; opposite terminal event is retained for review',async t=>{
 const f=fixture(t);f.ack();await f.receive(...signed('bounce','email.bounced'));await f.receive(...signed('late','email.sent'));
 assert.equal(f.state(),'bounced');await f.receive(...signed('opposed','email.delivered'));assert.equal(f.state(),'bounced');
 assert.equal(f.db.prepare("SELECT disposition FROM qd_verified_receipts WHERE eid='opposed'").get().disposition,'conflict');
});
test('internal storage error retains pending receipt; next signed retry atomically applies the still-missing effect',async t=>{
 const f=fixture(t);f.ack();f.fail(true);assert.equal((await f.receive(...signed('retry'))).status,503);
 assert.equal(f.state(),'accepted');assert.equal(f.db.prepare("SELECT disposition FROM qd_verified_receipts WHERE eid='retry'").get().disposition,'pending');
 f.fail(false);assert.equal((await f.receive(...signed('retry'))).status,204);assert.equal(f.state(),'delivered');
});
test('mounted Express raw-body door accepts actual signed HTTP bytes only, rejects pre-parsed or oversized inputs, no echo',async t=>{
 const {createRequire}=await import('node:module'),{resolve}=await import('node:path');
 const dep=createRequire(resolve(process.env.QD_DEPENDENCY_REPO??process.cwd(),'package.json'));
 const express=dep('express'),request=dep('supertest');const f=fixture(t);f.ack();const app=express();
 const mount=a=>attachResendReceiptDoor(a,{raw:express.raw,receipts:f.impl,reconcile:f.desk.reconcile});
 mount(app);
 const call=(a,b,h)=>{let r=request(a).post('/api/webhooks/early-access/quote-delivery').set('Content-Type','application/json');for(let i=0;i<h.length;i+=2)r=r.set(h[i],h[i+1]);return r.send(b.toString());};
 const [b,h]=signed('mounted');const resp=await call(app,b,h);assert.equal(resp.status,204);assert.equal(resp.text,'');assert.equal(f.state(),'delivered');
 assert.equal((await call(app,Buffer.from(' '+b.toString()),h)).status,400);
 const wrong=express();wrong.use(express.json());mount(wrong);assert.equal((await call(wrong,b,h)).status,400);
 assert.equal((await request(app).post('/api/webhooks/early-access/quote-delivery').type('text').send('test')).status,415);
 assert.equal((await request(app).post('/api/webhooks/early-access/quote-delivery').type('application/json').send('x'.repeat(70*1024))).status,413);
});
