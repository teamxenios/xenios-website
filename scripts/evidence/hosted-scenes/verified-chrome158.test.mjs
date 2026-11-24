import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PROFILE,ROOT,PACKAGE,PROFILE_SHA256,PINNED_BROWSER,RESOURCE_SHA256,validateChrome158Snapshot,verifyPackageReceipt,assertPinnedOwnedBrowserIdentity} from './verified-chrome158-profile.mjs';
import {validatePackageResponse} from './acquire-chrome158.mjs';
import {inspectProtectedBrowserCopy,assertProtectedBrowserCopy} from './verified-chrome158-browser.mjs';
const rows=()=>PROFILE.manifest.filter(r=>r.relativePath).map(r=>({path:r.relativePath,type:r.directory?'directory':'file',uid:0,gid:0,
 mode:r.directory||(parseInt(r.modeOctal,8)&0o111)!==0?0o555:0o444,nlink:1,bytes:r.bytes,sha256:r.sha256}));
test('new signed payload profile is complete, immutable and explicitly different from installed157',()=>{
 const actual=validateChrome158Snapshot(rows());assert.equal(actual.files,253);assert.equal(actual.entries,260);assert.equal(actual.totalBytes,480569503);
 assert.equal(PACKAGE.version,'158.0.8127.88-1');assert.equal(PINNED_BROWSER.browserVersion,'158.0.8127.88');
 assert.equal(ROOT,'/run/xenios-protected-browser');assert.equal(PROFILE.archiveControlMd5sumsPresent,false);
 assert(Object.isFrozen(PROFILE)&&Object.isFrozen(PROFILE.manifest)&&Object.isFrozen(PROFILE.manifest[0]));
 assert.equal(PROFILE.nativeCalendar.pureDataObservation.pakSha256,RESOURCE_SHA256);
 assert.equal(PROFILE.nativeCalendar.pureDataObservation.resourceId,47340);
});
for(const [name,mutate]of [
 ['missing',r=>r.pop()],['extra',r=>r.push({...r[0],path:'foreign'})],['duplicate',r=>r[1].path=r[0].path],
 ['traversal',r=>r[0].path='../outside'],['symlink',r=>r[0].type='symlink'],['hardlink',r=>r.find(x=>x.type==='file').nlink=2],
 ['nonroot',r=>r[0].uid=1001],['wrong group',r=>r[0].gid=1001],['writable',r=>r[0].mode=0o777],
 ['setuid',r=>r.find(x=>x.path==='chrome-sandbox').mode=0o4555],['changed byte size',r=>r.find(x=>x.type==='file').bytes++],
 ['changed hash',r=>r.find(x=>x.type==='file').sha256='0'.repeat(64)]
])test('exact complete signed member census refuses '+name,()=>{const r=rows();mutate(r);assert.throws(()=>validateChrome158Snapshot(r));});
test('whole package and HTTP checks do not accept a version label, redirect, truncation or encoded data',()=>{
 verifyPackageReceipt({bytes:PACKAGE.bytes,sha256:PACKAGE.sha256});
 for(const value of [{bytes:PACKAGE.bytes-1,sha256:PACKAGE.sha256},{bytes:PACKAGE.bytes,sha256:'0'.repeat(64)},{}])assert.throws(()=>verifyPackageReceipt(value));
 validatePackageResponse({status:200,encoding:undefined,length:String(PACKAGE.bytes),location:undefined});
 for(const change of [{status:302},{status:206},{encoding:'gzip'},{location:PACKAGE.url},{length:String(PACKAGE.bytes+1)}])
  assert.throws(()=>validatePackageResponse({status:200,length:String(PACKAGE.bytes),...change}));
});
test('new owned PID/executable identity is strict, with no .78 inheritance',()=>{
 const owned={pid:40,parentPid:20,startTicks:'99'},sample={...PINNED_BROWSER,...owned,state:'S'};
 assertPinnedOwnedBrowserIdentity(owned,sample,{...sample});
 for(const change of [{browserVersion:'157.0.8103.78'},{executable:'/opt/google/chrome/chrome'},{executableSha256:'0'.repeat(64)},{startTicks:'100'},{state:'Z'}])
  assert.throws(()=>assertPinnedOwnedBrowserIdentity(owned,sample,{...sample,...change}));
});
test('data-only profile and synthetic success never mint a real protected-tree capability',()=>{
 assert.throws(()=>assertProtectedBrowserCopy({state:'VERIFIED_ACTUAL_PROTECTED_BROWSER_COPY_REQUIRES_EXISTING_RUNTIME_PROOF'}));
 if(process.platform!=='linux')assert.equal(inspectProtectedBrowserCopy('/not-owned').state,'REFUSED_NO_BROWSER');
});
test('root consumes only an already-open bounded archive stream before standard data-only extraction',()=>{
 const shell=readFileSync(new URL('./run-isolated.sh',import.meta.url),'utf8'),inside=shell.slice(shell.indexOf('run_inside(){'),shell.indexOf('[[ $# == 0'));
 assert(inside.includes('/usr/bin/head -c 152741121 > "$browser_archive"'));
 assert(inside.indexOf('152741120 ]]')<inside.indexOf('/usr/bin/dpkg-deb --fsys-tarfile'));
 assert(inside.indexOf(PACKAGE.sha256)<inside.indexOf('/usr/bin/dpkg-deb --fsys-tarfile'));
 assert(inside.includes('--strip-components=4 --no-same-owner --no-same-permissions --no-overwrite-dir'));
 assert(inside.includes('-- ./opt/google/chrome'));assert(!inside.includes('dpkg -i')&&!inside.includes('postinst')&&!inside.includes('apt-get'));
 assert(inside.indexOf('nodev,noexec tmpfs /run')<inside.indexOf('--fsys-tarfile'));
 assert(inside.indexOf('chmod a=rX,u-s,g-s,o-t')<inside.indexOf('remount,ro,nosuid,nodev,exec /run'));
 assert(!inside.includes('readFileSync')&&!inside.includes('"$repo/'));
 const privilegedBeforeDrop=inside.slice(0,inside.indexOf('exec /usr/bin/setpriv'));
 assert(!privilegedBeforeDrop.split('\n').some(l=>/stat|realpath|sha256sum|mount |mkdir|find |chmod |rm --/.test(l)&&/\$out|\$repo|\$inputs|\$node/.test(l)));
});
test('ordinary per-role gate checks complete actual tree and active mount before acquiring browser',()=>{
 const driver=readFileSync(new URL('../publication-owner-browser.mjs',import.meta.url),'utf8'),verifier=readFileSync(new URL('./verified-chrome158-browser.mjs',import.meta.url),'utf8');
 assert(driver.includes("from './hosted-scenes/verified-chrome158-browser.mjs'"));
 assert(driver.indexOf('assertProtectedBrowserCopy(result.protectedBrowserCopy)')<driver.indexOf('browser=await launchChromium'));
 assert(verifier.includes("process.getuid()!==0")&&verifier.includes("observeDirectoryMount('/run')"));
 assert(verifier.includes('id.mountId===active.mountId')&&verifier.includes('PRIVATE_ROOT_FD_CHANGED'));
 assert(verifier.includes('validateChrome158Snapshot(record.files)')&&verifier.includes('PROFILE.nativeCalendar.pureDataObservation'));
 assert(!verifier.includes('/opt/')&&!verifier.includes('dpkg')&&!verifier.includes('writeFileSync'));
});
