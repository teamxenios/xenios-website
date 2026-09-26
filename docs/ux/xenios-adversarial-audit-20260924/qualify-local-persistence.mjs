// Dedicated synthetic fixture only. Restarts only its exact database container.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const keys=JSON.parse(readFileSync(process.argv[2],'utf8'));
const origin='http://127.0.0.1:56321';assert.equal(keys.API_URL,origin);
const headers={apikey:keys.SERVICE_ROLE_KEY,authorization:'Bearer '+keys.SERVICE_ROLE_KEY};
async function read(path){const r=await fetch(origin+path,{headers,redirect:'error'});assert.equal(r.status,200);return r.json();}
async function snapshot(){const result={};for(const table of ['research_members','research_notification_outbox','research_resource_deliveries'])result[table]=(await read('/rest/v1/'+table+'?select=id&order=id')).map(r=>r.id);const versions=await read('/rest/v1/research_resource_versions?select=storage_key,sha256&state=eq.published');assert.equal(versions.length,1);const r=await fetch(origin+'/storage/v1/object/research-resource-library/'+versions[0].storage_key,{headers,redirect:'error'});assert.equal(r.status,200);const hash=createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');assert.equal(hash,versions[0].sha256);result.privateBytesSha256=hash;return result;}
const before=await snapshot();
execFileSync('docker',['restart','supabase_db_xenios-audit-local-services-20260926'],{stdio:'pipe'});
let after;for(let i=0;i<30;i++){try{after=await snapshot();break;}catch{await new Promise(r=>setTimeout(r,1000));}}
assert.ok(after,'Local database did not recover');assert.deepEqual(after,before);
const receipt={status:'PASS',observedAt:new Date().toISOString(),provenance:'Actual local Docker database restart and real REST/Storage reads',cases:['Approved member records survive restart','Notification intent records survive restart','Delivery audit records survive restart','Private object bytes still match canonical digest'],counts:Object.fromEntries(Object.entries(before).map(([k,v])=>[k,Array.isArray(v)?v.length:v])),productionMutated:false,externalDelivery:false};
writeFileSync(new URL('./evidence/closeout-local-persistence.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
