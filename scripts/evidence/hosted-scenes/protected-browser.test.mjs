import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,mkdirSync,readdirSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {BROWSER_PACKAGE,parseBrowserPackageMetadata,validateBrowserSnapshot,protectedBrowserMode,assertProtectedDirectoryRows} from './protected-browser-policy.mjs';
import {inspectProtectedBrowserCopy,assertProtectedBrowserCopy,parseProtectedBrowserMounts,assertProtectedMetadataSnapshot,parseDirectoryFdInfo,parseActiveDirectoryMount} from './protected-browser.mjs';
import {PINNED_BROWSER} from '../lib/tb500-browser-identity.mjs';
const digest=(algorithm,bytes)=>createHash(algorithm).update(bytes).digest('hex');
const prefix='/opt/google/chrome',m='a'.repeat(32);
const input=()=>({status:'installed\t157.0.8103.78-1\tamd64',
 owners:[PINNED_BROWSER.launcherPath,PINNED_BROWSER.executable,prefix+'/resources.pak'].map(path=>'google-chrome-stable: '+path),
 md5sums:['google-chrome','chrome','resources.pak'].map(name=>m+'  opt/google/chrome/'+name).join('\n'),
 list:['/.','/opt','/opt/google',prefix,...['google-chrome','chrome','resources.pak'].map(name=>prefix+'/'+name)].join('\n')});
function rows(){return['google-chrome','chrome','resources.pak'].map((path,i)=>({path,type:'file',uid:0,mode:i<2?0o100555:0o100444,bytes:16,md5:m,
 sha256:[PINNED_BROWSER.launcherSha256,PINNED_BROWSER.executableSha256,'f'.repeat(64)][i]}));}
test('fixed package metadata uses exact local installed version and MD5, not vendor signature',()=>{
 const manifest=parseBrowserPackageMetadata(input()),value=validateBrowserSnapshot(rows(),manifest);
 assert.equal(value.packageVersion,BROWSER_PACKAGE.version);assert.equal(value.files,3);
 assert.match(value.integrity,/MD5.*NOT_VENDOR_SIGNATURE/);assert.match(value.sha256Purpose,/NOT_SIGNED_PACKAGE/);
});
for(const [name,mutate]of [
 ['package version',v=>v.status='installed\t157.0.8103.79-1\tamd64'],
 ['debian revision',v=>v.status='installed\t157.0.8103.78-2\tamd64'],
 ['architecture',v=>v.status='installed\t157.0.8103.78-1\tarm64'],
 ['not installed',v=>v.status='config-files\t157.0.8103.78-1\tamd64'],
 ['owner',v=>v.owners[0]='other-package: '+PINNED_BROWSER.launcherPath],
 ['missing owner',v=>v.owners.pop()],
 ['bad MD5',v=>v.md5sums=v.md5sums.replace(m,'g'.repeat(32))],
 ['duplicate checksum',v=>v.md5sums+='\n'+v.md5sums.split('\n')[0]],
 ['duplicate member',v=>v.list+='\n'+prefix+'/chrome'],
 ['traversal',v=>v.md5sums+='\n'+m+'  opt/google/chrome/../outside'],
 ['absolute checksum path',v=>v.md5sums+='\n'+m+'  /opt/google/chrome/outside'],
 ['missing resource',v=>v.md5sums=v.md5sums.split('\n').slice(0,2).join('\n')],
 ['unlisted package file',v=>v.list=v.list.split('\n').filter(s=>s!==prefix+'/chrome').join('\n')],
])test('package metadata refuses '+name,()=>{const value=input();mutate(value);assert.throws(()=>parseBrowserPackageMetadata(value));});
for(const [name,mutate]of [
 ['missing file',v=>v.pop()],['extra file',v=>v.push({...v[0],path:'unknown'})],
 ['duplicate path',v=>v.push({...v[0]})],['symlink',v=>v[0].type='symlink'],['device',v=>v[0].type='character-device'],
 ['wrong UID',v=>v[0].uid=1001],['world writable',v=>v[0].mode=0o100777],
 ['owner writable',v=>v[0].mode=0o100755],['setuid',v=>v[0].mode=0o104555],
 ['negative bytes',v=>v[0].bytes=-1],['unbounded file',v=>v[0].bytes=BROWSER_PACKAGE.maxFileBytes+1],
 ['wrong checksum',v=>v[2].md5='b'.repeat(32)],['wrong launcher SHA',v=>v[0].sha256='0'.repeat(64)],
 ['wrong ELF SHA',v=>v[1].sha256='0'.repeat(64)],['nonexecutable code',v=>v[1].mode=0o100444],
 ['traversal path',v=>v[2].path='../resources.pak'],
])test('copied snapshot refuses '+name,()=>{const value=rows();mutate(value);assert.throws(()=>validateBrowserSnapshot(value,parseBrowserPackageMetadata(input())));});
test('empty package member with matching local MD5 is preserved, not invented or omitted',()=>{
 const value=input(),md5=digest('md5',Buffer.alloc(0));value.md5sums+='\n'+md5+'  opt/google/chrome/empty';value.list+='\n'+prefix+'/empty';
 const files=rows();files.push({path:'empty',type:'file',uid:0,mode:0o100444,bytes:0,md5,sha256:digest('sha256',Buffer.alloc(0))});
 assert.equal(validateBrowserSnapshot(files,parseBrowserPackageMetadata(value)).files,4);
});
test('package-listed empty directory cannot silently disappear from the copied tree',()=>{
 const value=input();value.list+='\n'+prefix+'/empty-directory';
 assert.throws(()=>validateBrowserSnapshot(rows(),parseBrowserPackageMetadata(value)),/BROWSER_SNAPSHOT_MISSING_PACKAGE_MEMBER/);
 const snapshot=[...rows(),{path:'empty-directory',type:'directory',uid:0,mode:0o40555}];
 assert.equal(validateBrowserSnapshot(snapshot,parseBrowserPackageMetadata(value)).entries,4);
});
const mountLine=(path,flags='ro,nosuid,nodev',type='tmpfs',id=1)=>id+' 0 0:8 / '+path+' '+flags+' - '+type+' tmpfs rw';
const stage='/run/xenios-protected-browser',active={run:1,browser:2};
test('both fixed bind views must be the readonly protected tmpfs mounts',()=>{
 assert.equal(parseProtectedBrowserMounts(mountLine('/run')+'\n'+mountLine(prefix,undefined,undefined,2),stage,active).length,2);
});
for(const [name,text]of [
 ['writable bind',mountLine('/run')+'\n'+mountLine(prefix,'rw,nosuid,nodev',undefined,2)],
 ['missing nosuid',mountLine('/run')+'\n'+mountLine(prefix,'ro,nodev',undefined,2)],
 ['disk alias',mountLine('/run')+'\n'+mountLine(prefix,'ro,nosuid,nodev','ext4',2)],
 ['missing fixed path',mountLine('/run')],['duplicate fixed mount',mountLine('/run')+'\n'+mountLine(prefix)+'\n'+mountLine(prefix)],
])test('mount scope refuses '+name,()=>assert.throws(()=>parseProtectedBrowserMounts(text,stage,active)));
test('synthetic success text never creates an actual filesystem verification capability',()=>{
 assert.throws(()=>assertProtectedBrowserCopy({kind:'ACTUAL_PROTECTED_BROWSER_COPY_CONTENT_OBSERVATION',state:'VERIFIED_ACTUAL_PROTECTED_BROWSER_COPY_REQUIRES_EXISTING_RUNTIME_PROOF'}));
 if(process.platform!=='linux'){const value=inspectProtectedBrowserCopy('/not-an-owned-path');assert.equal(value.state,'REFUSED_NO_BROWSER');assert.throws(()=>assertProtectedBrowserCopy(value));}
});
test('every fixed protected package prerequisite must be observed and pass',()=>{
 const paths=['/var/lib/dpkg/info/google-chrome-stable.md5sums','/var/lib/dpkg/info/google-chrome-stable.list','/var/lib/dpkg/status','/usr/bin/dpkg-query'];
 const rows=paths.map(path=>({path,failure:null,sha256:'a'.repeat(64)}));assertProtectedMetadataSnapshot(rows);
 for(let i=0;i<rows.length;i++){const bad=rows.map(r=>({...r}));bad[i].failure='ENOENT';assert.throws(()=>assertProtectedMetadataSnapshot(bad));}
 assert.throws(()=>assertProtectedMetadataSnapshot(rows.slice(1)));
 assert.throws(()=>assertProtectedMetadataSnapshot(rows.map(r=>({...r,path:'/untrusted'}))));
});
test('sealed permissions preserve executable intent but never write or privilege bits',()=>{
 assert.equal(protectedBrowserMode({type:'file',mode:0o100777}),0o555);
 assert.equal(protectedBrowserMode({type:'file',mode:0o100644}),0o444);
 assert.equal(protectedBrowserMode({type:'directory',mode:0o40777}),0o555);
});
test('standard copy quarantines bytes; checksum validation still rejects changed copied content',()=>{
 const parent=realpathSync(tmpdir()),root=mkdtempSync(join(parent,'xenios-protected-copy-test-'));
 try{
  const source=join(root,'source'),copy=join(root,'copy');mkdirSync(source);mkdirSync(copy);const payload=Buffer.from('synthetic package data only');
  writeFileSync(join(source,'payload'),payload);
  const cp=process.platform==='win32'?'C:/Program Files/Git/usr/bin/cp.exe':'/usr/bin/cp';
  execFileSync(cp,['-R','--no-dereference','--no-preserve=mode,ownership,xattr,context,links','--',source+'/.',copy],{timeout:3000,stdio:'pipe'});
  assert.deepEqual(readFileSync(join(copy,'payload')),payload);
  const value=input(),md5=digest('md5',payload);value.md5sums+='\n'+md5+'  opt/google/chrome/payload';value.list+='\n'+prefix+'/payload';
  const file=()=>{const b=readFileSync(join(copy,'payload'));return{path:'payload',type:'file',uid:0,mode:0o100444,bytes:b.length,md5:digest('md5',b),sha256:digest('sha256',b)};};
  assert.equal(validateBrowserSnapshot([...rows(),file()],parseBrowserPackageMetadata(value)).files,4);
  writeFileSync(join(copy,'payload'),'changed');assert.throws(()=>validateBrowserSnapshot([...rows(),file()],parseBrowserPackageMetadata(value)),/BROWSER_INSTALLED_MD5_MISMATCH/);
 }finally{
  const target=realpathSync(root);assert(dirname(target)===parent&&/^xenios-protected-copy-test-[A-Za-z0-9]+$/.test(basename(target)));
  rmSync(target,{recursive:true});
 }
});
test('new signed archive is sealed in the private root and each role verifies before launch',()=>{
 const shell=readFileSync(new URL('./run-isolated.sh',import.meta.url),'utf8');
 const driver=readFileSync(new URL('../publication-owner-browser.mjs',import.meta.url),'utf8');
 const verifier=readFileSync(new URL('./verified-chrome158-browser.mjs',import.meta.url),'utf8');
 assert(shell.includes('size=1073741824,nr_inodes=8192,mode=0755,nosuid,nodev,noexec tmpfs /run'));
 assert(shell.includes('remount,ro,nosuid,nodev,exec /run'));
 assert(shell.includes('/usr/bin/find -P "$browser_stage" -type f -exec /usr/bin/chmod'));
 assert(shell.includes('/usr/bin/find -P "$browser_stage" -type d -exec /usr/bin/chmod'));
 assert(!shell.includes('/usr/bin/chmod -R')&&!shell.includes('chown'));
 assert(!shell.includes('$out/protected-browser')&&!shell.includes('rmdir'));
 assert(shell.includes('$protected_absent == true')&&shell.includes('noSharedBrowserPathRequested'));
 assert(!shell.includes('hostPinnedBrowserMetadataUnchanged'));
 assert(shell.indexOf('WHOLE_PACKAGE_HASH_VERIFIED_BEFORE_DATA_EXTRACTION')<shell.indexOf('/usr/bin/dpkg-deb --fsys-tarfile'));
 assert(shell.indexOf('/usr/bin/dpkg-deb --fsys-tarfile')<shell.indexOf('remount,ro,nosuid,nodev,exec /run'));
 const actual=driver.indexOf('result.protectedBrowserCopy=inspectProtectedBrowserCopy(dirname(out))');
 assert(actual>=0&&driver.indexOf('assertProtectedBrowserCopy(result.protectedBrowserCopy)')>actual&&driver.indexOf('browser=await launchChromium')>actual);
 assert(driver.includes("from './hosted-scenes/verified-chrome158-browser.mjs'"));
 assert(driver.includes('verifyPinnedOwnerNativeCalendarResource(browser)'));
 assert(verifier.includes("process.getuid()!==0")&&!verifier.includes('chmodSync')&&!verifier.includes('writeFileSync'));
 assert(verifier.indexOf('record.files=walk()')<verifier.indexOf('record.content=validateChrome158Snapshot'));
 assert(driver.indexOf('assertOwnerWholeRun(page,final,role,origin,embeddedSource)')>driver.indexOf("cleanup('ownedBrowserReleased'"));
});

test('privileged filesystem mutations never resolve through runner evidence or shared browser paths',()=>{
 const shell=readFileSync(new URL('./run-isolated.sh',import.meta.url),'utf8');
 const inside=shell.slice(shell.indexOf('run_inside(){'),shell.indexOf('[[ $# == 0'));
 assert(!inside.includes('chown'));
 assert(!inside.split('\n').some(line=>/mkdir|mount |find |chmod |rmdir|rm -/.test(line)&&line.includes('$out')));
 assert(!inside.includes('> "$out/')&&!inside.includes('>> "$out/'));
 assert(!inside.includes('cd -- "$repo"')&&!inside.includes('sha256sum "$out/'));
 assert(inside.includes('for anchor in / /run; do trusted_dir "$anchor"; done'));
 assert(inside.indexOf('trusted_dir "$anchor"')<inside.indexOf('/usr/bin/mount -t tmpfs'));
 assert(inside.indexOf('/usr/bin/mount --make-rprivate /')<inside.indexOf('/usr/bin/mount -t tmpfs'));
 assert(inside.indexOf('tmpfs /run')<inside.indexOf('mkdir -m 0700 -- "$browser_stage"'));
 assert(!inside.includes('umount')&&!inside.includes('rm -rf'));
 const withoutArchivePrefix=inside.replace('./opt/google/chrome','ARCHIVE_MEMBER_ONLY');assert(!withoutArchivePrefix.includes('/opt/'));
 const outer=shell.slice(shell.indexOf('[[ $# == 0'));
 assert(outer.includes('mkdir -- "$out/home"'));
 assert(!outer.includes('/usr/bin/chmod')&&!outer.includes('chown')&&!outer.includes('rmdir'));
 assert(outer.includes('privateBrowserPathAbsentInHost'));
 assert(outer.includes('> "$out/controller.stdout.log"'));
 assert(outer.includes('declare -f run_inside')&&outer.includes('-c "$inside_code"'));
 assert(outer.includes('exec {package_fd}< "$package"')&&outer.includes('<&"$package_fd"'));
 assert(!outer.includes('/opt/'));
});

test('tmp namespace source and controller use the same fixed private root with strict census',()=>{
 const shell=readFileSync(new URL('./run-isolated.sh',import.meta.url),'utf8');
 const controller=readFileSync(new URL('./controller.mjs',import.meta.url),'utf8');
 const mountVerifier=readFileSync(new URL('./protected-browser.mjs',import.meta.url),'utf8');
 assert(shell.includes('size=536870912,nr_inodes=8192,mode=1777,nosuid,nodev tmpfs /tmp'));
 assert(shell.includes('TMPDIR=/tmp'));
 assert(controller.includes("const ownedTmp = '/tmp';"));
 assert(controller.includes("assert.equal(env.TMPDIR, ownedTmp, 'PRIVATE_TMP_ENV')"));
 assert(controller.includes("result.privateTmpMount = observePrivateTmpMount()"));
 assert(mountVerifier.includes("(observed.mode&0o7777)===0o1777"));
 assert(mountVerifier.includes("['rw','nosuid','nodev']"));
 assert(mountVerifier.includes("!observed.mount.flags.includes('ro')"));
 assert(controller.includes("profileNames: readdirSync(ownedTmp).filter"));
 assert(controller.includes('result.cleanup.finalOwnedRelease = await confirmReleased()'));
});
test('the actual verifier cannot derive privileged stage from caller output or bless a fake mount',()=>{
 assert.equal(BROWSER_PACKAGE.privateRoot,stage,active);
 assert.equal(BROWSER_PACKAGE.privateMount,'/run');
 assert.throws(()=>parseProtectedBrowserMounts(mountLine('/run')+'\n'+mountLine(prefix),'/user-owned/protected-browser'),/FIXED_PROTECTED_BROWSER_STAGE/);
 const verifier=readFileSync(new URL('./protected-browser.mjs',import.meta.url),'utf8');
 assert(verifier.includes("const stage=PACKAGE.privateRoot"));
 assert(!verifier.includes("join(root,'protected-browser')"));
 assert(verifier.includes("trustedParents(PACKAGE.privateRoot+'/sentinel')"));
 assert(verifier.includes("trustedParents(PACKAGE.root+'/sentinel')"));
 assert(verifier.includes('a.dev===b.dev&&a.ino===b.ino'));
});

test('root-controlled ancestry validates every fixed anchor including filesystem root',()=>{
 const paths=['/','/run','/run/xenios-protected-browser'];
 const good=paths.map(path=>({path,canonical:path,directory:true,symlink:false,uid:0,mode:0o40755}));
 assert.deepEqual(assertProtectedDirectoryRows(good,paths),good);
 for(const index of [0,1,2])for(const delta of [{uid:1001},{mode:0o40777},{mode:0o40775},{symlink:true},{directory:false},{canonical:'/runner-alias'}]){
  const bad=good.map(r=>({...r}));Object.assign(bad[index],delta);
  assert.throws(()=>assertProtectedDirectoryRows(bad,paths),/PROTECTED_PACKAGE_METADATA_PARENT/);
 }
 assert.throws(()=>assertProtectedDirectoryRows(good.slice(1),paths),/PROTECTED_DIRECTORY_SCOPE/);
});

const stackedLine=(id,parent,path,flags='ro,nosuid,nodev',type='tmpfs',device='0:77')=>
 id+' '+parent+' '+device+' / '+path+' '+flags+' - '+type+' tmpfs rw';
const stackedRun=[stackedLine(10,1,'/run','rw,nosuid,nodev'),stackedLine(11,10,'/run')];
test('visible descriptor mount ID admits a valid readonly stack independent of row order',()=>{
 for(const rows of [stackedRun,[...stackedRun].reverse()]){
  const actual=parseActiveDirectoryMount(rows.join('\n'),'/run',11);
  assert.equal(actual.mountId,11);assert.equal(actual.parentId,10);assert.equal(actual.device,'0:77');
 }
 const mounts=parseProtectedBrowserMounts([...stackedRun,stackedLine(12,2,prefix)].join('\n'),stage,{run:11,browser:12});
 assert.deepEqual(mounts.map(m=>m.mountId),[11,12]);
 // Exact prior uniqueness-by-path predicate rejects this valid data; no mount is performed.
 assert.throws(()=>assert.equal(stackedRun.filter(line=>line.split(' ')[4]==='/run').length,1));
});
test('a preexisting tmp mount may be covered by the actual descriptor-selected private tmpfs',()=>{
 const value=[stackedLine(20,1,'/tmp','rw,nosuid,nodev','ext4','8:1'),stackedLine(21,20,'/tmp','rw,nosuid,nodev')].join('\n');
 assert.equal(parseActiveDirectoryMount(value,'/tmp',21).type,'tmpfs');
 assert.throws(()=>parseActiveDirectoryMount(value,'/tmp',20),/DIRECTORY_FD_MOUNT_IS_COVERED/);
});
for(const [label,body,path,id]of [
 ['missing active ID',stackedRun.join('\n'),'/run',99],
 ['covered descriptor ID',stackedRun.join('\n'),'/run',10],
 ['wrong path for active ID',stackedRun.join('\n'),'/tmp',11],
 ['duplicate ID',stackedRun.join('\n')+'\n'+stackedLine(11,10,'/run'),'/run',11],
 ['noninteger ID',stackedRun.join('\n'),'/run',1.5],
 ['caller-controlled path',stackedRun.join('\n'),'/runner/stage',11],
 ['missing parent field','11 0:77 / /run ro - tmpfs tmpfs rw','/run',11],
])test('active mount identity refuses '+label,()=>assert.throws(()=>parseActiveDirectoryMount(body,path,id)));
test('only descriptor identity, not an unrelated acceptable stack row, can satisfy protection flags',()=>{
 const body=[stackedLine(10,1,'/run'),stackedLine(11,10,'/run','rw,nosuid,nodev'),stackedLine(12,2,prefix)].join('\n');
 assert.throws(()=>parseProtectedBrowserMounts(body,stage,{run:11,browser:12}),/PROTECTED_BROWSER_READONLY_TMPFS/);
 assert.throws(()=>parseProtectedBrowserMounts(body,stage,{run:10,browser:12}),/DIRECTORY_FD_MOUNT_IS_COVERED/);
 assert.throws(()=>parseProtectedBrowserMounts(body,stage),/ACTUAL_PROTECTED_MOUNT_IDENTITIES_REQUIRED/);
});
test('directory fdinfo requires one bounded kernel mount ID and inode',()=>{
 assert.deepEqual(parseDirectoryFdInfo('pos:\t0\nflags:\t0300000\nmnt_id:\t11\nino:\t123\n'),{mountId:11,ino:'123'});
 for(const body of ['mnt_id:\t11\n','ino:\t123\n','mnt_id:\t11\nmnt_id:\t12\nino:\t123\n',
  'mnt_id:\t9007199254740992\nino:\t123\n','mnt_id:\t11\nino:\t0\n','mnt_id:\n11\nino:\t123\n'])
  assert.throws(()=>parseDirectoryFdInfo(body));
});
test('actual observation joins one no-follow directory FD to mount ID, inode and stable device before closing',()=>{
 const body=readFileSync(new URL('./protected-browser.mjs',import.meta.url),'utf8');
 for(const marker of ["constants.O_DIRECTORY|constants.O_NOFOLLOW","fstatSync(fd,{bigint:true})",
  "'/proc/self/fdinfo/'+fd","identity.ino===before.ino.toString()","['dev','ino','uid','gid','mode']",
  "DIRECTORY_IDENTITY_CHANGED","DIRECTORY_MOUNT_CHANGED","finally{if(fd!==undefined)closeSync(fd);}"])
  assert(body.includes(marker),marker);
 assert(body.includes('mounts,activeDirectories'));
});
