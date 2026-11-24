// Read-only, unprivileged verification. A sealed copy is quarantine until these checks pass.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openSync,closeSync,readSync,fstatSync,lstatSync,realpathSync,readFileSync,readdirSync,constants} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {BROWSER_PACKAGE as PACKAGE,parseBrowserPackageMetadata,validateBrowserSnapshot,assertProtectedDirectoryRows} from './protected-browser-policy.mjs';
import {PINNED_BROWSER} from '../lib/tb500-browser-identity.mjs';
import {inspectNativeCalendarPak} from '../lib/publication-owner-native-calendar.mjs';
const verified=new WeakSet(),hash=(algorithm,bytes)=>createHash(algorithm).update(bytes).digest('hex');
const METADATA=['/var/lib/dpkg/info/google-chrome-stable.md5sums','/var/lib/dpkg/info/google-chrome-stable.list','/var/lib/dpkg/status','/usr/bin/dpkg-query'];
function stable(before,after){
 for(const key of ['dev','ino','size','mtimeMs','ctimeMs','mode','uid','gid','nlink'])assert.equal(after[key],before[key],'PROTECTED_BROWSER_FILE_CHANGED');
}
function trustedParents(path){
 const paths=['/'];for(let p=dirname(path);p!=='/';p=dirname(p))paths.push(p);
 const rows=paths.map(path=>{const s=lstatSync(path);return{path,canonical:realpathSync(path),directory:s.isDirectory(),symlink:s.isSymbolicLink(),
  uid:s.uid,gid:s.gid,mode:s.mode,permissionsOctal:(s.mode&0o7777).toString(8)};});
 return assertProtectedDirectoryRows(rows,paths);
}
function readProtected(path,max,{metadata=false,retain=false}={}){
 if(metadata)trustedParents(path);
 assert.equal(realpathSync(path),path,'CANONICAL_PROTECTED_BROWSER_INPUT');
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=fstatSync(fd),observation={path,regular:before.isFile(),uid:before.uid,gid:before.gid,mode:before.mode,permissionsOctal:(before.mode&0o7777).toString(8),size:before.size,nlink:before.nlink};
  if(!(before.isFile()&&before.uid===0&&(before.mode&0o6022)===0&&before.nlink===1))throw Object.assign(Error('PROTECTED_BROWSER_INPUT_OWNER_MODE'),{protectedInput:observation});
  assert(before.size>=0&&before.size<=max,'PROTECTED_BROWSER_FILE_BOUND');
  const sha=createHash('sha256'),md5=createHash('md5'),chunks=[],chunk=Buffer.alloc(65536);let size=0,n,first=Buffer.alloc(0);
  while((n=readSync(fd,chunk,0,chunk.length,null))>0){size+=n;assert(size<=max,'PROTECTED_BROWSER_READ_BOUND');const b=chunk.subarray(0,n);sha.update(b);md5.update(b);
   if(!first.length)first=Buffer.from(b.subarray(0,4));if(retain)chunks.push(Buffer.from(b));}
  stable(before,fstatSync(fd));assert.equal(size,before.size,'PROTECTED_BROWSER_READ_LENGTH');
  return{bytes:size,sha256:sha.digest('hex'),md5:md5.digest('hex'),uid:before.uid,mode:before.mode,
   executableContent:first.subarray(0,4).equals(Buffer.from([127,69,76,70]))||first.subarray(0,2).equals(Buffer.from('#!')),
   ...(retain?{data:Buffer.concat(chunks)}:{})};
 }finally{closeSync(fd);}
}
export function parseDirectoryFdInfo(text){
 assert(typeof text==='string'&&Buffer.byteLength(text)<=8192,'DIRECTORY_FDINFO_BOUND');
 const ids=[...text.matchAll(/^mnt_id:[ \t]+([1-9][0-9]*)$/gm)],inos=[...text.matchAll(/^ino:[ \t]+([1-9][0-9]*)$/gm)];
 assert(ids.length===1&&inos.length===1,'EXACT_DIRECTORY_FDINFO_IDENTITY');
 const mountId=Number(ids[0][1]);assert(Number.isSafeInteger(mountId),'DIRECTORY_MOUNT_ID_BOUND');
 assert(inos[0][1].length<=20,'DIRECTORY_INODE_BOUND');return{mountId,ino:inos[0][1]};
}
export function parseActiveDirectoryMount(text,path,mountId){
 assert([PACKAGE.privateMount,PACKAGE.root,'/tmp'].includes(path),'FIXED_DIRECTORY_MOUNT_PATH');
 assert(Number.isSafeInteger(mountId)&&mountId>0,'ACTIVE_DIRECTORY_MOUNT_ID');
 assert(typeof text==='string'&&Buffer.byteLength(text)<=1024*1024,'BROWSER_MOUNTINFO_BOUND');
 const ids=new Set(),lines=text.trim().split('\n');assert(lines.length>0&&lines.length<=8192,'MOUNTINFO_ROW_BOUND');
 const rows=lines.map(line=>{
  const parts=line.split(' - ');assert(parts.length===2,'BROWSER_MOUNTINFO_FORMAT');
  const a=parts[0].split(' '),b=parts[1].split(' ');
  assert(a.length>=6&&b.length>=3&&/^[1-9][0-9]*$/.test(a[0])&&/^[0-9]+$/.test(a[1])&&/^[0-9]+:[0-9]+$/.test(a[2]),'MOUNTINFO_IDENTITY_FORMAT');
  const id=Number(a[0]),parentId=Number(a[1]);
  assert(Number.isSafeInteger(id)&&Number.isSafeInteger(parentId)&&!ids.has(id),'UNIQUE_MOUNTINFO_ID');
  ids.add(id);return{mountId:id,parentId,device:a[2],root:a[3],path:a[4],flags:a[5].split(','),type:b[0]};
 });
 const selected=rows.find(row=>row.mountId===mountId);
 assert(selected&&selected.path===path,'ACTIVE_DIRECTORY_MOUNT_JOIN');
 assert(!rows.some(row=>row.path===path&&row.parentId===mountId&&row.mountId!==mountId),'DIRECTORY_FD_MOUNT_IS_COVERED');
 return selected;
}
// FD identity comes from the actual current directory, not a path-row ordering heuristic.
export function observeDirectoryMount(path){
 assert(process.platform==='linux'&&process.getuid()!==0,'UNPRIVILEGED_DIRECTORY_MOUNT_OBSERVER');
 assert([PACKAGE.privateMount,PACKAGE.root,'/tmp'].includes(path),'FIXED_DIRECTORY_MOUNT_PATH');
 const observation={path,phase:'BEFORE_OPEN'};let fd;
 try{
  assert(realpathSync(path)===path,'CANONICAL_DIRECTORY_MOUNT_PATH');
  fd=openSync(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  const before=fstatSync(fd,{bigint:true});
  Object.assign(observation,{phase:'DIRECTORY_FD_OPENED',dev:before.dev.toString(),ino:before.ino.toString(),
   uid:Number(before.uid),gid:Number(before.gid),mode:Number(before.mode)});
  assert(before.isDirectory(),'ACTUAL_DIRECTORY_DESCRIPTOR_REQUIRED');
  const identity=parseDirectoryFdInfo(readFileSync('/proc/self/fdinfo/'+fd,'utf8'));
  observation.fdIdentity=identity;
  assert(identity.ino===before.ino.toString(),'DIRECTORY_FDINFO_INODE_JOIN');
  const mountInfo=readFileSync('/proc/self/mountinfo','utf8');
  observation.mountinfo={bytes:Buffer.byteLength(mountInfo),sha256:hash('sha256',mountInfo)};
  observation.mount=parseActiveDirectoryMount(mountInfo,path,identity.mountId);
  const after=fstatSync(fd,{bigint:true}),current=lstatSync(path,{bigint:true});
  for(const key of ['dev','ino','uid','gid','mode'])assert(before[key]===after[key]&&before[key]===current[key],'DIRECTORY_IDENTITY_CHANGED');
  assert.deepEqual(parseDirectoryFdInfo(readFileSync('/proc/self/fdinfo/'+fd,'utf8')),identity,'DIRECTORY_MOUNT_CHANGED');
  observation.phase='ACTIVE_DIRECTORY_MOUNT_OBSERVED';return{...observation,...identity};
 }catch(error){throw Object.assign(error,{protectedInput:observation});}
 finally{if(fd!==undefined)closeSync(fd);}
}
export function parseProtectedBrowserMounts(text,stage,active){
 assert.equal(stage,PACKAGE.privateRoot,'FIXED_PROTECTED_BROWSER_STAGE');
 assert(active&&Number.isSafeInteger(active.run)&&Number.isSafeInteger(active.browser),'ACTUAL_PROTECTED_MOUNT_IDENTITIES_REQUIRED');
 const selected=[parseActiveDirectoryMount(text,PACKAGE.privateMount,active.run),parseActiveDirectoryMount(text,PACKAGE.root,active.browser)];
 assert(selected.every(row=>row.type==='tmpfs'&&['ro','nosuid','nodev'].every(flag=>row.flags.includes(flag))&&!row.flags.includes('rw')),'PROTECTED_BROWSER_READONLY_TMPFS');
 return selected;
}
export function observePrivateTmpMount(){
 const observed=observeDirectoryMount('/tmp');
 if(!(observed.uid===0&&(observed.mode&0o7777)===0o1777&&observed.mount.type==='tmpfs'&&
  ['rw','nosuid','nodev'].every(flag=>observed.mount.flags.includes(flag))&&!observed.mount.flags.includes('ro')))
  throw Object.assign(Error('PRIVATE_TMPFS_REQUIRED'),{protectedInput:observed});
 return observed;
}
function context(root){
 assert(process.platform==='linux'&&process.getuid()!==0,'UNPRIVILEGED_PROTECTED_BROWSER_VERIFIER');
 const status=readFileSync('/proc/self/status','utf8');
 assert(/^CapEff:\s*0+$/m.test(status)&&/^CapBnd:\s*0+$/m.test(status)&&/^NoNewPrivs:\s*1$/m.test(status),'PROTECTED_BROWSER_NO_PRIVILEGES');
 assert(resolve(root)===root&&realpathSync(root)===root&&/^xenios-owned-hosted-scenes\.[A-Za-z0-9]{8}$/.test(basename(root)),'OWNED_PROTECTED_BROWSER_ROOT');
 const owner=lstatSync(root);assert(owner.isDirectory()&&!owner.isSymbolicLink()&&owner.uid===process.getuid()&&(owner.mode&0o077)===0,'OWNED_PROTECTED_BROWSER_OUTPUT');
 trustedParents(PACKAGE.privateRoot+'/sentinel');trustedParents(PACKAGE.root+'/sentinel');
 const activeDirectories=[observeDirectoryMount(PACKAGE.privateMount),observeDirectoryMount(PACKAGE.root)];
 const stage=PACKAGE.privateRoot,mounts=parseProtectedBrowserMounts(readFileSync('/proc/self/mountinfo','utf8'),stage,{run:activeDirectories[0].mountId,browser:activeDirectories[1].mountId});
 const a=lstatSync(stage),b=lstatSync(PACKAGE.root);
 assert([a,b].every(s=>s.isDirectory()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o7777)===0o555),'PROTECTED_BROWSER_ROOT_MODE');
 assert(a.dev===b.dev&&a.ino===b.ino,'EXACT_PROTECTED_BROWSER_BIND');return{stage,mounts,activeDirectories};
}
function walk(root){
 const records=[];let total=0;
 const visit=(dir,prefix='')=>{
  for(const name of readdirSync(dir).sort()){
   assert(/^[A-Za-z0-9._+@-]+$/.test(name)&&name!=='.'&&name!=='..','BROWSER_SNAPSHOT_PATH');
   const relative=prefix?prefix+'/'+name:name,path=join(dir,name),s=lstatSync(path);
   assert(records.length<PACKAGE.maxEntries,'BROWSER_SNAPSHOT_COUNT');
   if(s.isSymbolicLink()||!(s.isFile()||s.isDirectory()))throw Object.assign(Error('BROWSER_SYMLINK_OR_SPECIAL_UNSUPPORTED'),
    {protectedInput:{path:relative,type:s.isSymbolicLink()?'symlink':'special',uid:s.uid,gid:s.gid,mode:s.mode}});
   assert(s.uid===0&&(s.isDirectory()?(s.mode&0o7777)===0o555:[0o444,0o555].includes(s.mode&0o7777)),'PROTECTED_BROWSER_COPY_MODE');
   if(s.isDirectory()){records.push({path:relative,type:'directory',uid:s.uid,mode:s.mode});visit(path,relative);}
   else{const value=readProtected(path,PACKAGE.maxFileBytes);total+=value.bytes;assert(total<=PACKAGE.maxTotalBytes,'BROWSER_SNAPSHOT_TOTAL_BOUND');
    records.push({path:relative,type:'file',...value});}
  }
 };visit(root);return records;
}
function descriptor(value){const {data,...row}=value;return row;}
function metadataSnapshot(){
 return METADATA.map(path=>{
  try{return{path,...descriptor(readProtected(path,path==='/var/lib/dpkg/status'?16*1024*1024:2*1024*1024,{metadata:true})),failure:null};}
  catch(error){return{path,failure:/^(?:ENOENT|EACCES|EPERM|ELOOP|ENOTDIR)$/.test(error.code??'')?error.code:
   /^[A-Z][A-Z0-9_]{1,120}$/.test(String(error.message))?String(error.message):'PROTECTED_METADATA_OBSERVATION_FAILED',observation:error.protectedInput??null};}
 });
}
export function assertProtectedMetadataSnapshot(rows){
 assert(Array.isArray(rows)&&rows.length===METADATA.length,'PROTECTED_PACKAGE_METADATA_SCOPE');
 for(const [i,path]of METADATA.entries())assert(rows[i]?.path===path&&rows[i].failure===null&&/^[a-f0-9]{64}$/.test(rows[i].sha256??''),'PROTECTED_PACKAGE_METADATA_UNAVAILABLE');
}
function command(args,timeoutMs,commands){
 const row={file:'/usr/bin/dpkg-query',args,timeoutMs},started=performance.now();commands.push(row);
 try{const text=execFileSync(row.file,args,{env:{PATH:'/usr/bin:/bin',LANG:'C',TZ:'UTC'},encoding:'utf8',timeout:timeoutMs,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']});
  row.exit=0;row.stdoutBytes=Buffer.byteLength(text);row.stdoutSha256=hash('sha256',text);return text.trim();
 }catch(error){row.exit=Number.isInteger(error.status)?error.status:null;row.errorCode=/^[A-Z0-9_]+$/.test(error.code??'')?error.code:'COMMAND_FAILED';throw Error('PROTECTED_BROWSER_METADATA_COMMAND_FAILED');}
 finally{row.durationMs=Math.round(performance.now()-started);}
}
function installedMetadata(record){
 record.protectedMetadataBefore=metadataSnapshot();
 assertProtectedMetadataSnapshot(record.protectedMetadataBefore);
 const paths=[PINNED_BROWSER.launcherPath,PINNED_BROWSER.executable,PACKAGE.root+'/resources.pak'];
 const ownerRows=command(['-S',...paths],45000,record.commands).split('\n');
 const owners=paths.map(path=>{const rows=ownerRows.filter(row=>row.endsWith(': '+path));assert.equal(rows.length,1,'ONE_BROWSER_PACKAGE_OWNER');return rows[0];});
 record.owners=owners;
 const status=command(['-W','-f=${db:Status-Status}\t${Version}\t${Architecture}',PACKAGE.name],3000,record.commands);
 const md5sums=command(['--control-show',PACKAGE.name,'md5sums'],3000,record.commands);
 const list=command(['-L',PACKAGE.name],3000,record.commands);
 assert.equal(md5sums,readProtected(METADATA[0],1024*1024,{metadata:true,retain:true}).data.toString('utf8').trim(),'PROTECTED_DPKG_MD5_BYTES');
 const directList=readProtected(METADATA[1],1024*1024,{metadata:true,retain:true}).data.toString('utf8').trim().split('\n').sort();
 assert.deepEqual(list.split('\n').sort(),directList,'PROTECTED_DPKG_LIST_BYTES');
 record.package={name:PACKAGE.name,status,integrity:'PROTECTED_LOCAL_INSTALLED_DPKG_MD5_NOT_SIGNED_PACKAGE_OR_SHA256_AUTHENTICATION'};
 return parseBrowserPackageMetadata({status,owners,md5sums,list});
}
export function inspectProtectedBrowserCopy(ownedRoot){
 const record={kind:'ACTUAL_PROTECTED_BROWSER_COPY_CONTENT_OBSERVATION',state:'STARTED',commands:[],failure:null,
  authority:'QUALIFICATION_ONLY_NOT_AUTH_ROLE_OR_VENDOR_SIGNATURE',signedPackageVerified:false,noNetworkOrInstall:true,noBrowserExecuted:true};
 try{
  record.context=context(ownedRoot);
  const manifest=installedMetadata(record),records=walk(PACKAGE.root);
  record.files=records.map(row=>({...row,expectedInstalledMd5:manifest.checksums.get(row.path)??null}));
  record.content=validateBrowserSnapshot(records,manifest);
  record.nativeProducer=inspectNativeCalendarPak(readProtected(PACKAGE.root+'/resources.pak',32*1024*1024,{retain:true}).data);
  record.protectedMetadataAfter=metadataSnapshot();assert.deepEqual(record.protectedMetadataAfter,record.protectedMetadataBefore,'PROTECTED_PACKAGE_METADATA_CHANGED');
  record.state='VERIFIED_ACTUAL_PROTECTED_BROWSER_COPY_REQUIRES_EXISTING_RUNTIME_PROOF';verified.add(record);
 }catch(error){record.state='REFUSED_NO_BROWSER';record.failure=/^[A-Z][A-Z0-9_]{1,120}$/.test(String(error.message))?String(error.message):'PROTECTED_BROWSER_VERIFICATION_FAILED';record.failedInput=error.protectedInput??null;}
 return record;
}
export function assertProtectedBrowserCopy(record){
 assert(record&&verified.has(record)&&record.state==='VERIFIED_ACTUAL_PROTECTED_BROWSER_COPY_REQUIRES_EXISTING_RUNTIME_PROOF','ACTUAL_PROTECTED_BROWSER_COPY_REQUIRED');
 return record;
}
