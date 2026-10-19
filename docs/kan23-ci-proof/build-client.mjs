import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
const root = path.resolve(process.argv[2]), home = path.resolve(process.argv[3]);
const source = '2f4ff3ebb69c3b3239fbf8e6f55f9eac66801097', tree = 'f0c655d4154fc56c78b2482399a6b47d86aa3496';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const output = path.join(home, 'static-client-2f4ff3e'), cache = path.join(home, 'static-cache-2f4ff3e');
const report = { source, tree, status: 'FAIL', start: new Date().toISOString() };
function immutable() {
  assert.equal(process.version, 'v20.19.0');
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root,encoding:'utf8'}).trim(),source);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {cwd:root,encoding:'utf8'}).trim(),tree);
  assert.equal(hash(fs.readFileSync(path.join(root,'package-lock.json'))),'d25eb6b816b616cfa1dc7b1769c14971b944e5385bfae9be41e75d1cf5e64f74');
  execFileSync('git',['diff','--exit-code','HEAD'],{cwd:root,stdio:'pipe'});
}
function inventory(dir, prefix='') {
  return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{
    const full=path.join(dir,entry.name), relative=prefix ? prefix+'/'+entry.name : entry.name;
    assert.ok(!fs.lstatSync(full).isSymbolicLink());
    if(entry.isDirectory()) return inventory(full,relative);
    assert.ok(entry.isFile()); const bytes=fs.readFileSync(full);
    return [{path:relative,bytes:bytes.length,sha256:hash(bytes)}];
  });
}
assert.ok(!fs.existsSync(home),'Fresh one-attempt runtime directory required');
fs.mkdirSync(home,{recursive:true});
try {
  immutable();
  report.availableMiB=Number(/^MemAvailable:\s+(\d+)/m.exec(fs.readFileSync('/proc/meminfo','utf8'))?.[1]??0)/1024;
  assert.ok(report.availableMiB>=2304,'Unchanged build floor:2304MiB');
  const config=path.join(home,'vite.config.mjs');
  fs.writeFileSync(config,`import baseline from ${JSON.stringify(path.join(root,'vite.config.ts'))}; export default {...baseline,cacheDir:${JSON.stringify(cache)},build:{...baseline.build,outDir:${JSON.stringify(output)},emptyOutDir:false}};`,{flag:'wx'});
  const child=spawnSync(process.execPath,['--max-old-space-size=1536',path.join(root,'node_modules/vite/bin/vite.js'),'build','--config',config,'--configLoader','runner'],{cwd:root,env:process.env,timeout:180000,stdio:'inherit'});
  report.exit={status:child.status,signal:child.signal,error:child.error?.code??null};
  assert.equal(child.status,0,'Client build must exit zero'); immutable();
  const files=inventory(output); assert.ok(files.some(f=>f.path==='index.html'));
  const bytes=JSON.stringify({source,tree,runtime:process.version,output,files},null,2);
  fs.writeFileSync(path.join(home,'static-client-manifest-2f4ff3e.json'),bytes,{flag:'wx'});
  report.artifactManifest={sha256:hash(bytes),files:files.length};
  report.sourceUnchanged=true;report.status='PASS_STATIC_CLIENT_BUILD';
} catch(error) { report.failure=error.message;process.exitCode=1; }
finally { report.end=new Date().toISOString();fs.writeFileSync(path.join(home,'static-build-receipt-2f4ff3e.json'),JSON.stringify(report,null,2)); }
