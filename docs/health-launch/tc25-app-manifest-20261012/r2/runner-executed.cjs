const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const cwd = 'C:/xenios-wt/tc25-app-protection-run-20261012-r2';
const out = 'C:/Users/sboad/.codex/tmp/tc25-protection-r2-20261012';
const node = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe';
const git = 'C:/Program Files/Git/cmd/git.exe';
const base = '876ede5bb7e78fe9834900c4d9ca2924458b4698';
const head = '3ec5ec036a69cef107f17e59e0eb5bb3178d1f86';
const provenance = 'C:/Users/sboad/.codex/tmp/tc25-runtime-provenance-20261012.cjs';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const fileHash = p => sha(fs.readFileSync(p));
const gitRead = (...args) => cp.execFileSync(git,args,{cwd,encoding:'utf8',timeout:10000}).trim();
const env = {};
for (const key of ['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','COMSPEC','PATHEXT']) {
  if (process.env[key]) env[key] = process.env[key];
}
env.PATH = `${path.dirname(node)};C:/Program Files/Git/cmd;${process.env.SystemRoot}/System32`;
env.CI = '1';
env.NO_COLOR = '1';
env.NODE_OPTIONS = `--max-old-space-size=1024 --require=${provenance}`;
env.TEMP = path.join(out,'temp');
env.TMP = env.TEMP;
function snapshot() {
  if (gitRead('rev-parse','HEAD') !== head || gitRead('status','--porcelain')) throw Error('Candidate not clean/frozen');
  if (fs.lstatSync(path.join(cwd,'node_modules')).isSymbolicLink()) throw Error('Whole donor dependency link refused');
  for (const name of ['.vite','.vite-temp']) {
    if (fs.lstatSync(path.join(cwd,'node_modules',name)).isSymbolicLink()) throw Error('Donor cache link refused');
  }
  const inputs = ['package.json','package-lock.json','vitest.config.ts','server/core-site-protection.test.ts',
    'scripts/acceptance/verify-core-site-protection.mjs','docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json',
    'client/src/App.tsx','client/src/lib/content.ts','client/src/lib/careers.ts'];
  const files = inputs.map(p=>({path:p,blob:gitRead('rev-parse',`${head}:${p}`),rawSha256:fileHash(path.join(cwd,p)),
    lfSha256:sha(fs.readFileSync(path.join(cwd,p),'utf8').replace(/\r\n/g,'\n'))}));
  const names = ['vitest','vite','esbuild','@vitest/runner','@vitest/utils','@vitest/expect','@vitest/snapshot'];
  const lock = JSON.parse(fs.readFileSync(path.join(cwd,'package-lock.json'),'utf8'));
  const deps = names.map(name=>{
    const p = path.join(cwd,'node_modules',name,'package.json');
    const pkg = JSON.parse(fs.readFileSync(p,'utf8'));
    const wanted = lock.packages[`node_modules/${name}`]?.version;
    if (pkg.version !== wanted) throw Error(`Selected dependency differs from lock: ${name}`);
    return {name,version:pkg.version,expectedLockVersion:wanted,engines:pkg.engines??null,realPath:fs.realpathSync(p),sha256:fileHash(p)};
  });
  return {at:new Date().toISOString(),cwd,base,head,tree:gitRead('rev-parse',`${head}^{tree}`),
    mergeBase:gitRead('merge-base',base,head),changedPaths:gitRead('diff','--name-only',base,head).split('\n'),
    node:{path:node,sha256:fileHash(node),version:cp.execFileSync(node,['--version'],{cwd,env,encoding:'utf8',timeout:10000}).trim()},
    npm:{cli:path.join(path.dirname(node),'node_modules/npm/bin/npm-cli.js'),version:cp.execFileSync(node,[path.join(path.dirname(node),'node_modules/npm/bin/npm-cli.js'),'--version'],{cwd,env,encoding:'utf8',timeout:10000}).trim()},
    dependencyRoot:fs.realpathSync(path.join(cwd,'node_modules')),deps,files,
    hiddenLockSha256:fileHash(path.join(cwd,'node_modules','.package-lock.json')),
    entrypoints:['vitest/vitest.mjs','vite/dist/node/index.js','esbuild/lib/main.js','@esbuild/win32-x64/esbuild.exe'].map(p=>({path:p,sha256:fileHash(path.join(cwd,'node_modules',p))})),
    caches:{vite:fs.realpathSync(path.join(cwd,'node_modules','.vite')),viteTemp:fs.realpathSync(path.join(cwd,'node_modules','.vite-temp')),temp:env.TEMP},
    runnerSha256:fileHash(__filename),provenanceSha256:fileHash(provenance),
    limitations:['Selected dependency metadata/entrypoint hashes and historical Node20 reinstall receipt, not exhaustive installed-byte attestation',
      'File-only protection checks; no full S3/G0, application build, browser, SQL or live qualification',
      'No kernel PID or aggregate RSS caps, no machine-enforced hard output cap; raw outputs preserved',
      'Startup/exit provenance covers Node processes inheriting NODE_OPTIONS, not complete native descendant census'],
    commands:[
      {id:'protection-cli',exe:node,args:['scripts/acceptance/verify-core-site-protection.mjs',base,head],timeoutMs:60000},
      {id:'protection-single-file',exe:node,args:['node_modules/vitest/vitest.mjs','run','server/core-site-protection.test.ts','--config','vitest.config.ts','--maxWorkers=1','--no-file-parallelism'],timeoutMs:180000}],
    environment:{inheritedKeys:Object.keys(env),NODE_OPTIONS:env.NODE_OPTIONS,CI:env.CI,TEMP:env.TEMP,TMP:env.TMP,networkInputs:'NO_APP_OR_PROVIDER_ENV_FORWARDED'},
    fixtureScope:'Existing pure synthetic classifier/mutation tests plus file reads; no application server or database',
    cleanup:'No server or DB started. Terminate only known owned command process tree on timeout. Preserve raw logs and Node exit provenance; do not claim native owned-Job/G0 proof. Preserve original checkout/junction and isolated owned cache tree.'};
}
async function run(command) {
  const prefix = path.join(out,command.id);
  const runEnv = {...env,TC25_RUN_ID:command.id,TC25_PROVENANCE_FILE:`${prefix}-provenance.jsonl`};
  const startedAt = new Date().toISOString();
  const child = cp.spawn(command.exe,command.args,{cwd,env:runEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const chunks=[],stdout=[],stderr=[]; let timedOut=false; let error=null;
  child.stdout.on('data',b=>{chunks.push(b);stdout.push(b);}); child.stderr.on('data',b=>{chunks.push(b);stderr.push(b);});
  child.on('error',e=>{error=e.message;});
  const timer=setTimeout(()=>{timedOut=true; try {cp.execFileSync(`${process.env.SystemRoot}/System32/taskkill.exe`,['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:10000});} catch(e){error=String(e.message);}},command.timeoutMs);
  const result=await new Promise(resolve=>child.on('close',(exitCode,signal)=>resolve({exitCode,signal})));
  clearTimeout(timer);
  const bytes=Buffer.concat(chunks); fs.writeFileSync(`${prefix}.log`,bytes);
  fs.writeFileSync(`${prefix}-stdout.log`,Buffer.concat(stdout));
  fs.writeFileSync(`${prefix}-stderr.log`,Buffer.concat(stderr));
  const receipt={...command,...result,startedAt,endedAt:new Date().toISOString(),pid:child.pid,timedOut,error,
    logSha256:sha(bytes),logBytes:bytes.length,stdoutSha256:sha(Buffer.concat(stdout)),stdoutBytes:Buffer.concat(stdout).length,
    stderrSha256:sha(Buffer.concat(stderr)),stderrBytes:Buffer.concat(stderr).length,
    cleanup:{rootCloseObserved:true,timeoutTreeTerminationAttempted:timedOut,nativeJobOrFullDescendantCleanupCertified:false},
    provenanceSha256:fs.existsSync(`${prefix}-provenance.jsonl`)?fileHash(`${prefix}-provenance.jsonl`):null};
  fs.writeFileSync(`${prefix}-result.json`,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
  return receipt;
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  if(process.argv[2]==='freeze') {
    if(fs.existsSync(path.join(out,'preflight.json'))) throw Error('Do not overwrite existing freeze');
    const frozen=snapshot(); fs.writeFileSync(path.join(out,'preflight.json'),JSON.stringify(frozen,null,2)+'\n');
    console.log(JSON.stringify(frozen)); return;
  }
  if(process.argv[2]!=='run') throw Error('Expected freeze or run');
  const reservation=JSON.parse(fs.readFileSync(path.join(out,'reservation.json'),'utf8'));
  if(reservation.head!==head || reservation.cwd!==cwd || !reservation.actualCoordinatorAck || Date.now()<Date.parse(reservation.startsAt) || Date.now()>Date.parse(reservation.expiresAt)) throw Error('Missing/expired exact coordinator reservation');
  if(fs.existsSync(path.join(out,'started.json'))) throw Error('No replay of this run');
  const frozen=JSON.parse(fs.readFileSync(path.join(out,'preflight.json'),'utf8'));
  const fresh=snapshot(); const stable=x=>JSON.stringify({...x,at:null});
  if(stable(frozen)!==stable(fresh)) throw Error('Frozen command/runtime/dependency/source inputs changed');
  fs.writeFileSync(path.join(out,'started.json'),JSON.stringify({at:new Date().toISOString(),preflightSha256:fileHash(path.join(out,'preflight.json')),reservation},null,2)+'\n');
  const results=[];
  for(const command of frozen.commands) {
    if(Date.now()+command.timeoutMs>Date.parse(reservation.expiresAt)) throw Error('Remaining reserved window too short');
    const receipt=await run(command); results.push(receipt);
    if(receipt.exitCode!==0 || receipt.timedOut || receipt.error) break;
  }
  const after=snapshot(); fs.writeFileSync(path.join(out,'postflight.json'),JSON.stringify(after,null,2)+'\n');
  if(stable(frozen)!==stable(after)) throw Error('Inputs changed during run');
  process.exitCode=results.every(r=>r.exitCode===0&&!r.timedOut&&!r.error)?0:1;
})().catch(e=>{console.error(e.stack);process.exitCode=2;});
