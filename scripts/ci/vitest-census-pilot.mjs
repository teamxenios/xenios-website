// Private CI-speed pilot. Stdlib only; Linux measurement, never a test/DB authority.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const now = () => Number(process.hrtime.bigint()) / 1e6;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const JSON_LIMIT = 32 * 1024 * 1024;
const OUTPUT_LIMIT = 32 * 1024 * 1024;
const MAX_SAMPLES = 1000;
const MAX_PIDS = 8192;
export const LIMITS = Object.freeze({ sampleIntervalMs: 1000, dockerIntervalMs: 5000,
  toolTimeoutMs: 2500, runTimeoutMs: 900000, terminateGraceMs: 5000, maxSamples: MAX_SAMPLES });
const PINNED = Object.freeze({
  'package-lock.json': 'd25eb6b816b616cfa1dc7b1769c14971b944e5385bfae9be41e75d1cf5e64f74',
  'vitest.config.ts': '24bdf9b67ddd363895a55879c07c779c5a367c399ea2fef1d17300f32382a5d0'
});
function fail(code) { throw Object.assign(new Error(code), { code }); }
export function limitedRead(file, limit = JSON_LIMIT) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { const stat = fs.fstatSync(fd); if (!stat.isFile() || stat.size > limit) fail('file_limit');
    const bytes = fs.readFileSync(fd); if (bytes.length > limit) fail('file_limit'); return bytes; } finally { fs.closeSync(fd); }
}
function physicalDirectory(root) {
  if (!path.isAbsolute(root) || fs.realpathSync(root) !== path.resolve(root)) fail('directory_alias');
  for (let p = path.resolve(root);; p = path.dirname(p)) {
    const stat = fs.lstatSync(p); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('directory_reparse');
    if (p === path.dirname(p)) break;
  }
  return root;
}
export function newJson(root, name, value) {
  if (!/^[a-z][a-z0-9.-]+\.json$/.test(name)) fail('evidence_name');
  physicalDirectory(root);
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  if (bytes.length > JSON_LIMIT) fail('json_limit');
  fs.writeFileSync(path.join(root, name), bytes, { flag: 'wx', mode: 0o600 });
}
function readJson(file) { return JSON.parse(limitedRead(file).toString('utf8')); }
export function parseProcStat(text) {
  const end = text.lastIndexOf(')'), open = text.indexOf('(');
  if (open < 1 || end < open) fail('proc_stat');
  const pid = Number(text.slice(0, open).trim()), f = text.slice(end + 1).trim().split(/\s+/);
  const result = { pid, state: f[0], ppid: Number(f[1]), pgid: Number(f[2]), sid: Number(f[3]), birth: f[19] };
  if (!Number.isSafeInteger(pid) || pid < 1 || !/^[0-9]+$/.test(result.birth ?? '')
    || ![result.ppid,result.pgid,result.sid].every(Number.isSafeInteger)) fail('proc_stat');
  return result;
}
function proc(pid) {
  try { return parseProcStat(limitedRead('/proc/' + pid + '/stat', 4096).toString()); }
  catch (e) { if (e.code === 'ENOENT' || e.code === 'ESRCH') return null; throw e; }
}
const key = p => p.pid + ':' + p.birth;
export function parseMemory(text) {
  const fields = Object.fromEntries([...text.matchAll(/^(MemTotal|MemAvailable):\s+(\d+) kB$/gm)]
    .map(m => [m[1], Number(m[2]) * 1024]));
  if (!Number.isSafeInteger(fields.MemTotal) || !Number.isSafeInteger(fields.MemAvailable)
    || fields.MemTotal <= 0 || fields.MemAvailable < 0 || fields.MemAvailable > fields.MemTotal) fail('memory_protocol');
  return { totalBytes: fields.MemTotal, availableBytes: fields.MemAvailable,
    usedEstimateBytes: fields.MemTotal - fields.MemAvailable };
}
export function parseDockerMemory(text) {
  const m = /^(\d+(?:\.\d+)?)\s*(B|kB|KB|KiB|MB|MiB|GB|GiB)\s*\/\s*(\d+(?:\.\d+)?)\s*(B|kB|KB|KiB|MB|MiB|GB|GiB)$/.exec(text);
  if (!m) fail('docker_memory_protocol');
  const scales = { B:1,kB:1000,KB:1000,KiB:1024,MB:1e6,MiB:1048576,GB:1e9,GiB:1073741824 };
  return { usedBytes: Math.ceil(Number(m[1]) * scales[m[2]]), limitBytes: Math.ceil(Number(m[3]) * scales[m[4]]) };
}
export function capacity(memory, cpus) {
  if (!Number.isSafeInteger(cpus) || cpus < 2 || memory.totalBytes < 6 * 1024 ** 3
    || memory.availableBytes < 2 * 1024 ** 3) fail('capacity_prerequisite');
  return { availableParallelism: cpus, ...memory, requestedMaxWorkers: 2,
    defaultWorkersFromPinnedSource: Math.max(cpus - 1, 1), largerHostMaySlow: cpus > 2 };
}
export function effectiveConfig(config) {
  const value = { maxWorkers: config.maxWorkers, pool: config.pool, isolate: config.isolate,
    fileParallelism: config.fileParallelism ?? true, allowOnly: config.allowOnly, retry: config.retry ?? 0, bail: config.bail ?? 0 };
  if (value.maxWorkers !== 2 || value.pool !== 'forks' || value.isolate !== true
    || value.fileParallelism === false || value.allowOnly !== false || value.retry !== 0 || value.bail !== 0) fail('effective_config');
  return value;
}
export function sameInventory(before, after) {
  return JSON.stringify([...before].sort()) === JSON.stringify([...after].sort());
}
async function tool(file, args, records) {
  if(records.some(r=>!r.exited))fail('sampler_tool_still_live');
  const toolStarted=now();
  const child = spawn(file, args, { shell:false, windowsHide:true, stdio:['ignore','pipe','pipe'] });
  const record = { kind:'read_only_sampler_tool', pid:child.pid ?? null, exited:false, code:null,
    signal:null, timedOut:false, outputComplete:true };
  records.push(record);
  let out = '', err = '', settled = false;
  return new Promise(resolve => {
    const done = () => { if (settled) return; settled = true; record.durationMs=now()-toolStarted; clearTimeout(timer); clearTimeout(backstop); resolve({ ...record, out, err }); };
    const capture = k => bytes => {
      if (!record.outputComplete) return;
      if (k === 'out') out += bytes; else err += bytes;
      if (Buffer.byteLength(out) + Buffer.byteLength(err) > 1048576) {
        record.outputComplete = false; child.kill('SIGKILL');
      }
    };
    child.stdout.on('data', capture('out')); child.stderr.on('data', capture('err'));
    child.once('error', () => { record.launchError = true; });
    child.once('close', (code, signal) => { Object.assign(record, { exited:true,code,signal }); done(); });
    const timer = setTimeout(() => { record.timedOut = true; child.kill('SIGKILL'); }, LIMITS.toolTimeoutMs);
    // A stuck OS/daemon tool is evidence failure, never an infinite sample.
    const backstop = setTimeout(() => { record.outputComplete = false; child.stdout.destroy(); child.stderr.destroy(); child.unref(); done(); },
      LIMITS.toolTimeoutMs + 1000);
  });
}
async function dockerIds(records) {
  const r = await tool('docker', ['ps','--quiet','--no-trunc'], records);
  if (!r.exited || r.code !== 0 || r.signal || r.timedOut || !r.outputComplete || r.err) fail('docker_inventory_unavailable');
  const ids = r.out.trim() ? r.out.trim().split(/\r?\n/) : [];
  if (ids.length > 128 || new Set(ids).size !== ids.length || ids.some(x => !/^[a-f0-9]{64}$/.test(x))) fail('docker_inventory_protocol');
  return ids.sort();
}
async function dockerSample(records) {
  const ids = await dockerIds(records);
  if (!ids.length) return { ids, observedBytes:0, containers:[] };
  const r = await tool('docker', ['stats','--no-stream','--no-trunc','--format','{{json .}}',...ids], records);
  if (!r.exited || r.code !== 0 || r.signal || r.timedOut || !r.outputComplete || r.err)
    return { ids, observedBytes:null, containers:[], completeForInventory:false, reason:'stats_race_or_unavailable' };
  const containers = r.out.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const p = JSON.parse(line);
    if (!ids.includes(p.ID)) fail('docker_stats_identity');
    return { id:p.ID, ...parseDockerMemory(p.MemUsage) };
  });
  if (new Set(containers.map(x=>x.id)).size !== containers.length) fail('docker_stats_duplicate');
  return { ids, observedBytes:containers.reduce((a,c)=>a+c.usedBytes,0), containers,
    completeForInventory:containers.length === ids.length };
}
function processSample(rootIdentity, tracked) {
  const names = fs.readdirSync('/proc').filter(x => /^[0-9]+$/.test(x));
  if (names.length > MAX_PIDS) fail('proc_inventory_limit');
  const live = new Map(); let disappeared = 0;
  for (const name of names) { const p = proc(Number(name)); if (p) live.set(p.pid,p); else disappeared++; }
  if (rootIdentity) tracked.set(key(rootIdentity),rootIdentity);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of live.values()) {
      if (tracked.has(key(p))) continue;
      const parent = live.get(p.ppid);
      if (parent && tracked.has(key(parent)) && BigInt(p.birth) >= BigInt(parent.birth)) { tracked.set(key(p),p); changed = true; }
    }
  }
  const observed = []; let rssBytes = 0;
  for (const p of live.values()) if (tracked.has(key(p))) {
    let rss = null;
    try { const status=limitedRead('/proc/'+p.pid+'/status',65536).toString();
      const match=/^VmRSS:\s+(\d+) kB$/m.exec(status); rss=match ? Number(match[1])*1024 : 0;
      const after=proc(p.pid); if (!after || key(after)!==key(p)) { disappeared++;continue; }
    } catch(e) { if(e.code==='ENOENT'){disappeared++;continue;}throw e; }
    rssBytes += rss; observed.push({...p,rssBytes:rss});
  }
  return { observed, rssBytes, disappeared, trackedIdentityCount:tracked.size };
}
export function signalOwned(child, identity, tracked, signal) {
  let groupSignalled = false;
  const actual = identity ? proc(identity.pid) : null;
  if (actual && key(actual) === key(identity) && actual.pgid === child.pid && actual.sid === child.pid) {
    try { process.kill(-child.pid, signal); groupSignalled=true; } catch(e) { if(e.code!=='ESRCH')throw e; }
  }
  for (const p of tracked.values()) {
    const current = proc(p.pid);
    if (current && key(current)===key(p) && current.state!=='Z') {
      try { process.kill(p.pid,signal); } catch(e) { if(e.code!=='ESRCH')throw e; }
    }
  }
  return groupSignalled;
}
export async function runObservedCommand({ command, args, cwd, env, root, runTimeoutMs=LIMITS.runTimeoutMs,
  sample=true, echo=true, externalStopSignal=null, keepSignalHandlers=false, outputLimitBytes=OUTPUT_LIMIT,
  rootIdentityReader=proc, observerHook=null }) {
  // The two function seams are synthetic API controls only; main never supplies them.
  if(!Number.isSafeInteger(outputLimitBytes)||outputLimitBytes<1024||outputLimitBytes>OUTPUT_LIMIT)fail('output_limit_argument');
  const started=now(), records=[], tracked=new Map(), samples=[], errors=[], signals=[];
  const result={ kind:'sampled-owned-command',command:path.basename(command),args,startedAt:new Date().toISOString(),
    testExitCode:null,testSignal:null,receivedSignal:null,stopReason:null,outputBytes:0,outputComplete:true,
    samples,tools:records,errors,signals,limits:LIMITS };
  const stdoutFd=fs.openSync(path.join(root,'census.stdout.log'),'wx',0o600);
  const stderrFd=fs.openSync(path.join(root,'census.stderr.log'),'wx',0o600);
  let child=null, identity=null, childClosed=false, rootExitedAt=null, stopAt=null, lastDocker=-Infinity;
  let testLaunchedAt=null, testClosedAt=null, beforeIds=null, afterIds=null, sampleStopped=false;
  let toolPending=null, escalated=false, finalTreeObserved=false;
  const note=code=>{if(!errors.includes(code))errors.push(code);};
  const send=signal=>{
    let group=false,retainedChild=false;
    try{if(child)group=signalOwned(child,identity,tracked,signal);}catch{note('birth_bound_signal_unavailable');}
    // This is the actual ChildProcess returned by spawn, not a PID reconstructed
    // from an empty/missing /proc observation or an unrelated process name.
    if(child&&!childClosed&&child.exitCode===null&&child.signalCode===null){
      try{retainedChild=child.kill(signal);}catch{note('retained_child_signal_unavailable');}
    }
    signals.push({signal,group,retainedChild});
  };
  const stop=(reason,signal='SIGTERM')=>{
    if(stopAt!==null)return;result.stopReason=reason;stopAt=now();send(signal);
  };
  const handler=signal=>{result.receivedSignal=signal;stop('external_signal',signal);};
  const onTerm=()=>handler('SIGTERM'),onInt=()=>handler('SIGINT');
  const copy=(fd,stream)=>chunk=>{
    result.outputBytes+=chunk.length;
    if(result.outputBytes>outputLimitBytes){result.outputComplete=false;stop('output_limit');return;}
    try{let n=0;while(n<chunk.length)n+=fs.writeSync(fd,chunk,n,chunk.length-n);}
    catch{result.outputComplete=false;stop('output_write');}
    if(echo&&!stream.write(chunk)){
      const input=fd===stdoutFd?child.stdout:child.stderr;input.pause();stream.once('drain',()=>input.resume());
    }
  };
  const knownLive=()=>{
    const live=[];
    for(const p of tracked.values()){
      const current=proc(p.pid);if(current&&key(current)===key(p)&&current.state!=='Z')live.push(current);
    }
    return live;
  };
  const driveTerminal=async reason=>{
    if(!child)return;
    if(stopAt===null)stop(reason);
    if(!escalated&&now()-stopAt>=LIMITS.terminateGraceMs){send('SIGKILL');escalated=true;}
    // If an OS call delayed entry, still observe close after the one escalation.
    const deadline=Math.max(stopAt+LIMITS.terminateGraceMs,now())+2000;
    while(now()<deadline){
      let live=null;try{live=knownLive();}catch{note('shutdown_identity_observation');}
      if(childClosed&&live!==null&&live.length===0)break;
      if(!escalated&&now()-stopAt>=LIMITS.terminateGraceMs){send('SIGKILL');escalated=true;}
      await pause(25);
    }
    if(!childClosed)note('captured_child_close_unavailable');
    try{if(knownLive().length)note('known_descendant_still_live');}catch{note('shutdown_identity_observation');}
  };
  try{
    if(sample){beforeIds=await dockerIds(records);if(beforeIds.length)fail('preexisting_container_inventory');}
    testLaunchedAt=now();
    child=spawn(command,args,{cwd,env,detached:true,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    result.pid=child.pid??null;
    // Install custody/pipe/close handling before any fallible birth observer.
    child.stdout.on('data',copy(stdoutFd,process.stdout));child.stderr.on('data',copy(stderrFd,process.stderr));
    child.once('error',()=>{note('test_launch');stop('test_launch');});
    child.once('exit',(code,signal)=>{result.testExitCode=code;result.testSignal=signal;rootExitedAt=now();});
    child.once('close',()=>{childClosed=true;testClosedAt=now();});
    process.on('SIGTERM',onTerm);process.on('SIGINT',onInt);
    identity=child.pid?await rootIdentityReader(child.pid):null;
    if(identity&&(identity.pid!==child.pid||!/^[0-9]+$/.test(identity.birth??'')
      ||!Number.isSafeInteger(identity.pgid)||!Number.isSafeInteger(identity.sid)))identity=null;
    if(identity){tracked.set(key(identity),identity);}else{note('root_birth_unavailable');sampleStopped=true;stop('root_birth_unavailable');}
    result.rootIdentity=identity;
    if(observerHook)await observerHook({pid:child.pid});
    if(externalStopSignal)handler(externalStopSignal);
    let nextSample=started;
    while(!childClosed){
      const t=now();
      if(t-started>=runTimeoutMs)stop('pilot_outer_deadline');
      if(rootExitedAt!==null&&t-rootExitedAt>2000)stop('root_exit_with_open_streams');
      if(stopAt!==null){
        if(!escalated&&t-stopAt>=LIMITS.terminateGraceMs){send('SIGKILL');escalated=true;}
        if(t-stopAt>LIMITS.terminateGraceMs+2000){note('captured_child_close_unavailable');break;}
      }
      if(sample&&!sampleStopped&&t>=nextSample){
        if(samples.length>=MAX_SAMPLES){sampleStopped=true;note('sample_limit');stop('observer_exception');}
        else{
          const began=now();
          try{
            const tree=processSample(identity,tracked),memory=parseMemory(limitedRead('/proc/meminfo',65536).toString());
            samples.push({elapsedMs:t-started,...memory,...tree,durationMs:now()-began});
          }catch{note('process_or_vm_sample');sampleStopped=true;stop('observer_exception');}
          if(!sampleStopped&&t-lastDocker>=LIMITS.dockerIntervalMs){
            lastDocker=t;toolPending=dockerSample(records).then(value=>{if(samples.length)samples.at(-1).docker=value;})
              .catch(()=>{note('docker_sample');sampleStopped=true;stop('observer_exception');});
          }
        }
        nextSample=t+LIMITS.sampleIntervalMs;
      }
      if(toolPending){await toolPending;toolPending=null;}
      await pause(50);
    }
  }catch(e){note(typeof e.code==='string'?e.code:'observer_exception');if(child)stop('observer_exception');}
  finally{
    // Every adverse path uses the same bounded retained-child TERM/KILL/close
    // protocol, including missing birth and exceptions outside the main loop.
    if(child){
      if(!childClosed||stopAt!==null)await driveTerminal('observer_exception');
      if(identity){
        try{
          let tree=processSample(identity,tracked);const drainEnd=now()+2000;
          while(tree.observed.some(p=>p.state!=='Z')&&now()<drainEnd){await pause(50);tree=processSample(identity,tracked);}
          if(tree.observed.some(p=>p.state!=='Z')){
            result.cleanupIntervened=true;await driveTerminal('descendant_residual');
          }
          result.remainingObserved=processSample(identity,tracked).observed.filter(p=>p.state!=='Z');finalTreeObserved=true;
        }catch{note('final_process_observation');}
      }else{result.remainingObserved=null;note('tree_birth_scope_unknown');}
      // Destroying/unref-ing is not death evidence; close=false is retained.
      if(!childClosed){child.stdout.destroy();child.stderr.destroy();child.unref();}
    }
    if(toolPending){await toolPending;toolPending=null;}
    try{if(sample)afterIds=await dockerIds(records);}catch{note('final_docker_inventory');}
    try{fs.closeSync(stdoutFd);}catch{note('stdout_close');}
    try{fs.closeSync(stderrFd);}catch{note('stderr_close');}
  }
  result.finishedAt=new Date().toISOString();result.durationMs=now()-started;
  result.censusProcessDurationMs=testLaunchedAt!==null&&testClosedAt!==null?testClosedAt-testLaunchedAt:null;
  result.childClosed=childClosed;result.capturedChildVerifiedClosed=childClosed&&rootExitedAt!==null;
  result.rootBirthKnown=identity!==null;result.containerBefore=beforeIds;result.containerAfter=afterIds;
  result.containerInventoryConserved=sample&&beforeIds!==null&&afterIds!==null?sameInventory(beforeIds,afterIds):null;
  result.containerOwnership='Running-VM inventory only; stopped containers/networks/volumes and timing-derived ownership are not proved; observer never removes containers';
  result.knownObservedProcessesExited=identity!==null&&finalTreeObserved&&result.capturedChildVerifiedClosed
    &&Array.isArray(result.remainingObserved)&&result.remainingObserved.length===0;
  result.allSamplerToolsExited=records.every(r=>r.exited);
  result.samplingCoverage={firstSampleAfterLaunchMs:samples.length&&testLaunchedAt!==null?samples[0].elapsedMs-(testLaunchedAt-started):null,
    lastSampleToCloseMs:samples.length&&testClosedAt!==null?testClosedAt-(started+samples.at(-1).elapsedMs):null,
    processSampleWallMs:samples.reduce((sum,x)=>sum+x.durationMs,0),samplerToolWallMs:records.reduce((sum,x)=>sum+(x.durationMs??0),0),
    note:'Wall costs overlap child execution; not exact CPU overhead or continuous coverage'};
  result.sampledHighWater={
    vmUsedEstimateBytes:samples.length?Math.max(...samples.map(s=>s.usedEstimateBytes)):null,
    knownTreeRssBytes:samples.length?Math.max(...samples.map(s=>s.rssBytes)):null,
    dockerObservedBytes:samples.some(s=>Number.isSafeInteger(s.docker?.observedBytes))?Math.max(...samples.filter(s=>Number.isSafeInteger(s.docker?.observedBytes)).map(s=>s.docker.observedBytes)):null,
    maxGapMs:samples.length>1?Math.max(...samples.slice(1).map((s,i)=>s.elapsedMs-samples[i].elapsedMs)):null,
    label:'Sampled estimates: sequential RSS/Docker sums are non-atomic and not rigorous simultaneous-peak lower bounds; RSS can double-count shared pages; VM MemAvailable is an estimate; never add the series'
  };
  result.dockerCoverage={attempts:samples.filter(s=>s.docker).length,
    partial:samples.filter(s=>s.docker&&!s.docker.completeForInventory&&s.docker.ids.length).length,
    nonemptyComplete:samples.filter(s=>s.docker?.completeForInventory&&s.docker.ids.length).length,
    nonemptyObserved:samples.filter(s=>s.docker?.ids.length).length};
  const dispose=()=>{process.removeListener('SIGTERM',onTerm);process.removeListener('SIGINT',onInt);};
  Object.defineProperty(result,'disposeSignalHandlers',{value:dispose});if(!keepSignalHandlers)dispose();
  return result;
}
function reporterRoot(){
  const root=physicalDirectory(process.env.XENIOS_CI_CENSUS_ROOT??'');
  const owner=readJson(path.join(root,'owner.json'));
  if(owner.nonce!==process.env.XENIOS_CI_CENSUS_NONCE || owner.kind!=='private-census-pilot-v1')fail('reporter_owner');
  return {root,owner};
}
const sortedIds=values=>{
  if(!Array.isArray(values)||values.some(x=>typeof x!=='string'||!x)||new Set(values).size!==values.length)fail('module_identity');
  return [...values].sort();
};
const idsEqual=(a,b)=>JSON.stringify(sortedIds(a))===JSON.stringify(sortedIds(b));
function moduleIdentity(module){
  const id=module.moduleId??module.task?.filepath;if(typeof id!=='string'||!id)fail('module_identity');return id;
}
const COUNTER_KEYS=['numTotalTests','numPassedTests','numFailedTests','numPendingTests','numTodoTests',
  'numTotalTestSuites','numPassedTestSuites','numFailedTestSuites','numPendingTestSuites'];
export function taskSnapshot(modules){
  const ids=sortedIds(modules.map(moduleIdentity)),testIds=new Set(),rows=[];
  const totals=Object.fromEntries(COUNTER_KEYS.map(k=>[k,0]));
  let unsettledTasks=0;
  const statusMap={fail:'failed',only:'pending',pass:'passed',run:'pending',skip:'skipped',todo:'todo',queued:'pending'};
  for(const module of modules){
    const id=moduleIdentity(module),file=module.task,assertions=[],suiteStates=[],testStates=[];let hasFailed=false;
    if(!file||file.type!=='suite'||file.filepath!==id)fail('module_task_binding');
    const visit=(task,ancestors)=>{
      const mode=task.mode??'run',state=task.result?.state;
      if(typeof task.name!=='string'||!['run','skip','todo','only'].includes(mode)
        ||state!==undefined&&!['pass','fail','skip','todo','only','run','queued'].includes(state))fail('task_state');
      if(state==='run'||state==='queued'||state==='only'||state===undefined&&!['skip','todo'].includes(mode))unsettledTasks++;
      if(task.type==='suite'){
        if(!Array.isArray(task.tasks))fail('task_tree');
        suiteStates.push({mode,state:state??null});totals.numTotalTestSuites++;
        if(state==='fail')totals.numFailedTestSuites++;
        if(state==='run'||state==='queued'||mode==='todo')totals.numPendingTestSuites++;
        for(const child of task.tasks)visit(child,task===file?ancestors:[...ancestors,task.name]);
      }else if(task.type==='test'){
        if(typeof task.id!=='string'||!task.id||testIds.has(task.id))fail('test_task_identity');testIds.add(task.id);
        testStates.push({mode,state:state??null});totals.numTotalTests++;
        if(state==='pass')totals.numPassedTests++;
        if(state==='fail'){totals.numFailedTests++;hasFailed=true;}
        // Pinned4.1.10 predicates intentionally permit pending/todo overlap.
        if(state==='run'||state==='queued'||mode==='skip'||state==='skip')totals.numPendingTests++;
        if(mode==='todo')totals.numTodoTests++;
        assertions.push({ancestorTitles:ancestors,fullName:task.name?[...ancestors,task.name].join(' '):ancestors.join(' '),
          title:task.name,status:statusMap[state||mode]||'skipped'});
      }else fail('task_type');
    };
    visit(file,[]);
    rows.push({id,status:file.result?.state==='fail'||hasFailed?'failed':'passed',assertions,suiteStates,testStates});
  }
  totals.numPassedTestSuites=totals.numTotalTestSuites-totals.numFailedTestSuites-totals.numPendingTestSuites;
  return {runEndIds:ids,modules:rows.sort((a,b)=>a.id.localeCompare(b.id)),totals,unsettledTasks};
}
export function totalsFromRecordedTasks(rows){
  if(!Array.isArray(rows))fail('recorded_task_protocol');
  const totals=Object.fromEntries(COUNTER_KEYS.map(k=>[k,0]));let unsettled=0;
  for(const row of rows){
    if(!Array.isArray(row.suiteStates)||!row.suiteStates.length||!Array.isArray(row.testStates)
      ||!Array.isArray(row.assertions)||row.assertions.length!==row.testStates.length)fail('recorded_task_protocol');
    for(const [kind,facts] of [['suite',row.suiteStates],['test',row.testStates]])for(const fact of facts){
      if(!fact||!['run','skip','todo','only'].includes(fact.mode)
        ||fact.state!==null&&!['pass','fail','skip','todo','only','run','queued'].includes(fact.state))fail('recorded_task_state');
      const state=fact.state,mode=fact.mode;
      if(state==='run'||state==='queued'||state==='only'||state===null&&!['skip','todo'].includes(mode))unsettled++;
      if(kind==='suite'){
        totals.numTotalTestSuites++;if(state==='fail')totals.numFailedTestSuites++;
        if(state==='run'||state==='queued'||mode==='todo')totals.numPendingTestSuites++;
      }else{
        totals.numTotalTests++;if(state==='pass')totals.numPassedTests++;if(state==='fail')totals.numFailedTests++;
        if(state==='run'||state==='queued'||mode==='skip'||state==='skip')totals.numPendingTests++;
        if(mode==='todo')totals.numTodoTests++;
      }
    }
  }
  const statusMap={fail:'failed',only:'pending',pass:'passed',run:'pending',skip:'skipped',todo:'todo',queued:'pending'};
  for(const row of rows){
    row.testStates.forEach((fact,i)=>{
      if(row.assertions[i].status!==(statusMap[fact.state||fact.mode]||'skipped'))fail('recorded_status_mismatch');
    });
    const expectedFile=row.suiteStates[0].state==='fail'||row.testStates.some(f=>f.state==='fail')?'failed':'passed';
    if(row.status!==expectedFile)fail('recorded_file_status_mismatch');
  }
  totals.numPassedTestSuites=totals.numTotalTestSuites-totals.numFailedTestSuites-totals.numPendingTestSuites;
  return {totals,unsettled};
}
export function validateReporterClosure(collection,end){
  if(!collection||!end||!Array.isArray(end.modules)||!end.totals)fail('reporter_protocol');
  const ids=sortedIds(collection.files);
  if(!ids.length||!idsEqual(ids,end.startedIds)||!idsEqual(ids,end.endedIds)||!idsEqual(ids,end.runEndIds)
    ||!idsEqual(ids,end.modules.map(m=>m.id)))fail('module_set_mismatch');
  if(end.moduleCount!==ids.length||end.started!==ids.length||end.ended!==ids.length||end.activeAtEnd!==0)fail('module_count_mismatch');
  if(end.unhandledErrors!==0||end.reason!=='passed'||end.unsettledTasks!==0)fail('unclosed_run');
  if(!COUNTER_KEYS.every(k=>Number.isSafeInteger(end.totals[k])&&end.totals[k]>=0)||end.totals.numTotalTests===0)fail('empty_or_invalid_census');
  const actual=totalsFromRecordedTasks(end.modules);
  if(COUNTER_KEYS.some(k=>actual.totals[k]!==end.totals[k])||actual.unsettled!==end.unsettledTasks)fail('recorded_totals_mismatch');
  return ids;
}
export function validateCompleteness(collection,end,report){
  const ids=validateReporterClosure(collection,end);
  if(!report||!Array.isArray(report.testResults)||typeof report.success!=='boolean')fail('vitest_json_protocol');
  const jsonIds=sortedIds(report.testResults.map(f=>f.name));
  if(!idsEqual(ids,jsonIds))fail('json_module_set_mismatch');
  for(const k of COUNTER_KEYS)if(!Number.isSafeInteger(report[k])||report[k]<0||report[k]!==end.totals[k])fail('json_totals_mismatch');
  const projected=report.testResults.map(file=>{
    if(!['passed','failed'].includes(file.status)||!Array.isArray(file.assertionResults))fail('json_module_protocol');
    const assertions=file.assertionResults.map(a=>{
      if(!Array.isArray(a.ancestorTitles)||a.ancestorTitles.some(x=>typeof x!=='string')
        ||typeof a.fullName!=='string'||typeof a.title!=='string'
        ||!['passed','failed','skipped','todo','pending'].includes(a.status))fail('json_assertion_protocol');
      return {ancestorTitles:a.ancestorTitles,fullName:a.fullName,title:a.title,status:a.status};
    });
    return {id:file.name,status:file.status,assertions};
  }).sort((a,b)=>a.id.localeCompare(b.id));
  const expected=end.modules.map(({id,status,assertions})=>({id,status,assertions}));
  if(JSON.stringify(projected)!==JSON.stringify(expected))fail('json_assertion_mismatch');
  const expectedSuccess=ids.length>0&&end.totals.numFailedTestSuites===0&&end.totals.numFailedTests===0;
  if(report.success!==expectedSuccess||!report.success)fail('json_success_mismatch');
  return {complete:true,moduleCount:ids.length,totals:end.totals,
    moduleAssertionManifestSha256:sha(Buffer.from(JSON.stringify(projected)))};
}
export default class CensusPilotReporter {
  onInit(ctx){
    const {root,owner}=reporterRoot();this.root=root;this.owner=owner;this.ctx=ctx;
    this.active=new Set();this.startedIds=new Set();this.endedIds=new Set();this.peak=0;this.started=0;this.ended=0;
    newJson(root,'effective-config.json',{nonce:owner.nonce,pid:process.pid,config:effectiveConfig(ctx.config)});
  }
  onTestRunStart(specs){
    this.runStarted=now();const projects=new Set(specs.map(s=>s.project));
    if(projects.size!==1)fail('unexpected_project_partition');
    const configs=[...projects].map(p=>effectiveConfig({...this.ctx.config,...Object.fromEntries(Object.entries(p.config).filter(([,v])=>v!==undefined))}));
    this.collection={nonce:this.owner.nonce,files:sortedIds(specs.map(s=>s.moduleId)),configs};
    if(!this.collection.files.length)fail('empty_or_invalid_census');
    this.collected=new Set(this.collection.files);newJson(this.root,'collection.json',this.collection);
  }
  onTestModuleStart(module){
    const id=moduleIdentity(module);
    if(!this.collected?.has(id)||this.startedIds.has(id))fail('module_start_identity');
    this.startedIds.add(id);this.active.add(id);this.started++;this.peak=Math.max(this.peak,this.active.size);
  }
  onTestModuleEnd(module){
    const id=moduleIdentity(module);
    if(!this.active.delete(id)||this.endedIds.has(id))fail('module_end_identity');
    this.endedIds.add(id);this.ended++;
  }
  onTestRunEnd(modules,errors,reason){
    const snapshot=taskSnapshot(modules);
    const end={nonce:this.owner.nonce,pid:process.pid,reason,moduleCount:modules.length,
      unhandledErrors:errors.length,started:this.started,ended:this.ended,
      startedIds:[...this.startedIds].sort(),endedIds:[...this.endedIds].sort(),
      activeAtEnd:this.active.size,observedPeakActiveModuleIntervals:this.peak,
      runDurationMs:now()-this.runStarted,...snapshot,label:'Actual reporter intervals, NOT total worker process count'};
    newJson(this.root,'reporter-end.json',end);
    validateReporterClosure(this.collection,end);
  }
}
function sourceEvidence(repo){
  const git=args=>execFileSync('git',args,{cwd:repo,timeout:5000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']});
  const head=git(['rev-parse','HEAD']).toString().trim();
  const tree=git(['rev-parse','HEAD^{tree}']).toString().trim();
  const allowed=new Set(['.github/workflows/checks.yml','scripts/evidence/owned-runner-browser-qa.mjs','scripts/ci/vitest-census-pilot.mjs','scripts/ci/vitest-census-pilot.node-test.mjs']);
  const changed=git(['diff','--name-only','f65ba9c3e5d6820d4fa300087e86c4072e4c2bfd','HEAD']).toString().trim().split(/\r?\n/).filter(Boolean);
  if(changed.some(p=>!allowed.has(p)))fail('comparison_source_changed');
  if(head!==process.env.GITHUB_SHA)fail('executed_head');
  if(git(['status','--porcelain']).length)fail('dirty_source');
  const paths=['.github/workflows/checks.yml','scripts/evidence/owned-runner-browser-qa.mjs',
    'scripts/ci/vitest-census-pilot.mjs','scripts/ci/vitest-census-pilot.node-test.mjs',...Object.keys(PINNED)];
  const files=paths.map(p=>{const actual=limitedRead(path.join(repo,p)),committed=git(['cat-file','blob',head+':'+p]);
    if(!actual.equals(committed))fail('source_bytes');
    const hash=sha(actual);if(PINNED[p]&&PINNED[p]!==hash)fail('frozen_source_pin');return {path:p,bytes:actual.length,sha256:hash};});
  return {executedHead:head,executedTree:tree,baseSource:'f65ba9c3e5d6820d4fa300087e86c4072e4c2bfd',changedPaths:changed,candidateHead:process.env.XENIOS_CI_CANDIDATE_SHA??null,files};
}
function counts(root,repo){
  const raw=limitedRead(path.join(root,'vitest-results.json')),report=JSON.parse(raw.toString('utf8'));
  if(!report||!Array.isArray(report.testResults))fail('vitest_json_protocol');
  return {report,summary:{success:report.success,...Object.fromEntries(COUNTER_KEYS.map(k=>[k,report[k]])),
    fileCount:report.testResults.length,rawJsonSha256:sha(raw)}};
}
async function main(){
  if(process.platform!=='linux'||process.versions.node!=='20.19.0'||process.env.CI!=='true')fail('pilot_runtime');
  for(const name of ['VITEST_MAX_WORKERS','UPDATE_FIRST_RELEASE_DOC'])if(process.env[name]!==undefined)fail('unexpected_environment_override');
  const repo=physicalDirectory(path.resolve(path.dirname(SELF),'../..'));
  const parent=physicalDirectory(process.env.RUNNER_TEMP??'');
  if(parent===repo||parent.startsWith(repo+path.sep))fail('artifact_in_source');
  const root=fs.mkdtempSync(path.join(parent,'xenios-ci-census-pilot-'));fs.chmodSync(root,0o700);
  const nonce=randomUUID();newJson(root,'owner.json',{kind:'private-census-pilot-v1',nonce});
  const evidence={kind:'private-census-speed-pilot-not-release-or-authority',nonce,qualified:false,limits:LIMITS};
  let result=null;
  try{
    evidence.sourceBefore=sourceEvidence(repo);
    evidence.capacity=capacity(parseMemory(limitedRead('/proc/meminfo',65536).toString()),os.availableParallelism());
    const version=readJson(path.join(repo,'node_modules/vitest/package.json')).version;
    if(version!=='4.1.10')fail('vitest_version');
    const env={...process.env,XENIOS_CI_CENSUS_ROOT:root,XENIOS_CI_CENSUS_NONCE:nonce};
    result=await runObservedCommand({command:'npx',args:['vitest','run','--maxWorkers=2','--reporter=default','--reporter=json',
      '--reporter='+SELF,'--outputFile.json='+path.join(root,'vitest-results.json')],cwd:repo,env,root,keepSignalHandlers:true});
    evidence.command=result;
    const json=counts(root,repo);evidence.counts=json.summary;evidence.effective=readJson(path.join(root,'effective-config.json'));
    evidence.collection=readJson(path.join(root,'collection.json'));evidence.reporter=readJson(path.join(root,'reporter-end.json'));
    if([evidence.effective,evidence.collection,evidence.reporter].some(x=>x.nonce!==nonce))fail('reporter_binding');
    evidence.completeness=validateCompleteness(evidence.collection,evidence.reporter,json.report);
    const sampledPids=new Set(result.samples.flatMap(x=>x.observed.map(p=>p.pid)));
    if(evidence.effective.pid!==evidence.reporter.pid||!sampledPids.has(evidence.effective.pid))fail('reporter_process_binding');
    evidence.sourceAfter=sourceEvidence(repo);
    if(JSON.stringify(evidence.sourceBefore)!==JSON.stringify(evidence.sourceAfter))fail('source_changed');
    evidence.qualified=result.testExitCode===0&&!result.testSignal&&!result.receivedSignal&&!result.stopReason
      &&result.childClosed&&result.outputComplete&&result.errors.length===0&&result.samples.length>0
      &&result.knownObservedProcessesExited&&result.allSamplerToolsExited&&!result.cleanupIntervened
      &&(result.dockerCoverage.nonemptyObserved===0||result.dockerCoverage.nonemptyComplete>0)
      &&result.containerInventoryConserved===true&&evidence.counts.success&&evidence.counts.numFailedTests===0
      &&evidence.completeness.complete===true&&evidence.reporter.observedPeakActiveModuleIntervals>=2
      &&evidence.reporter.reason==='passed';
  }catch(e){evidence.failureCode=typeof e.code==='string'?e.code:'pilot_evidence_unavailable';}
  if(result?.receivedSignal)evidence.qualified=false;
  try{newJson(root,'pilot.json',evidence);}finally{result?.disposeSignalHandlers();}
  console.log(JSON.stringify({censusPilotEvidence:root,qualified:evidence.qualified,testExitCode:result?.testExitCode??null}));
  if(result?.receivedSignal||result?.testSignal){const signal=result.receivedSignal??result.testSignal;
    process.kill(process.pid,signal);return;}
  process.exitCode=result?.testExitCode!==null&&result?.testExitCode!==undefined&&result.testExitCode!==0
    ?result.testExitCode:evidence.qualified?0:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===SELF){
  main().catch(()=>{console.error('CENSUS_PILOT_TERMINAL_EVIDENCE_UNAVAILABLE');process.exitCode=1;});
}
