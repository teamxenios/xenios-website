// Unix-socket-only disposable PG. Creates one NEW random DB; never targets an app DB.
import {readFileSync, statSync} from 'node:fs';import {resolve} from 'node:path';
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';import assert from 'node:assert/strict';
import {pgTransactions} from '../../../server/research/assisted-order/quote/delivery/pg.mjs';
import {makePrivateQuoteDesk} from '../../../server/research/assisted-order/quote/delivery/workflow.mjs';
import {key,xri,s,tenant,now,viewer,customer,ctx,request} from './synthetic.mjs';
const base=resolve(process.env.EA_REPO??process.cwd());
const {AssistedOrderQuoteService:Engine}=await import(pathToFileURL(resolve(base,'server/research/assisted-order/quote/service.ts')));
const {bindReviewedXriQuoteLines:bind}=await import(pathToFileURL(resolve(base,'server/research/assisted-order/quote/xri-line-bindings.ts')));
let pool,cleanup,engineVersion;
if(process.env.QD_TEST_ENGINE==='pglite'){
 const {PGlite}=createRequire(resolve(process.env.QD_PGLITE_ROOT??process.cwd(),'package.json'))('@electric-sql/pglite');
 const db=await PGlite.create();let queue=Promise.resolve();
 pool={connect:async()=>{const old=queue;let done;queue=new Promise(r=>done=r);await old;return {query:async(sql,params)=>sql.includes("CREATE POLICY tenant_isolation")?db.exec(sql):sql.trim().split(';').length>2&&!params?db.exec(sql):db.query(sql,params),release:done};}};
 cleanup=()=>db.close();engineVersion='PGlite '+(await db.query('select version() as v')).rows[0].v;
}else{
 const socket=process.env.QD_TEST_PG_SOCKET, port=Number(process.env.QD_TEST_PG_PORT), user=process.env.QD_TEST_PG_USER??'postgres';
const localMode=process.env.QD_SANDBOX_LOOPBACK==='1';
if(localMode){if(port!==56419 || user!=='ea_synthetic')throw Error('Sandbox port/role mismatch.');}
else if(!socket?.startsWith('/')||!statSync(socket).isDirectory()||!Number.isInteger(port)||port<1||port>65535||!/^\w{1,40}$/.test(user))throw Error('Require disposable local socket directory, port, and local test user.');
const dep=resolve(process.env.QD_DEPENDENCY_REPO??process.cwd());
const {Pool}=createRequire(resolve(dep,'package.json'))('pg');
 const opts={host:localMode?'127.0.0.1':socket,port,user,password:localMode?readFileSync(resolve(process.env.QD_TEST_PRIVATE_PG_DIR,'local-auth'),'utf8').trim():'',ssl:false,connectionTimeoutMillis:4000};
 const admin=new Pool({...opts,database:'postgres'}),name='qd_test_'+randomBytes(8).toString('hex');
 try{const v=await admin.query("SELECT host(inet_server_addr()) AS ip,version() AS v,current_setting('data_directory') AS dir");assert.equal(v.rows[0].ip,localMode?'127.0.0.1':null);if(localMode)assert(v.rows[0].dir.startsWith(resolve(process.env.QD_TEST_PRIVATE_PG_DIR)+'/')||v.rows[0].dir===resolve(process.env.QD_TEST_PRIVATE_PG_DIR));engineVersion=v.rows[0].v;
   await admin.query('CREATE DATABASE '+name);
 }catch(e){await admin.end();throw e;}
 pool=new Pool({...opts,database:name,max:6});
 cleanup=async()=>{await pool.end();try{await admin.query('DROP DATABASE '+name);}finally{await admin.end();}};
}
try {
 console.log('Disposable engine:',engineVersion);
 const c=await pool.connect();try{await c.query('CREATE TABLE public.research_notification_outbox(event_key TEXT PRIMARY KEY,event_type TEXT NOT NULL,template_key TEXT NOT NULL, recipient TEXT NOT NULL,payload JSONB NOT NULL)');await c.query('CREATE SCHEMA quote_delivery_private');await c.query('SET search_path TO quote_delivery_private,pg_catalog');
 for(const file of ['tables','private-pg'])await c.query(readFileSync(new URL('../../../server/research/assisted-order/quote/delivery/'+file+'.sql',import.meta.url),'utf8'));}finally{c.release();}
 const state=ctx();let evidence=null,fail=false,sent=0,keyUsed='';
 const authority={forIssue:async()=>state,forCustomer:async()=>state,forDispatch:async()=>state,verifiedDispatchEvidence:async()=>evidence,verifiedReplyEvidence:async()=>evidence};
 const realTx=pgTransactions(pool);
 const transact=(a,b,cb)=>realTx(a,b,q=>cb(async(sql,args)=>{
   if(fail&&sql.startsWith('INSERT INTO qd_notification_intents'))throw Error('Fault injected');return q(sql,args);}));
 const f=makePrivateQuoteDesk({transact,authority,Engine,bind,tagKey:key,clock:()=>new Date(now),uuid:randomUUID,
  transport:{ready:()=>true,send:async(k,recipient)=>{assert.equal(recipient,state.contact.email);sent++;keyUsed=k;return 'pg-test-provider';}}});
 const rs=await Promise.all(Array.from({length:8},()=>f.issue(viewer(),request())));
 assert.equal(new Set(rs.map(x=>x.quoteId)).size,1);assert.equal(rs.filter(x=>!x.replay).length,1);
 const old=rs[0].quoteId;fail=true;await assert.rejects(f.issue(viewer(),request({expectedVersion:1,attempt:'v2'})),/Fault injected/);fail=false;
 assert.equal((await f.privateForCustomer(customer(),xri,s))[0].quoteId,old);const newer=await f.issue(viewer(),request({expectedVersion:1,attempt:'v2'}));
 const rows=await f.privateForCustomer(customer(),xri,s);assert.equal(rows.length,1);assert.equal(rows[0].totalCents,2550);assert.equal(rows[0].quoteId,newer.quoteId);
 await assert.rejects(f.privateForCustomer(customer({earlyAccessSessionHash:'other'}),xri,s));
 assert.equal(await f.dispatch(tenant,xri,old),'suppressed');
 const delivery=await Promise.all(Array.from({length:8},()=>f.dispatch(tenant,xri,newer.quoteId)));assert.equal(sent,1);
 assert(delivery.every(x=>x==='attempting'||x==='accepted'));
 evidence={eventId:'pg-evt-1',providerId:'pg-test-provider',state:'delivered',deliveryKey:keyUsed};
 assert.equal(await f.reconcile(tenant,xri,newer.quoteId,{}),'delivered');
 evidence={to:'team@xeniostechnology.com',verifiedFrom:state.contact.email,outboundProviderId:'pg-test-provider',threadVerified:true,receiptId:'pg-reply-1'};
 assert.equal(await f.recordReply(tenant,xri,newer.quoteId,{}),'reply_verified');
 console.log('PASS: 8 simultaneous issuance calls -> 1 persisted quote; rollback after supersession preserved v1; v2 visible only to owner; 8 dispatches -> 1 mock notice; delivered+threaded reply evidence recorded.');
}finally{await cleanup();}
