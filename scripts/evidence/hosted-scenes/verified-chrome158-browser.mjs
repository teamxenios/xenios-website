// Read-only ordinary-UID verification of the new signed archive's sealed private tree.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openSync,closeSync,readSync,fstatSync,lstatSync,realpathSync,readFileSync,readdirSync,constants} from 'node:fs';
import {join,dirname,basename,resolve} from 'node:path';
import {ROOT,PACKAGE,PROFILE,PROFILE_SHA256,validateChrome158Snapshot} from './verified-chrome158-profile.mjs';
import {observeDirectoryMount,parseDirectoryFdInfo} from './protected-browser.mjs';
import {assertProtectedDirectoryRows} from './protected-browser-policy.mjs';
import {inspectNativeCalendarPak} from '../lib/publication-owner-native-calendar.mjs';
const verified=new WeakSet();
function stable(before,after){for(const key of ['dev','ino','size','mtimeMs','ctimeMs','mode','uid','gid','nlink'])
 assert.equal(after[key],before[key],'PRIVATE_CHROME158_FILE_CHANGED');}
function read(path,max,retain=false){
 assert.equal(realpathSync(path),path,'CANONICAL_CHROME158_FILE');const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=fstatSync(fd);assert(before.isFile()&&before.uid===0&&before.gid===0&&before.nlink===1
   &&[0o444,0o555].includes(before.mode&0o7777)&&before.size>=0&&before.size<=max,'PRIVATE_CHROME158_FILE_GUARD');
  const h=createHash('sha256'),chunk=Buffer.alloc(65536),parts=[];let size=0,n;
  while((n=readSync(fd,chunk,0,chunk.length,null))>0){size+=n;assert(size<=max,'CHROME158_READ_BOUND');h.update(chunk.subarray(0,n));if(retain)parts.push(Buffer.from(chunk.subarray(0,n)));}
  stable(before,fstatSync(fd));assert.equal(size,before.size);return{bytes:size,sha256:h.digest('hex'),uid:before.uid,gid:before.gid,mode:before.mode,nlink:before.nlink,...(retain?{data:Buffer.concat(parts)}:{})};
 }finally{closeSync(fd);}
}
function context(ownedRoot){
 assert(process.platform==='linux'&&process.getuid()!==0,'UNPRIVILEGED_CHROME158_VERIFIER');
 const status=readFileSync('/proc/self/status','utf8');
 assert(/^CapEff:\s*0+$/m.test(status)&&/^CapBnd:\s*0+$/m.test(status)&&/^NoNewPrivs:\s*1$/m.test(status),'CHROME158_NO_PRIVILEGES');
 assert(resolve(ownedRoot)===ownedRoot&&realpathSync(ownedRoot)===ownedRoot
  &&/^xenios-owned-hosted-scenes\.[A-Za-z0-9]{8}$/.test(basename(ownedRoot)),'OWNED_CHROME158_OUTPUT');
 const output=lstatSync(ownedRoot);assert(output.isDirectory()&&!output.isSymbolicLink()&&output.uid===process.getuid()&&(output.mode&0o077)===0,'PRIVATE_CHROME158_OUTPUT');
 const paths=['/','/run',ROOT];
 const rows=paths.map(path=>{const s=lstatSync(path);return{path,canonical:realpathSync(path),directory:s.isDirectory(),symlink:s.isSymbolicLink(),uid:s.uid,mode:s.mode};});
 assertProtectedDirectoryRows(rows,paths);assert.equal(rows[2].mode&0o7777,0o555,'PRIVATE_CHROME158_ROOT_MODE');
 const active=observeDirectoryMount('/run'),m=active.mount;
 assert(m.type==='tmpfs'&&['ro','nosuid','nodev'].every(f=>m.flags.includes(f))&&!m.flags.includes('rw')&&!m.flags.includes('noexec'),'SEALED_PRIVATE_CHROME158_MOUNT');
 const fd=openSync(ROOT,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{
  const before=fstatSync(fd,{bigint:true}),id=parseDirectoryFdInfo(readFileSync('/proc/self/fdinfo/'+fd,'utf8'));
  assert(id.mountId===active.mountId&&id.ino===before.ino.toString(),'PRIVATE_ROOT_ACTIVE_MOUNT_JOIN');
  const after=fstatSync(fd,{bigint:true}),current=lstatSync(ROOT,{bigint:true});
  for(const k of ['dev','ino','uid','gid','mode'])assert(before[k]===after[k]&&before[k]===current[k],'PRIVATE_ROOT_FD_CHANGED');
  assert.deepEqual(parseDirectoryFdInfo(readFileSync('/proc/self/fdinfo/'+fd,'utf8')),id,'PRIVATE_ROOT_MOUNT_CHANGED');
  return{fixedRoot:ROOT,protectedAncestors:rows,activePrivateRun:active,rootFdIdentity:id,privateRootSharesRunDevice:before.dev.toString()===active.dev};
 }finally{closeSync(fd);}
}
function walk(){
 const rows=[];let total=0;
 function visit(dir,prefix=''){
  for(const name of readdirSync(dir).sort()){
   assert(/^[A-Za-z0-9._+@-]+$/.test(name)&&name!=='.'&&name!=='..','PRIVATE_CHROME158_ENTRY_NAME');
   const path=prefix?prefix+'/'+name:name,full=join(dir,name),s=lstatSync(full);assert(rows.length<260,'PRIVATE_CHROME158_COUNT_BOUND');
   assert(!s.isSymbolicLink()&&(s.isFile()||s.isDirectory()),'PRIVATE_CHROME158_NO_LINK_OR_SPECIAL');
   if(s.isDirectory()){rows.push({path,type:'directory',uid:s.uid,gid:s.gid,mode:s.mode});visit(full,path);}
   else{const value=read(full,512*1024*1024);total+=value.bytes;assert(total<=480569503,'PRIVATE_CHROME158_TOTAL_BOUND');rows.push({path,type:'file',...value});}
  }
 }visit(ROOT);return rows;
}
export function inspectProtectedBrowserCopy(ownedRoot){
 const record={kind:'SIGNED_CHROME158_PRIVATE_TREE_OBSERVATION',state:'STARTED',profileSha256:PROFILE_SHA256,package:PACKAGE,
  authority:'ROOT_SELECTED_SIGNED_ARCHIVE_PROFILE_NOT_AUTH_OR_RIGHTS',failure:null,noSharedOptAccess:true,noInstallOrMaintainerScripts:true,noBrowserExecuted:true};
 try{
  record.context=context(ownedRoot);assert(record.context.privateRootSharesRunDevice,'PRIVATE_ROOT_DEVICE_JOIN');
  record.files=walk();record.content=validateChrome158Snapshot(record.files);
  const resource=read(ROOT+'/resources.pak',32*1024*1024,true);record.nativeProducer=inspectNativeCalendarPak(resource.data);
  assert.deepEqual(record.nativeProducer,PROFILE.nativeCalendar.pureDataObservation,'EXACT_CHROME158_NATIVE_PRODUCER');
  const after=context(ownedRoot);assert.deepEqual(after,record.context,'PRIVATE_CHROME158_CONTEXT_CHANGED');
  record.state='VERIFIED_ACTUAL_PROTECTED_BROWSER_COPY_REQUIRES_EXISTING_RUNTIME_PROOF';verified.add(record);
 }catch(error){record.state='REFUSED_NO_BROWSER';record.failure=/^[A-Z][A-Z0-9_]{1,120}$/.test(String(error.message))?String(error.message):'SIGNED_CHROME158_VERIFICATION_FAILED';}
 return record;
}
export function assertProtectedBrowserCopy(record){
 assert(record&&verified.has(record)&&record.state==='VERIFIED_ACTUAL_PROTECTED_BROWSER_COPY_REQUIRES_EXISTING_RUNTIME_PROOF','ACTUAL_SIGNED_CHROME158_TREE_REQUIRED');return record;
}
