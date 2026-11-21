// PRIVATE AUTHORING ONLY: SOURCE_ONLY_UNRUN. Uses built-ins and owned temp Git.
// Never imports release-policy, merge/deploy tools, current bindings or APIs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess,{spawnSync as esmSpawnSync} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {performance} from 'node:perf_hooks';

const HELPER_SHA='4cbe3b46d90e358c6addffa376a2afca5f675ec4820f2de2219e4a7d7c703eef';
const HELPER_URL=new URL('../proposed/git-endpoint-batch.mjs',import.meta.url);
const SHA1=/^[a-f0-9]{40}$/;
const originalSpawn=childProcess.spawnSync;
const now=performance.now.bind(performance);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const objectOid=(type,body)=>crypto.createHash('sha1').update(type+' '+body.length+'\0','ascii').update(body).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
const objectFrame=(type,body,oid=objectOid(type,body))=>Buffer.concat([Buffer.from(`${oid} ${type} ${body.length}\n`,'ascii'),body,Buffer.from('\n')]);
const blobRequest=body=>({oid:objectOid('blob',body),bytes:body.length});
const record=(name,oid,mode='100644')=>Buffer.from(`${mode} blob ${oid}\t${name}\0`,'utf8');
const booleanRefusal=action=>assert.throws(action,error=>error.code==='ERR_ASSERTION'&&error.actual===false&&error.expected===true);

function ownedPath(root,relative){
 assert(typeof relative==='string'&&!path.isAbsolute(relative)&&relative.length>0);
 assert(!relative.split(/[\\/]/).some(x=>x===''||x==='.'||x==='..'));
 const result=path.resolve(root,relative),rel=path.relative(root,result);
 assert(rel.length>0&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));return result;
}

function safeEnvironment(root){
 // This is a dedicated future test process. Do not pass caller credentials,
 // proxies, Git config injection, trace sinks or provider tokens to child Git.
 const previous={...process.env},safe={};
 for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','PATHEXT','ComSpec','TEMP','TMP','TMPDIR','LANG','LC_ALL'])if(previous[key]!==undefined)safe[key]=previous[key];
 fs.writeFileSync(ownedPath(root,'empty-global-config'),'');
 Object.assign(safe,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:ownedPath(root,'empty-global-config'),GIT_TERMINAL_PROMPT:'0',GIT_ALLOW_PROTOCOL:'file',GIT_OPTIONAL_LOCKS:'0'});
 for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,safe);
 return ()=>{for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,previous);};
}

function withSpawn(interceptor,body){
 assert.equal(childProcess.spawnSync,originalSpawn);
 childProcess.spawnSync=interceptor;syncBuiltinESMExports();
 try{return body();}finally{childProcess.spawnSync=originalSpawn;syncBuiltinESMExports();assert.equal(childProcess.spawnSync,originalSpawn);}
}

test('owned Git batching qualification; no release/application actions',{timeout:240000,concurrency:false},async t=>{
 assert.equal(process.versions.node,'20.19.0','Pinned Node20.19.0 is required; do not waive.');
 assert.equal(sha(fs.readFileSync(HELPER_URL)),HELPER_SHA);
 const tempParent=fs.realpathSync(os.tmpdir());
 const root=fs.mkdtempSync(path.join(tempParent,'xenios-git-batch-owned-'));
 assert.equal(path.dirname(fs.realpathSync(root)),tempParent);assert(!fs.lstatSync(root).isSymbolicLink());
 let restoreEnvironment=()=>{};const deadline=now()+210000;
 let liveCases=0;
 try{
  restoreEnvironment=safeEnvironment(root);
  const helper=await import(HELPER_URL.href);
  const {parseTreeResponse,parseObjectResponse,verifyCoverageGit}=helper;
  function remaining(){const value=Math.floor(deadline-now());assert(value>0,'Owned harness absolute budget exhausted');return value;}
  function fixtureGit(repo,args,input){
   const rel=path.relative(root,repo);assert(rel!==''&&!rel.startsWith('..')&&!path.isAbsolute(rel));
   assert(['init','config','add','update-index','commit','rev-parse','ls-tree','cat-file','replace'].includes(args[0]));
   const r=originalSpawn('git',['--no-optional-locks','-C',repo,...args],{
    env:{...process.env},shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],input,
    timeout:Math.min(10000,remaining()),maxBuffer:12000000,
   });
   assert(!r.error&&r.status===0&&r.signal===null,'Owned Git fixture command failed');
   assert(Buffer.isBuffer(r.stdout));return r.stdout;
  }
  function fixtureRepo(relative,files){
   const repo=ownedPath(root,relative);fs.mkdirSync(repo);
   fixtureGit(repo,['init','--quiet','--object-format=sha1']);
   const hooks=ownedPath(root,'empty-hooks');fs.mkdirSync(hooks,{recursive:true});
   for(const [key,value]of [['user.name','Owned synthetic Git fixture'],['user.email','owned-git-fixture@invalid.example'],['core.autocrlf','false'],['core.safecrlf','false'],['core.hooksPath',hooks],['commit.gpgsign','false'],['gc.auto','0'],['maintenance.auto','false']])fixtureGit(repo,['config','--local',key,value]);
   for(const [name,body]of files){const file=ownedPath(repo,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);}
   fixtureGit(repo,['add','--all']);
   if(files.has('bin/tool.sh'))fixtureGit(repo,['update-index','--chmod=+x','--','bin/tool.sh']);
   fixtureGit(repo,['commit','--quiet','-m','Owned synthetic fixture one']);
   return repo;
  }
  function commitIdentity(repo,revision){
   const commit=fixtureGit(repo,['rev-parse',revision]).toString('ascii').trim();assert(SHA1.test(commit));
   const tree=fixtureGit(repo,['rev-parse',commit+'^{tree}']).toString('ascii').trim();assert(SHA1.test(tree));
   const body=fixtureGit(repo,['cat-file','commit',commit]);assert.equal(objectOid('commit',body),commit);
   assert.equal(body.subarray(0,46).toString('ascii'),'tree '+tree+'\n');return {commit,tree,body};
  }
  function endpoint(repo,source,reviewed,name,expectedBody,expectedMode='100644'){
   const row=fixtureGit(repo,['ls-tree','-z','--full-tree',source.commit,'--',name]);
   const match=/^(100644|100755) blob ([a-f0-9]{40})\t([^\0]+)\0$/u.exec(row.toString('utf8'));assert(match);
   assert.equal(match[1],expectedMode);assert.equal(match[3],name);
   const raw=fixtureGit(repo,['cat-file','blob',match[2]]);assert.deepEqual(raw,expectedBody);
   assert.equal(objectOid('blob',raw),match[2]);
   return {path:name,finalMode:expectedMode,finalBlob:match[2],finalGitBytes:raw.length,finalGitSha256:sha(raw),reviewedSource:reviewed.commit,reviewedTree:reviewed.tree,reviewedEndpointMode:expectedMode,reviewedEndpointBlob:match[2],exactEndpointConserved:true};
  }
  const binary=Buffer.from('00610aff0d0a','hex');
  const files=new Map([
   ['nested/ascii.txt',Buffer.from('Owned ASCII fixture\n')],['nested/raw.bin',binary],['nested/shared.bin',binary],
   ['nested/café-測試.txt',Buffer.from('Owned UTF-8 fixture\n')],['nested/literal[ab].txt',Buffer.from('literal brackets\n')],
   ['bin/tool.sh',Buffer.from('#!/bin/sh\n# Never executed by these tests.\n')],['nested/empty',Buffer.alloc(0)],
  ]);
  const repo=fixtureRepo('primary',files),first=commitIdentity(repo,'HEAD');
  fs.writeFileSync(ownedPath(repo,'unselected.txt'),'Only this file differs in commit two.\n');fixtureGit(repo,['add','--','unselected.txt']);fixtureGit(repo,['commit','--quiet','-m','Owned synthetic fixture two']);
  const second=commitIdentity(repo,'HEAD');
  const parentHeader=second.body.subarray(0,second.body.indexOf(Buffer.from('\n\n'))).toString('ascii').split('\n').filter(line=>line.startsWith('parent '));
  assert.deepEqual(parentHeader,['parent '+first.commit]);
  assert.notEqual(first.tree,second.tree);
  const rows=[...files].map(([name,body])=>endpoint(repo,second,first,name,body,name==='bin/tool.sh'?'100755':'100644'));
  const input={repo,source:second.commit,tree:second.tree,paths:rows};
  fs.writeFileSync(ownedPath(repo,'nested/ascii.txt'),'Changed in third commit.\n');fixtureGit(repo,['add','--','nested/ascii.txt']);fixtureGit(repo,['commit','--quiet','-m','Owned synthetic conflicting endpoint']);
  const third=commitIdentity(repo,'HEAD');
  const allowedRepos=new Set([repo]);
  function checkedSpawn(file,args,options){
   assert.equal(file,'git');assert.deepEqual(args.slice(0,5),['--no-optional-locks','--no-replace-objects','--no-lazy-fetch','--literal-pathspecs','-C']);assert(allowedRepos.has(args[5]));
   assert.equal(options.shell,false);assert.equal(options.windowsHide,true);assert.deepEqual(options.stdio,['pipe','pipe','pipe']);
   assert(options.timeout>0&&options.timeout<=30000);assert(options.maxBuffer>0&&options.maxBuffer<=8012513);
   assert.equal(options.env.GIT_NO_REPLACE_OBJECTS,'1');assert.equal(options.env.GIT_LITERAL_PATHSPECS,'1');assert.equal(options.env.GIT_ALLOW_PROTOCOL,'file');
   assert(!args.includes('-r'),'No recursive whole-tree collection');
   assert(args[6]==='cat-file'||args[6]==='ls-tree');
   return originalSpawn(file,args,{...options,timeout:Math.min(options.timeout,10000,remaining())});
  }
  async function run(id,title,body){remaining();await t.test(id+' '+title,{concurrency:false},body);liveCases++;remaining();assert.equal(childProcess.spawnSync,originalSpawn);}
  function refuseBeforeProcess(candidate){let calls=0;withSpawn(()=>{calls++;throw new Error('Unexpected child call');},()=>assert.throws(()=>verifyCoverageGit(candidate)));assert.equal(calls,0);}

  await run('G01','actual two-commit binary, UTF-8, executable, shared and empty blobs',()=>{
   const seen=[];const result=withSpawn((...args)=>{seen.push(args);return checkedSpawn(...args);},()=>verifyCoverageGit(clone(input)));
   assert.deepEqual(result,{pathCount:7,commitCount:2,blobCount:6,fullRawBytesVerified:[...new Map(rows.map(r=>[r.finalBlob,r.finalGitBytes])).values()].reduce((a,b)=>a+b,0),cache:'NONE'});
   assert.equal(seen.length,4);assert.equal(seen.filter(x=>x[1][6]==='ls-tree').length,2);
  });
  await run('G02','repeat reads ignore dirty worktree and moved HEAD without caching',()=>{
   fs.writeFileSync(ownedPath(repo,'nested/ascii.txt'),'Dirty uncommitted bytes.\n');let calls=0;
   withSpawn((...args)=>{calls++;return checkedSpawn(...args);},()=>{verifyCoverageGit(clone(input));verifyCoverageGit(clone(input));});assert.equal(calls,8);
  });
  await run('G03','different actual reviewed blob refuses with source descriptor unchanged',()=>{
   const candidate=clone(input);candidate.paths[0].reviewedSource=third.commit;candidate.paths[0].reviewedTree=third.tree;
   withSpawn(checkedSpawn,()=>assert.throws(()=>verifyCoverageGit(candidate)));
  });
  await run('G04','actual selected commit tree mismatch refuses',()=>{
   const candidate=clone(input);candidate.tree=third.tree;withSpawn(checkedSpawn,()=>assert.throws(()=>verifyCoverageGit(candidate)));
  });
  await run('G05','actual regular/executable mode mismatch refuses',()=>{
   const candidate=clone(input);candidate.paths[0].finalMode='100755';candidate.paths[0].reviewedEndpointMode='100755';withSpawn(checkedSpawn,()=>assert.throws(()=>verifyCoverageGit(candidate)));
  });
  await run('G06','full raw SHA mismatch refuses after genuine Git bytes',()=>{
   const candidate=clone(input);candidate.paths[0].finalGitSha256='0'.repeat(64);withSpawn(checkedSpawn,()=>assert.throws(()=>verifyCoverageGit(candidate)));
  });
  await run('G07','declared byte-length mismatch refuses genuine batch response',()=>{
   const candidate=clone(input);candidate.paths[0].finalGitBytes++;withSpawn(checkedSpawn,()=>assert.throws(()=>verifyCoverageGit(candidate)));
  });
  await run('G08','missing exact object refuses without a retry or a mutable-ref fallback',()=>{
   const candidate=clone(input);candidate.source='f'.repeat(40);let calls=0;
   withSpawn((...args)=>{calls++;return checkedSpawn(...args);},()=>assert.throws(()=>verifyCoverageGit(candidate)));assert.equal(calls,1);
  });
  await run('G09','real replacement ref cannot substitute another commit tree',()=>{
   fixtureGit(repo,['replace',second.commit,third.commit]);
   try{
    const replaced=fixtureGit(repo,['cat-file','commit',second.commit]);assert.equal(objectOid('commit',replaced),third.commit);
    const result=withSpawn(checkedSpawn,()=>verifyCoverageGit(clone(input)));assert.equal(result.pathCount,7);
   }finally{fixtureGit(repo,['replace','-d',second.commit]);}
  });
  await run('G10','directory selection refuses rather than enumerating descendants',()=>{
   const candidate=clone(input);candidate.paths=[{...candidate.paths[0],path:'nested'}];const commands=[];
   withSpawn((...args)=>{commands.push(args[1]);return checkedSpawn(...args);},()=>assert.throws(()=>verifyCoverageGit(candidate)));
   assert(commands.every(args=>!args.includes('-r')));assert(!commands.some(args=>args.includes('fetch')));
  });
  await run('G11','literal bracket filename and real UTF-8 path retain byte identity',()=>{
   const candidate=clone(input);candidate.paths=candidate.paths.filter(x=>x.path==='nested/literal[ab].txt'||x.path==='nested/café-測試.txt');
   const result=withSpawn(checkedSpawn,()=>verifyCoverageGit(candidate));assert.equal(result.pathCount,2);
  });
  await run('G12','actual nine-megabyte owned blobs cross the batch boundary',()=>{
   const largeFiles=new Map([['large/a.bin',Buffer.alloc(3000000,0x11)],['large/b.bin',Buffer.alloc(3000000,0x22)],['large/c.bin',Buffer.alloc(3000000,0x33)]]);
   const largeRepo=fixtureRepo('multi-batch',largeFiles);allowedRepos.add(largeRepo);const identity=commitIdentity(largeRepo,'HEAD');
   const largeRows=[...largeFiles].map(([name,body])=>endpoint(largeRepo,identity,identity,name,body));let objectBatches=0;
   const result=withSpawn((...args)=>{if(args[1][6]==='cat-file')objectBatches++;return checkedSpawn(...args);},()=>verifyCoverageGit({repo:largeRepo,source:identity.commit,tree:identity.tree,paths:largeRows}));
   assert.equal(result.fullRawBytesVerified,9000000);assert.equal(result.blobCount,3);assert.equal(objectBatches,3,'One commit batch and two real blob batches are required');
  });
  await run('V01','zero, 97 and duplicate path counts refuse before child creation',()=>{
   // The97 rows really exist and differ only by path: duplicate-path refusal
   // cannot stand in for the independent upper-count refusal.
   const countFiles=new Map(Array.from({length:97},(_,i)=>['count/p'+String(i).padStart(2,'0')+'.txt',Buffer.from('Owned count boundary.\n')]));
   const countRepo=fixtureRepo('count-boundary',countFiles);allowedRepos.add(countRepo);const identity=commitIdentity(countRepo,'HEAD');
   const firstName=countFiles.keys().next().value,baseRow=endpoint(countRepo,identity,identity,firstName,countFiles.get(firstName));
   const paths=[...countFiles.keys()].map(name=>({...baseRow,path:name}));assert.equal(new Set(paths.map(x=>x.path)).size,97);
   const countInput={repo:countRepo,source:identity.commit,tree:identity.tree,paths};
   const atLimit=withSpawn(checkedSpawn,()=>verifyCoverageGit({...countInput,paths:paths.slice(0,96)}));assert.equal(atLimit.pathCount,96);
   refuseBeforeProcess(countInput);
   const one=withSpawn(checkedSpawn,()=>verifyCoverageGit({...clone(input),paths:[clone(rows[0])]}));assert.equal(one.pathCount,1);
   const two=withSpawn(checkedSpawn,()=>verifyCoverageGit({...clone(input),paths:clone(rows.slice(0,2))}));assert.equal(two.pathCount,2);
   for(const rejected of [[],[clone(rows[0]),clone(rows[0])]])refuseBeforeProcess({...clone(input),paths:rejected});
  });
  await run('V02','refs, abbreviations and revision expressions refuse before child creation',()=>{
   for(const value of ['HEAD',second.commit.slice(0,12),'refs/heads/main',second.commit+'^{tree}']){
    refuseBeforeProcess({...clone(input),source:value});const candidate=clone(input);candidate.paths[0].reviewedSource=value;refuseBeforeProcess(candidate);
   }
  });
  await run('V03','conflicting tree declarations for one exact reviewed commit refuse',()=>{
   const candidate=clone(input);candidate.paths[1].reviewedTree=third.tree;refuseBeforeProcess(candidate);
  });
  await run('V04','shared blob with inconsistent SHA or length refuses before reading',()=>{
   for(const key of ['finalGitSha256','finalGitBytes']){const candidate=clone(input);const item=candidate.paths.find(x=>x.path==='nested/shared.bin');item[key]=key==='finalGitBytes'?item[key]+1:'a'.repeat(64);refuseBeforeProcess(candidate);}
  });
  await run('V05','control, traversal, absolute and lossy UTF-8 path values refuse',()=>{
   for(const name of ['a\0b','a\tb','a\nb','a\x7fb','a:b','a\\b','/root','../a','a/../b','a//b','a/','\ud800']){const candidate=clone(input);candidate.paths[0].path=name;refuseBeforeProcess(candidate);}
  });
  await run('V06','path-byte and per-blob byte limits refuse before a process',()=>{
   const long=clone(input);long.paths[0].path='x'.repeat(1025);refuseBeforeProcess(long);
   const large=clone(input);large.paths[0].finalGitBytes=4000001;refuseBeforeProcess(large);
  });
  await run('V07','total unique descriptor byte cap refuses without allocating large bodies',()=>{
   const paths=Array.from({length:17},(_,i)=>({...clone(rows[0]),path:'limit/'+i,finalBlob:crypto.createHash('sha1').update('owned descriptor '+i).digest('hex'),reviewedEndpointBlob:crypto.createHash('sha1').update('owned descriptor '+i).digest('hex'),finalGitBytes:4000000}));
   refuseBeforeProcess({...clone(input),paths});
  });
  await run('V08','argument-unit limit refuses before any scoped tree subprocess',()=>{
   const paths=Array.from({length:17},(_,i)=>({...clone(rows[0]),path:String(i).padStart(2,'0')+'x'.repeat(998)}));let calls=0;
   withSpawn((...args)=>{calls++;assert.equal(args[1][6],'cat-file');return checkedSpawn(...args);},()=>assert.throws(()=>verifyCoverageGit({...clone(input),paths})));assert.equal(calls,1);
  });

  const oid=objectOid('blob',binary),treeRow=record('nested/raw.bin',oid);
  await run('T01','strict NUL tree parser accepts two UTF-8 scoped rows',()=>{
   const output=Buffer.concat([treeRow,record('nested/café-測試.txt',oid,'100755')]);const result=parseTreeResponse(output,['nested/raw.bin','nested/café-測試.txt']);assert.equal(result.size,2);assert.equal(result.get('nested/café-測試.txt').mode,'100755');
  });
  await run('T02','missing, duplicate and extra tree rows refuse',()=>{
   for(const output of [Buffer.alloc(0),Buffer.concat([treeRow,treeRow]),Buffer.concat([treeRow,record('extra',oid)])])assert.throws(()=>parseTreeResponse(output,['nested/raw.bin']));
  });
  await run('T03','missing NUL and trailing unframed tree bytes refuse',()=>{
   for(const output of [treeRow.subarray(0,-1),Buffer.concat([treeRow,Buffer.from('x')])])assert.throws(()=>parseTreeResponse(output,['nested/raw.bin']));
  });
  await run('T04','invalid UTF-8 and byte-distinct alternate path refuse',()=>{
   const invalidName=Buffer.from([0xc3,0x28]),replacementName=invalidName.toString('utf8');assert.equal(replacementName,'\ufffd(');
   const positive=parseTreeResponse(record(replacementName,oid),[replacementName]);assert.equal(positive.get(replacementName).blob,oid);
   const bad=Buffer.concat([Buffer.from(`100644 blob ${oid}\t`),invalidName,Buffer.from([0])]);
   assert.throws(()=>parseTreeResponse(bad,[replacementName]),error=>error instanceof TypeError&&error.code==='ERR_ENCODING_INVALID_ENCODED_DATA');
   const alternate='nested/raẃ.bin';assert.equal(parseTreeResponse(record(alternate,oid),[alternate]).size,1);
   assert.equal(parseTreeResponse(treeRow,['nested/raw.bin']).size,1);
   booleanRefusal(()=>parseTreeResponse(record(alternate,oid),['nested/raw.bin']));
  });
  await run('T05','tree, symlink and submodule modes cannot become blob success',()=>{
   for(const [mode,type]of [['040000','tree'],['120000','blob'],['160000','commit']])assert.throws(()=>parseTreeResponse(Buffer.from(`${mode} ${type} ${oid}\tnested/raw.bin\0`),['nested/raw.bin']));
  });
  const requests=[blobRequest(binary)],frame=objectFrame('blob',binary);
  await run('B01','actual object identity and binary NUL, LF, CR and high bytes survive',()=>{
   const actual=parseObjectResponse(frame,requests,'blob',binary.length).get(oid);assert.deepEqual(actual,binary);assert.equal(sha(actual),'11d29a47d80eec7b87afddec1ccae6b919fb8ba199c472ef2889c9e543acaf41');
  });
  await run('B02','wrong OID and wrong object type refuse',()=>{
   const wrongOid=Buffer.concat([Buffer.from(`${'a'.repeat(40)} blob 6\n`),binary,Buffer.from('\n')]);
   const wrongType=Buffer.concat([Buffer.from(`${oid} commit 6\n`),binary,Buffer.from('\n')]);for(const bytes of [wrongOid,wrongType])assert.throws(()=>parseObjectResponse(bytes,requests,'blob',6));
  });
  await run('B03','missing, leading-zero, nonnumeric and oversized headers refuse',()=>{
   for(const header of [`${oid} missing\n`,`${oid} blob 06\n`,`${oid} blob NaN\n`,`${oid} blob 4000001\n`])assert.throws(()=>parseObjectResponse(Buffer.from(header),requests,'blob',6));
  });
  await run('B04','non-ASCII and overlong headers refuse',()=>{
   assert.deepEqual(parseObjectResponse(frame,requests,'blob',6).get(oid),binary);
   const aliased=Buffer.from(frame);aliased[0]|=0x80;
   const headerEnd=frame.indexOf(10);assert.equal(aliased.subarray(0,headerEnd).toString('ascii'),frame.subarray(0,headerEnd).toString('ascii'));
   // Removing strictASCII alone would recover an otherwise valid header/body.
   booleanRefusal(()=>parseObjectResponse(aliased,requests,'blob',6));
   booleanRefusal(()=>parseObjectResponse(Buffer.from('a'.repeat(129)+'\n'),requests,'blob',6));
  });
  await run('B05','body truncation, missing trailer and extra LF or record refuse',()=>{
   for(const bytes of [frame.subarray(0,-3),frame.subarray(0,-1),Buffer.concat([frame,Buffer.from('\n')]),Buffer.concat([frame,frame])])assert.throws(()=>parseObjectResponse(bytes,requests,'blob',12));
  });
  await run('B06','two complete reordered responses cannot satisfy ordered requests',()=>{
   const other=Buffer.from('Other owned body.');const list=[blobRequest(binary),blobRequest(other)];const reversed=Buffer.concat([objectFrame('blob',other),frame]);assert.throws(()=>parseObjectResponse(reversed,list,'blob',binary.length+other.length));
  });
  await run('B07','same-size body alteration refuses computed Git SHA-1',()=>{
   const changed=Buffer.from(frame);changed[changed.indexOf(10)+1]^=1;assert.throws(()=>parseObjectResponse(changed,requests,'blob',6));
  });
  await run('B08','commit body and total framed output caps refuse',()=>{
   function commitBody(size){
    const prefix=first.body; // Extend an actual owned commit body, not a header-only stand-in.
    assert(prefix.length<size);return Buffer.concat([prefix,Buffer.alloc(size-prefix.length,0x61)]);
   }
   const atCommitLimit=commitBody(262144),overCommitLimit=commitBody(262145);
   const atOid=objectOid('commit',atCommitLimit),overOid=objectOid('commit',overCommitLimit);
   assert.deepEqual(parseObjectResponse(objectFrame('commit',atCommitLimit),[{oid:atOid}],'commit',atCommitLimit.length).get(atOid),atCommitLimit);
   booleanRefusal(()=>parseObjectResponse(objectFrame('commit',overCommitLimit),[{oid:overOid}],'commit',overCommitLimit.length));
   const bodies=[Buffer.alloc(3000000,0x41),Buffer.alloc(3000000,0x42),Buffer.alloc(2000000,0x43)];
   const atFrames=Buffer.concat(bodies.map(body=>objectFrame('blob',body)));
   assert.equal(parseObjectResponse(atFrames,bodies.map(blobRequest),'blob',8000000).size,3);
   const overBodies=[bodies[0],bodies[1],Buffer.alloc(2000001,0x43)],overFrames=Buffer.concat(overBodies.map(body=>objectFrame('blob',body)));
   // All three object frames are complete, individually below4MB and genuine;
   // only the aggregate body budget differs by one byte.
   booleanRefusal(()=>parseObjectResponse(overFrames,overBodies.map(blobRequest),'blob',8000000));
   // Retain the old oversized-output refusal as layered defense only. Its zero
   // bytes are not valid framing; the isolated process-bound witness is F06.
   booleanRefusal(()=>parseObjectResponse(Buffer.alloc(8000130),requests,'blob',8000000));
  });

  for(const [id,title,mutate]of [
   ['F01','nonzero exit',r=>({...r,status:1})],['F02','termination signal',r=>({...r,status:null,signal:'SIGTERM'})],
   ['F03','spawn error',r=>({...r,error:new Error('Synthetic private detail')})],['F04','stderr',r=>({...r,stderr:Buffer.from('Synthetic private detail')})],
   ['F05','ETIMEDOUT result',r=>({...r,error:Object.assign(new Error('Synthetic timeout'),{code:'ETIMEDOUT'})})],
   ['F06','stdout cap overrun',(r,options)=>({...r,stdout:Buffer.concat([r.stdout,Buffer.alloc(options.maxBuffer+1-r.stdout.length)])})],
  ])await run(id,'simulated process return: '+title,()=>{
   if(id==='F06'){
    const atBound=withSpawn((...args)=>{const r=checkedSpawn(...args);assert(r.stdout.length<=args[2].maxBuffer);return r;},()=>verifyCoverageGit(clone(input)));assert.equal(atBound.pathCount,7);
   }
   const expectedCategory=id==='F06'?'RELEASE_GIT_BATCH_BOUND_EXCEEDED':'RELEASE_GIT_BATCH_PROCESS_REFUSED';
   let calls=0;withSpawn((file,args,options)=>{calls++;const base=id==='F06'?checkedSpawn(file,args,options):{status:0,signal:null,stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)};return mutate(base,options);},()=>{
    assert.throws(()=>verifyCoverageGit(clone(input)),error=>{assert(!String(error).includes('Synthetic private detail'));assert.equal(error.cause,undefined);return error.code==='ERR_ASSERTION'&&error.message===expectedCategory;});
   });assert.equal(calls,1);
  });
  await run('F07','thrown process error is sanitized and never retried',()=>{
   let calls=0;withSpawn(()=>{calls++;throw new Error('Synthetic private detail');},()=>assert.throws(()=>verifyCoverageGit(clone(input)),error=>error.message==='RELEASE_GIT_BATCH_PROCESS_REFUSED'&&error.cause===undefined));assert.equal(calls,1);
  });
  await run('F08','interception is restored after a failing case body',()=>{
   const marker=new Error('Owned restoration sentinel');assert.throws(()=>withSpawn(()=>{throw marker;},()=>{throw marker;}),error=>error===marker);assert.equal(childProcess.spawnSync,originalSpawn);
   try{
    assert.equal(esmSpawnSync,originalSpawn,'The named ESM export must already be restored before any reinterception');
    const result=verifyCoverageGit(clone(input));assert.equal(result.pathCount,7);
   }finally{childProcess.spawnSync=originalSpawn;syncBuiltinESMExports();assert.equal(esmSpawnSync,originalSpawn);}
  });
  assert.equal(liveCases,41,'Authored child-case inventory changed; update its explicit source manifest.');
 }finally{
  childProcess.spawnSync=originalSpawn;syncBuiltinESMExports();
  try{
   restoreEnvironment();
   assert.equal(sha(fs.readFileSync(HELPER_URL)),HELPER_SHA,'Accepted helper changed during qualification');
  }finally{
   // Destructive cleanup is restricted to the exact freshly created owned root.
   const resolved=fs.realpathSync(root);assert.equal(resolved,root);assert.equal(path.dirname(resolved),tempParent);
   assert(path.basename(resolved).startsWith('xenios-git-batch-owned-')&&!fs.lstatSync(resolved).isSymbolicLink());
   fs.rmSync(resolved,{recursive:true,force:false,maxRetries:0});
  }
 }
});
