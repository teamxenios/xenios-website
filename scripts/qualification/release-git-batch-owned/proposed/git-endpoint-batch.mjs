// PRIVATE SOURCE-ONLY PROPOSAL. No top-level subprocesses or cross-call cache.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {TextDecoder} from 'node:util';

const OID=/^[a-f0-9]{40}$/, SHA=/^[a-f0-9]{64}$/;
const MAX_PATHS=96, MAX_PATH_BYTES=1024, MAX_ARGUMENT_UNITS=16000;
const MAX_BLOB_BYTES=4000000, MAX_TOTAL_BYTES=64000000;
const MAX_BATCH_BYTES=8000000, MAX_COMMIT_BYTES=262144;
const HEADER_BYTES=128, TOTAL_MS=90000, PROCESS_MS=30000;
const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');

function pathName(p){
 assert(typeof p==='string'&&p.length>0&&!/[\x00-\x1f\x7f\\:]/.test(p));
 assert(!p.startsWith('/')&&!p.endsWith('/')&&!p.split('/').some(x=>x===''||x==='.'||x==='..'));
 const raw=Buffer.from(p,'utf8');assert(raw.length<=MAX_PATH_BYTES);
 assert.equal(utf8.decode(raw),p);return p;
}

// Exported pure parsers are only for future owned malformed-transport controls.
// Neither parser can invoke Git, resolve refs, or authorize an application action.
export function parseTreeResponse(output,requested){
 assert(Buffer.isBuffer(output)&&Array.isArray(requested)&&requested.length>0&&requested.length<=MAX_PATHS);
 const wanted=new Set(requested.map(pathName));assert.equal(wanted.size,requested.length);
 assert(output.length<=requested.length*(MAX_PATH_BYTES+80));
 const rows=new Map();let offset=0;
 while(offset<output.length){
  const end=output.indexOf(0,offset);assert(end>=offset&&end-offset<=MAX_PATH_BYTES+80);
  const row=utf8.decode(output.subarray(offset,end));
  const match=/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(row);assert(match);
  const name=pathName(match[3]);assert(wanted.has(name)&&!rows.has(name));
  rows.set(name,Object.freeze({mode:match[1],blob:match[2]}));offset=end+1;
 }
 assert.equal(offset,output.length);assert.equal(rows.size,wanted.size);
 for(const name of wanted)assert(rows.has(name));return rows;
}

export function parseObjectResponse(output,requests,type,maxBodyBytes){
 assert(Buffer.isBuffer(output)&&Array.isArray(requests)&&requests.length>0&&requests.length<=MAX_PATHS+1);
 assert(type==='commit'||type==='blob');
 assert(Number.isSafeInteger(maxBodyBytes)&&maxBodyBytes>=0&&maxBodyBytes<=MAX_BATCH_BYTES);
 assert(output.length<=maxBodyBytes+requests.length*(HEADER_BYTES+1));
 assert.equal(new Set(requests.map(x=>x.oid)).size,requests.length);
 const bodies=new Map();let offset=0,total=0;
 for(const request of requests){
  assert(request&&OID.test(request.oid));
  const end=output.indexOf(10,offset);assert(end>=offset&&end-offset<=HEADER_BYTES);
  const header=output.subarray(offset,end);assert(header.every(x=>x>=32&&x<=126));
  const match=/^([a-f0-9]{40}) (commit|blob) (0|[1-9][0-9]*)$/.exec(header.toString('ascii'));assert(match);
  assert.equal(match[1],request.oid);assert.equal(match[2],type);
  const size=Number(match[3]);assert(Number.isSafeInteger(size)&&size>=0);
  assert(size<=(type==='commit'?MAX_COMMIT_BYTES:MAX_BLOB_BYTES));
  if(type==='blob')assert.equal(size,request.bytes);
  total+=size;assert(total<=maxBodyBytes);
  const start=end+1,after=start+size;assert(after<output.length&&output[after]===10);
  const body=output.subarray(start,after);
  const actualOid=crypto.createHash('sha1').update(type+' '+size+'\0','ascii').update(body).digest('hex');
  assert.equal(actualOid,request.oid);bodies.set(request.oid,body);offset=after+1;
 }
 assert.equal(offset,output.length);return bodies;
}

// Every invocation reads exact immutable objects again. Final-fence bindPlan
// calls therefore do not reuse evidence from the earlier preflight.
export function verifyCoverageGit({repo,source,tree,paths}){
 assert(typeof repo==='string'&&repo.length>0&&!/[\x00-\x1f]/.test(repo));
 assert(OID.test(source)&&OID.test(tree));
 assert(Array.isArray(paths)&&paths.length>0&&paths.length<=MAX_PATHS);
 const deadline=performance.now()+TOTAL_MS;
 function git(args,input,maxBuffer){
  const remaining=Math.floor(deadline-performance.now());assert(remaining>0);
  assert(Number.isSafeInteger(maxBuffer)&&maxBuffer>0&&maxBuffer<=MAX_BATCH_BYTES+(MAX_PATHS+1)*(HEADER_BYTES+1));
  let result;
  try{
   result=spawnSync('git',['--no-optional-locks','--no-replace-objects','--no-lazy-fetch','--literal-pathspecs','-C',repo,...args],{
    env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_NO_REPLACE_OBJECTS:'1',GIT_LITERAL_PATHSPECS:'1'},
    shell:false,windowsHide:true,input,stdio:['pipe','pipe','pipe'],
    timeout:Math.min(PROCESS_MS,remaining),maxBuffer,
   });
  }catch{throw new Error('RELEASE_GIT_BATCH_PROCESS_REFUSED');}
  assert(result&&!result.error&&result.status===0&&result.signal===null,'RELEASE_GIT_BATCH_PROCESS_REFUSED');
  assert(Buffer.isBuffer(result.stdout)&&Buffer.isBuffer(result.stderr)&&result.stderr.length===0,'RELEASE_GIT_BATCH_PROCESS_REFUSED');
  assert(result.stdout.length<=maxBuffer&&performance.now()<=deadline,'RELEASE_GIT_BATCH_BOUND_EXCEEDED');
  return result.stdout;
 }
 function batch(requests,type,maxBodyBytes){
  const input=Buffer.from(requests.map(x=>x.oid).join('\n')+'\n','ascii');
  return parseObjectResponse(git(['cat-file','--batch'],input,maxBodyBytes+requests.length*(HEADER_BYTES+1)),requests,type,maxBodyBytes);
 }
 const commits=new Map(),names=new Set(),blobs=new Map();let totalBytes=0;
 function commit(oid,expectedTree){
  assert(OID.test(oid)&&OID.test(expectedTree));
  const existing=commits.get(oid);if(existing){assert.equal(existing.tree,expectedTree);return existing;}
  assert(commits.size<MAX_PATHS+1);const entry={tree:expectedTree,paths:new Set()};commits.set(oid,entry);return entry;
 }
 const current=commit(source,tree);
 for(const x of paths){
  assert(x&&typeof x==='object');
  for(const key of ['path','finalMode','finalBlob','finalGitBytes','finalGitSha256','reviewedSource','reviewedTree','reviewedEndpointMode','reviewedEndpointBlob','exactEndpointConserved'])assert(Object.hasOwn(x,key));
  const name=pathName(x.path);assert(!names.has(name));names.add(name);
  assert(x.exactEndpointConserved===true&&['100644','100755'].includes(x.finalMode));
  assert(OID.test(x.finalBlob)&&SHA.test(x.finalGitSha256));
  assert.equal(x.finalBlob,x.reviewedEndpointBlob);assert.equal(x.finalMode,x.reviewedEndpointMode);
  assert(Number.isSafeInteger(x.finalGitBytes)&&x.finalGitBytes>=0&&x.finalGitBytes<=MAX_BLOB_BYTES);
  current.paths.add(name);commit(x.reviewedSource,x.reviewedTree).paths.add(name);
  const prior=blobs.get(x.finalBlob);
  if(prior){assert.equal(prior.bytes,x.finalGitBytes);assert.equal(prior.sha256,x.finalGitSha256);}
  else{totalBytes+=x.finalGitBytes;assert(totalBytes<=MAX_TOTAL_BYTES);blobs.set(x.finalBlob,{oid:x.finalBlob,bytes:x.finalGitBytes,sha256:x.finalGitSha256});}
 }
 const commitRequests=[...commits.keys()].map(oid=>({oid}));
 // Commit batches have the same absolute body bound as blob batches.
 for(let start=0;start<commitRequests.length;start+=Math.floor(MAX_BATCH_BYTES/MAX_COMMIT_BYTES)){
  const group=commitRequests.slice(start,start+Math.floor(MAX_BATCH_BYTES/MAX_COMMIT_BYTES));
  const bodies=batch(group,'commit',group.length*MAX_COMMIT_BYTES);
  for(const {oid} of group){const body=bodies.get(oid);assert(body.length>=46&&body[45]===10);assert.equal(body.subarray(0,45).toString('ascii'),'tree '+commits.get(oid).tree);}
 }
 const trees=new Map();
 for(const [oid,entry] of commits){
  const requested=[...entry.paths];assert(requested.length>0&&requested.length<=MAX_PATHS);
  assert(requested.reduce((sum,p)=>sum+p.length+4,0)<=MAX_ARGUMENT_UNITS);
  const output=git(['ls-tree','-z','--full-tree',oid,'--',...requested],undefined,requested.length*(MAX_PATH_BYTES+80));
  trees.set(oid,parseTreeResponse(output,requested));
 }
 for(const x of paths)for(const oid of new Set([source,x.reviewedSource])){
  const actual=trees.get(oid).get(x.path);assert(actual);assert.equal(actual.mode,x.finalMode);assert.equal(actual.blob,x.finalBlob);
 }
 let group=[],groupBytes=0,verifiedBlobs=0;
 function verifyGroup(){
  if(group.length===0)return;const bodies=batch(group,'blob',groupBytes);
  for(const item of group){const body=bodies.get(item.oid);assert.equal(body.length,item.bytes);assert.equal(digest(body),item.sha256);verifiedBlobs++;}
  group=[];groupBytes=0;
 }
 for(const item of blobs.values()){
  if(groupBytes+item.bytes>MAX_BATCH_BYTES)verifyGroup();group.push(item);groupBytes+=item.bytes;
 }
 verifyGroup();assert.equal(verifiedBlobs,blobs.size);assert.equal(names.size,paths.length);assert(performance.now()<=deadline);
 return Object.freeze({pathCount:paths.length,commitCount:commits.size,blobCount:blobs.size,fullRawBytesVerified:totalBytes,cache:'NONE'});
}
