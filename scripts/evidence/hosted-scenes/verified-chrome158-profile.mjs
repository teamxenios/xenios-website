// New signed-archive qualification profile. No installed dpkg state is invented.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const PROFILE_SHA256='6e10ec4bce628d4d424f8701905fd889505647594153f9329c253db21a2f2228';
const bytes=readFileSync(new URL('./chrome158-package-profile.json',import.meta.url));
assert.equal(bytes.length,124424,'EXACT_CHROME158_PROFILE_SIZE');
assert.equal(createHash('sha256').update(bytes).digest('hex'),PROFILE_SHA256,'EXACT_CHROME158_PROFILE_HASH');
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export const PROFILE=freeze(JSON.parse(bytes));
export const ROOT='/run/xenios-protected-browser';
export const PACKAGE=Object.freeze({name:'google-chrome-stable',version:'158.0.8127.88-1',architecture:'amd64',
 bytes:152741120,sha256:'a656b2db00a8cb7f13a1d754f6aad91f84014906452c6dfb7f3ead93035da03b',
 url:'https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_158.0.8127.88-1_amd64.deb'});
assert.equal(PROFILE.package.sha256,PACKAGE.sha256);assert.equal(PROFILE.package.bytes,PACKAGE.bytes);
assert.equal(PROFILE.package.version,PACKAGE.version);assert.equal(PROFILE.proposedFixedPrivateRoot,ROOT);
const identity=PROFILE.proposedPrivateIdentity;
export const PINNED_BROWSER=Object.freeze({launcherPath:ROOT+'/google-chrome',launcherSha256:identity.launcherSha256,
 executable:ROOT+'/chrome',executableSha256:identity.executableSha256,browserVersion:'158.0.8127.88'});
export const RESOURCE_SHA256='6f7e43582a924467d5b3110176c202743bd95b9ea3833cfb026cf0b05ce95c0b';
assert.equal(identity.resourceSha256,RESOURCE_SHA256);
function relative(path){assert(typeof path==='string'&&path.length>0&&path.length<=512&&/^[A-Za-z0-9._+@/-]+$/.test(path)
 &&!path.startsWith('/')&&!path.endsWith('/')&&!path.split('/').some(p=>!p||p==='.'||p==='..'),'CHROME158_RELATIVE_PATH');return path;}
export function verifyPackageReceipt(value){
 assert(value?.bytes===PACKAGE.bytes&&value.sha256===PACKAGE.sha256,'EXACT_SIGNED_CHROME158_PACKAGE_REQUIRED');return true;
}
export function validateChrome158Snapshot(records){
 assert(Array.isArray(records)&&records.length===260,'EXACT_CHROME158_MEMBER_COUNT');
 const expected=new Map(PROFILE.manifest.filter(r=>r.relativePath).map(r=>[r.relativePath,r])),seen=new Set();let files=0,totalBytes=0;
 assert.equal(expected.size,260,'EXACT_CHROME158_MANIFEST');
 for(const row of records){
  const name=relative(row?.path);assert(!seen.has(name),'DUPLICATE_CHROME158_MEMBER');seen.add(name);
  const pin=expected.get(name);assert(pin,'UNDECLARED_CHROME158_MEMBER');
  assert.equal(row.uid,0,'ROOT_OWNED_CHROME158_MEMBER');assert.equal(row.gid,0,'ROOT_GROUP_CHROME158_MEMBER');
  const directory=pin.directory===true,mode=directory||(parseInt(pin.modeOctal,8)&0o111)!==0?0o555:0o444;
  assert.equal(row.type,directory?'directory':'file','EXACT_CHROME158_MEMBER_TYPE');
  assert(Number.isSafeInteger(row.mode)&&(row.mode&0o7777)===mode,'SEALED_CHROME158_MEMBER_MODE');
  if(directory)continue;
  assert.equal(row.nlink,1,'NO_CHROME158_HARDLINK');assert.equal(row.bytes,pin.bytes,'EXACT_CHROME158_MEMBER_SIZE');
  assert.equal(row.sha256,pin.sha256,'EXACT_CHROME158_MEMBER_SHA256');files++;totalBytes+=row.bytes;
 }
 assert.equal(files,253,'EXACT_CHROME158_FILE_COUNT');assert.equal(totalBytes,480569503,'EXACT_CHROME158_TOTAL_BYTES');
 return{files,entries:records.length,totalBytes,package:PACKAGE,profileSha256:PROFILE_SHA256,
  integrity:'SHA256_OF_EVERY_MEMBER_FROM_ROOT_SELECTED_GOOGLE_SIGNED_HASH_BOUND_ARCHIVE_NOT_INSTALLED_DPKG_STATE'};
}
export function assertPinnedOwnedBrowserIdentity(owned, before, after) {
  assert(owned && Number.isSafeInteger(owned.pid) && owned.pid>0
    && Number.isSafeInteger(owned.parentPid) && owned.parentPid>0
    && typeof owned.startTicks==='string' && /^\d+$/.test(owned.startTicks), 'OWNED_BROWSER_STAMP_MISSING');
  for (const sample of [before,after]) {
    assert(sample && typeof sample==='object', 'BROWSER_IDENTITY_SAMPLE_MISSING');
    assert.equal(sample.pid,owned.pid,'OWNED_BROWSER_PID_CHANGED');
    assert.equal(sample.parentPid,owned.parentPid,'OWNED_BROWSER_PARENT_CHANGED');
    assert.equal(sample.startTicks,owned.startTicks,'OWNED_BROWSER_START_CHANGED');
    assert(typeof sample.state==='string' && /^[A-Za-z]$/.test(sample.state)
      && !['Z','X','x'].includes(sample.state), 'OWNED_BROWSER_NOT_LIVE');
    for(const [key,value] of Object.entries(PINNED_BROWSER)) assert.equal(sample[key],value,'PINNED_BROWSER_'+key);
  }
  return {state:'PINNED_LAUNCHER_AND_OWNED_EXECUTABLE_IDENTITIES_MATCH',pid:owned.pid,startTicks:owned.startTicks};
}
