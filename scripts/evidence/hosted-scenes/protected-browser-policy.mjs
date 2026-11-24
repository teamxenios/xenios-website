// Qualification-only installed-package policy. Data validation is not package authentication.
import assert from 'node:assert/strict';
import {PINNED_BROWSER} from '../lib/tb500-browser-identity.mjs';
export const BROWSER_PACKAGE=Object.freeze({name:'google-chrome-stable',version:'157.0.8103.78-1',architecture:'amd64',
 root:'/opt/google/chrome',privateRoot:'/run/xenios-protected-browser',privateMount:'/run',maxFiles:2048,maxEntries:4096,maxFileBytes:512*1024*1024,maxTotalBytes:768*1024*1024});
const sha=/^[a-f0-9]{64}$/,md5=/^[a-f0-9]{32}$/;
function relative(value){
 assert(typeof value==='string'&&value.length>0&&value.length<=512&&/^[A-Za-z0-9._+@/-]+$/.test(value),'BROWSER_PACKAGE_PATH');
 assert(!value.startsWith('/')&&!value.endsWith('/')&&!value.split('/').some(p=>!p||p==='.'||p==='..'),'BROWSER_PACKAGE_PATH');
 return value;
}
export function parseBrowserPackageMetadata({status,owners,md5sums,list}){
 const p=BROWSER_PACKAGE;
 assert.equal(status,'installed\t'+p.version+'\t'+p.architecture,'EXACT_INSTALLED_BROWSER_PACKAGE_VERSION');
 assert(Array.isArray(owners)&&owners.length===3,'BROWSER_PACKAGE_OWNERS');
 for(const [i,path]of [PINNED_BROWSER.launcherPath,PINNED_BROWSER.executable,p.root+'/resources.pak'].entries())
  assert.equal(owners[i],p.name+': '+path,'EXACT_BROWSER_PACKAGE_OWNER');
 assert(typeof md5sums==='string'&&Buffer.byteLength(md5sums)<=1024*1024,'BROWSER_CHECKSUM_METADATA_BOUND');
 assert(typeof list==='string'&&Buffer.byteLength(list)<=1024*1024,'BROWSER_LIST_METADATA_BOUND');
 const checksums=new Map(),members=new Set(),prefix=p.root.slice(1)+'/';
 for(const line of md5sums.trim().split('\n')){
  const m=/^([a-f0-9]{32})  (.+)$/.exec(line);assert(m,'BROWSER_DPKG_MD5_FORMAT');const file=relative(m[2]);
  if(!file.startsWith(prefix))continue;const name=relative(file.slice(prefix.length));
  assert(!checksums.has(name),'DUPLICATE_BROWSER_PACKAGE_CHECKSUM');checksums.set(name,m[1]);
 }
 for(const line of list.trim().split('\n')){
  assert(line.length<=1024&&!/[\x00-\x20\x7f]/.test(line),'BROWSER_PACKAGE_LIST_PATH');
  if(line===p.root)continue;if(!line.startsWith(p.root+'/'))continue;
  const name=relative(line.slice(p.root.length+1));assert(!members.has(name),'DUPLICATE_BROWSER_PACKAGE_MEMBER');members.add(name);
 }
 assert(checksums.size>0&&checksums.size<=p.maxFiles&&members.size<=p.maxEntries,'BROWSER_PACKAGE_COUNT_BOUND');
 for(const name of checksums.keys())assert(members.has(name),'BROWSER_CHECKSUM_NOT_PACKAGE_MEMBER');
 for(const path of [PINNED_BROWSER.launcherPath,PINNED_BROWSER.executable,p.root+'/resources.pak'])
  assert(checksums.has(path.slice(p.root.length+1)),'REQUIRED_BROWSER_PACKAGE_FILE');
 return{package:p,checksums,members,integrity:'MD5_FROM_PROTECTED_LOCAL_INSTALLED_DPKG_METADATA_NOT_VENDOR_SIGNATURE'};
}
export function validateBrowserSnapshot(records,manifest){
 const p=BROWSER_PACKAGE;assert(Array.isArray(records)&&records.length>0&&records.length<=p.maxEntries,'BROWSER_SNAPSHOT_COUNT');
 assert(manifest?.checksums instanceof Map&&manifest.members instanceof Set,'BROWSER_PACKAGE_MANIFEST_REQUIRED');
 const seen=new Set(),files=[];let total=0;
 for(const row of records){
  const name=relative(row?.path);assert(!seen.has(name),'DUPLICATE_BROWSER_SNAPSHOT_PATH');seen.add(name);
  assert(manifest.members.has(name),'UNOWNED_BROWSER_SNAPSHOT_ENTRY');
  assert(row.type==='file'||row.type==='directory','BROWSER_SYMLINK_OR_SPECIAL_UNSUPPORTED');
  assert.equal(row.uid,0,'PRIVATE_BROWSER_ROOT_OWNER');assert(Number.isSafeInteger(row.mode)
   &&(row.type==='directory'?(row.mode&0o7777)===0o555:[0o444,0o555].includes(row.mode&0o7777)),'PRIVATE_BROWSER_WRITABLE_SNAPSHOT');
  if(row.type==='directory')continue;
  assert(manifest.checksums.has(name),'UNRECORDED_BROWSER_FILE');
  assert(Number.isSafeInteger(row.bytes)&&row.bytes>=0&&row.bytes<=p.maxFileBytes,'BROWSER_SNAPSHOT_FILE_BOUND');total+=row.bytes;
  assert(total<=p.maxTotalBytes,'BROWSER_SNAPSHOT_TOTAL_BOUND');
  assert(md5.test(row.md5??'')&&row.md5===manifest.checksums.get(name),'BROWSER_INSTALLED_MD5_MISMATCH');
  assert(sha.test(row.sha256??''),'BROWSER_SNAPSHOT_SHA256');files.push(row);
 }
 assert.equal(files.length,manifest.checksums.size,'BROWSER_SNAPSHOT_MISSING_PACKAGE_FILE');
 for(const name of manifest.members)assert(seen.has(name),'BROWSER_SNAPSHOT_MISSING_PACKAGE_MEMBER');
 for(const [path,digest]of [[PINNED_BROWSER.launcherPath,PINNED_BROWSER.launcherSha256],[PINNED_BROWSER.executable,PINNED_BROWSER.executableSha256]]){
  const file=files.find(r=>r.path===path.slice(p.root.length+1));assert(file&&file.sha256===digest&&(file.mode&0o7777)===0o555,'PINNED_BROWSER_SNAPSHOT_SHA256');
 }
 return{files:files.length,entries:records.length,totalBytes:total,packageName:p.name,packageVersion:p.version,
  integrity:manifest.integrity,sha256Purpose:'ACTUAL_COPY_DESCRIPTORS_PLUS_TWO_PRESELECTED_CODE_PINS_NOT_SIGNED_PACKAGE_AUTHENTICATION'};
}
export function protectedBrowserMode(row){
 assert(row?.type==='file'||row?.type==='directory','BROWSER_SEAL_TYPE');
 return row.type==='directory'||(row.mode&0o111)!==0?0o555:0o444;
}

export function assertProtectedDirectoryRows(rows,paths){
 assert(Array.isArray(rows)&&rows.length===paths.length,'PROTECTED_DIRECTORY_SCOPE');
 for(const [i,path]of paths.entries()){
  const row=rows[i];
  if(!(row?.path===path&&row.canonical===path&&row.directory===true&&row.symlink===false&&row.uid===0&&
    Number.isSafeInteger(row.mode)&&(row.mode&0o022)===0))
   throw Object.assign(Error('PROTECTED_PACKAGE_METADATA_PARENT'),{protectedInput:row??{path,missing:true}});
 }
 return rows;
}
