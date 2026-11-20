// AUTHORED/UNRUN. Synthetic stdlib/process controls, not a Vitest/PG performance result.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Reporter, { parseProcStat,parseMemory,parseDockerMemory,capacity,effectiveConfig,
  newJson,limitedRead,sameInventory,runObservedCommand,signalOwned,taskSnapshot,validateCompleteness } from './vitest-census-pilot.mjs';
const linux=process.platform==='linux';
const source=fileURLToPath(new URL('./vitest-census-pilot.mjs',import.meta.url));
const root=()=>fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'xenios-census-unit-'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const stat=pid=>parseProcStat(fs.readFileSync('/proc/'+pid+'/stat','utf8'));
const config={maxWorkers:2,pool:'forks',isolate:true,fileParallelism:true,allowOnly:false,retry:0,bail:0};

test('proc identity handles spaces/right parentheses and rejects malformed births',()=>{
  const fields=['S','1','10','10',...Array(15).fill('0'),'12345'];
  assert.deepEqual(parseProcStat('10 (a ) process) '+fields.join(' ')),{pid:10,state:'S',ppid:1,pgid:10,sid:10,birth:'12345'});
  assert.throws(()=>parseProcStat('10 (p) S 1 1 1'),/proc_stat/);
});
test('VM memory is MemTotal-MemAvailable, not free-memory or child-RSS sum',()=>{
  assert.deepEqual(parseMemory('MemTotal: 8192 kB\nMemFree: 1 kB\nMemAvailable: 2048 kB\n'),
    {totalBytes:8388608,availableBytes:2097152,usedEstimateBytes:6291456});
  for(const t of ['MemTotal: 2 kB\n','MemTotal: 1 kB\nMemAvailable: 2 kB\n'])assert.throws(()=>parseMemory(t),/memory_protocol/);
});
test('Docker units preserve binary/decimal scale and unknown text is unavailable',()=>{
  assert.deepEqual(parseDockerMemory('1.5MiB / 7GiB'),{usedBytes:1572864,limitBytes:7516192768});
  assert.deepEqual(parseDockerMemory('2MB / 7GB'),{usedBytes:2000000,limitBytes:7000000000});
  assert.throws(()=>parseDockerMemory('unknown'),/docker_memory_protocol/);
});
test('capacity prerequisites refuse small hosts and label larger-host downside',()=>{
  const m={totalBytes:7*1024**3,availableBytes:3*1024**3,usedEstimateBytes:4*1024**3};
  assert.equal(capacity(m,2).defaultWorkersFromPinnedSource,1);
  assert.equal(capacity(m,4).largerHostMaySlow,true);
  assert.throws(()=>capacity(m,1),/capacity_prerequisite/);
  assert.throws(()=>capacity({...m,availableBytes:1024},2),/capacity_prerequisite/);
});
test('effective runtime overrides and weakened isolation/negative controls are refused',()=>{
  assert.deepEqual(effectiveConfig(config),config);
  for(const change of [{maxWorkers:3},{pool:'threads'},{isolate:false},{fileParallelism:false},{allowOnly:true},{retry:1},{bail:1}])
    assert.throws(()=>effectiveConfig({...config,...change}),/effective_config/);
});
test('inventory is set-order invariant but a residual or missing baseline is not conservation',()=>{
  assert.equal(sameInventory(['a','b'],['b','a']),true);
  assert.equal(sameInventory([],['new']),false);assert.equal(sameInventory(['old'],[]),false);
});
test('new evidence never overwrites and refuses symlink reads/directories',{skip:!linux},()=>{
  const r=root();newJson(r,'one.json',{a:1});
  assert.throws(()=>newJson(r,'one.json',{a:2}),e=>e.code==='EEXIST');
  const link=r+'-link';fs.symlinkSync(r,link);assert.throws(()=>newJson(link,'two.json',{}),/directory_alias/);
  fs.symlinkSync(path.join(r,'one.json'),path.join(r,'redirect.json'));
  assert.throws(()=>limitedRead(path.join(r,'redirect.json')),e=>e.code==='ELOOP');
});
test('reporter binds actual resolved configuration and real event ordering, not requested stamp',{skip:!linux},()=>{
  const r=root(),nonce='synthetic-only',prior=[process.env.XENIOS_CI_CENSUS_ROOT,process.env.XENIOS_CI_CENSUS_NONCE];
  newJson(r,'owner.json',{kind:'private-census-pilot-v1',nonce});
  process.env.XENIOS_CI_CENSUS_ROOT=r;process.env.XENIOS_CI_CENSUS_NONCE=nonce;
  try{
    const p=new Reporter();p.onInit({config});
    const project={config};p.onTestRunStart([{project,moduleId:'/owned/a.test.ts'},{project,moduleId:'/owned/b.test.ts'}]);
    p.onTestModuleStart({moduleId:'/owned/a.test.ts'});p.onTestModuleStart({moduleId:'/owned/b.test.ts'});
    p.onTestModuleEnd({moduleId:'/owned/a.test.ts'});p.onTestModuleEnd({moduleId:'/owned/b.test.ts'});
    p.onTestRunEnd([moduleFor('/owned/a.test.ts'),moduleFor('/owned/b.test.ts')],[],'passed');
    assert.equal(JSON.parse(fs.readFileSync(path.join(r,'effective-config.json'))).config.maxWorkers,2);
    const end=JSON.parse(fs.readFileSync(path.join(r,'reporter-end.json')));
    assert.equal(end.observedPeakActiveModuleIntervals,2);assert.equal(end.activeAtEnd,0);
    assert.throws(()=>p.onTestModuleEnd({moduleId:'/not-started'}),/module_end_identity/);
  }finally{for(const [i,k] of ['XENIOS_CI_CENSUS_ROOT','XENIOS_CI_CENSUS_NONCE'].entries()){
    if(prior[i]===undefined)delete process.env[k];else process.env[k]=prior[i];}}
});
test('real subprocess preserves both complete output streams and exit zero',{skip:!linux,timeout:10000},async()=>{
  const r=root(),v=await runObservedCommand({command:process.execPath,args:['-e',"process.stdout.write('alpha');process.stderr.write('beta')"],
    cwd:r,env:process.env,root:r,sample:false,echo:false});
  assert.equal(v.testExitCode,0);assert.equal(v.outputComplete,true);assert.equal(v.childClosed,true);
  assert.equal(fs.readFileSync(path.join(r,'census.stdout.log'),'utf8'),'alpha');
  assert.equal(fs.readFileSync(path.join(r,'census.stderr.log'),'utf8'),'beta');
});
test('real nonzero assertion-like exit is retained, never rewritten into measurement success',{skip:!linux,timeout:10000},async()=>{
  const r=root(),v=await runObservedCommand({command:process.execPath,args:['-e',"console.error('intentional-control');process.exit(23)"],
    cwd:r,env:process.env,root:r,sample:false,echo:false});
  assert.equal(v.testExitCode,23);assert.equal(v.testSignal,null);
});
test('owned output cap produces explicit incomplete output and stops the actual child',{skip:!linux,timeout:10000},async()=>{
  const r=root(),v=await runObservedCommand({command:process.execPath,
    args:['-e',"process.stdout.write(Buffer.alloc(4096,120));setInterval(()=>{},1000)"],cwd:r,env:process.env,root:r,
    sample:false,echo:false,outputLimitBytes:1024});
  assert.equal(v.outputComplete,false);assert.equal(v.stopReason,'output_limit');assert.equal(v.childClosed,true);
});
test('monotonic outer deadline stops a genuine hung child and keeps timeout separate from test failure',{skip:!linux,timeout:10000},async()=>{
  const r=root(),v=await runObservedCommand({command:process.execPath,args:['-e','setInterval(()=>{},1000)'],
    cwd:r,env:process.env,root:r,sample:false,echo:false,runTimeoutMs:200});
  assert.equal(v.stopReason,'pilot_outer_deadline');assert.equal(v.testSignal,'SIGTERM');assert.equal(v.childClosed,true);
});
test('wrong birth cannot signal a live owned test process',{skip:!linux,timeout:10000},async()=>{
  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
  const done=new Promise(resolve=>child.once('close',resolve));const identity=stat(child.pid);
  try{assert.equal(signalOwned(child,{...identity,birth:String(BigInt(identity.birth)+1n)},new Map(),'SIGTERM'),false);
    assert.equal(stat(child.pid).birth,identity.birth);
  }finally{signalOwned(child,identity,new Map(),'SIGTERM');await done;}
});
test('real external SIGTERM is forwarded; synthetic wrapper records it and exits with the signal',{skip:!linux,timeout:15000},async()=>{
  const r=root(),script=path.join(r,'signal-wrapper.mjs'),target=path.join(r,'result.json');
  fs.writeFileSync(script,"import fs from 'node:fs';import {runObservedCommand} from "+JSON.stringify(new URL('./vitest-census-pilot.mjs',import.meta.url).href)+";"+
    "const r=await runObservedCommand({command:process.execPath,args:['-e',\"console.log('READY');setInterval(()=>{},1000)\"],cwd:"+JSON.stringify(r)+",env:process.env,root:"+JSON.stringify(r)+",sample:false,echo:false});"+
    "fs.writeFileSync("+JSON.stringify(target)+",JSON.stringify(r));if(r.receivedSignal)process.kill(process.pid,r.receivedSignal);");
  const child=spawn(process.execPath,[script],{stdio:'ignore'}),done=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
  const until=Date.now()+5000;while(Date.now()<until){
    if(fs.existsSync(path.join(r,'census.stdout.log'))&&fs.readFileSync(path.join(r,'census.stdout.log'),'utf8').includes('READY'))break;
    await sleep(20);
  }
  try{assert.match(fs.readFileSync(path.join(r,'census.stdout.log'),'utf8'),/READY/);child.kill('SIGTERM');
    const end=await done;assert.equal(end.signal,'SIGTERM');
    const value=JSON.parse(fs.readFileSync(target));assert.equal(value.receivedSignal,'SIGTERM');
    assert.equal(value.testSignal,'SIGTERM');assert.equal(value.knownObservedProcessesExited,true);
  }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
});


function moduleFor(id,cases=[{name:'case',mode:'run',state:'pass'}]){
  return {moduleId:id,task:{id:'file:'+id,type:'suite',name:path.basename(id),filepath:id,mode:'run',result:{state:'pass'},
    tasks:cases.map((t,i)=>({id:id+':'+i,type:'test',name:t.name,mode:t.mode,
      ...(t.state===undefined?{}:{result:{state:t.state}})}))}};
}
async function readyFile(r){
  const until=Date.now()+5000,file=path.join(r,'census.stdout.log');
  while(Date.now()<until){if(fs.existsSync(file)&&fs.readFileSync(file,'utf8').includes('READY'))return;await sleep(20);}
  throw Object.assign(new Error('synthetic_ready_timeout'),{code:'synthetic_ready_timeout'});
}
const ignoreTerm="process.on('SIGTERM',()=>{});console.log('READY');setInterval(()=>{},1000)";
test('R2 missing birth enters bounded retained-child escalation even when TERM is ignored',{skip:!linux,timeout:18000},async()=>{
  const r=root(),started=Date.now();
  const value=await runObservedCommand({command:process.execPath,args:['-e',ignoreTerm],cwd:r,env:process.env,root:r,
    sample:false,echo:false,rootIdentityReader:async()=>{await readyFile(r);return null;}});
  assert.equal(value.stopReason,'root_birth_unavailable');assert.equal(value.testSignal,'SIGKILL');
  assert.equal(value.capturedChildVerifiedClosed,true);assert.equal(value.childClosed,true);
  assert.equal(value.rootBirthKnown,false);assert.equal(value.knownObservedProcessesExited,false);
  assert.equal(value.remainingObserved,null);assert(value.signals.some(s=>s.signal==='SIGKILL'&&s.retainedChild));
  assert(value.errors.includes('tree_birth_scope_unknown'));assert(Date.now()-started<14000);
});
test('R2 observer exception shares verified-close escalation for a retained TERM-ignoring child',{skip:!linux,timeout:18000},async()=>{
  const r=root();
  const value=await runObservedCommand({command:process.execPath,args:['-e',ignoreTerm],cwd:r,env:process.env,root:r,
    sample:false,echo:false,observerHook:async()=>{await readyFile(r);throw Object.assign(new Error('synthetic_fault'),{code:'synthetic_fault'});}});
  assert.equal(value.stopReason,'observer_exception');assert.equal(value.testSignal,'SIGKILL');
  assert.equal(value.capturedChildVerifiedClosed,true);assert.equal(value.childClosed,true);
  assert(value.errors.includes('synthetic_fault'));assert(value.signals.some(s=>s.signal==='SIGKILL'&&(s.group||s.retainedChild)));
});
function completeFixture(){
  const ids=['/owned/a.test.ts','/owned/b.test.ts','/owned/c.test.ts'];
  const modules=[moduleFor(ids[0],[{name:'pass',mode:'run',state:'pass'},{name:'skip',mode:'skip'},
    {name:'todo-skip',mode:'todo',state:'skip'}]),moduleFor(ids[1]),moduleFor(ids[2])];
  const snapshot=taskSnapshot(modules);
  const totals={numTotalTests:5,numPassedTests:3,numFailedTests:0,numPendingTests:2,numTodoTests:1,
    numTotalTestSuites:3,numPassedTestSuites:3,numFailedTestSuites:0,numPendingTestSuites:0};
  const a=(title,status)=>({ancestorTitles:[],fullName:title,title,status});
  const report={...totals,success:true,testResults:[
    {name:ids[0],status:'passed',assertionResults:[a('pass','passed'),a('skip','skipped'),a('todo-skip','skipped')]},
    {name:ids[1],status:'passed',assertionResults:[a('case','passed')]},
    {name:ids[2],status:'passed',assertionResults:[a('case','passed')]}]};
  const end={...snapshot,reason:'passed',unhandledErrors:0,moduleCount:3,started:3,ended:3,activeAtEnd:0,
    startedIds:[...ids],endedIds:[...ids],observedPeakActiveModuleIntervals:2};
  return {collection:{files:ids},end,report,modules,expectedTotals:totals};
}
test('R2 complete pinned JSON accepts genuine skip/todo overlap without partitioning the counters',()=>{
  const f=completeFixture();assert.deepEqual(f.end.totals,f.expectedTotals);
  assert.equal(f.report.numPassedTests+f.report.numPendingTests+f.report.numTodoTests,6);
  assert.equal(f.report.numTotalTests,5);assert.equal(validateCompleteness(f.collection,f.end,f.report).complete,true);
});
test('R2 balanced missing callback pair and replaced module identities cannot qualify',()=>{
  for(const mutate of [
    f=>{f.end.startedIds.pop();f.end.endedIds.pop();f.end.started=2;f.end.ended=2;},
    f=>{f.end.runEndIds.pop();f.end.moduleCount=2;},
    f=>{f.end.modules.pop();},
    f=>{f.end.endedIds[2]=f.end.endedIds[0];},
    f=>{f.end.startedIds[2]='/owned/replaced.test.ts';}
  ]){const f=completeFixture();mutate(f);assert.throws(()=>validateCompleteness(f.collection,f.end,f.report));}
});
test('R2 duplicate, missing and same-length replaced JSON modules are rejected',()=>{
  for(const mutate of [
    f=>{f.report.testResults[2].name=f.report.testResults[0].name;},
    f=>{f.report.testResults[2].name='/owned/replaced.test.ts';},
    f=>{f.report.testResults.pop();}
  ]){const f=completeFixture();mutate(f);assert.throws(()=>validateCompleteness(f.collection,f.end,f.report));}
});
test('R2 impossible totals, changed assertion status and unhandled/incomplete/empty runs fail',()=>{
  for(const mutate of [
    f=>{f.report.numTotalTests=99;},
    f=>{f.report.numTotalTests=99;f.end.totals.numTotalTests=99;},
    f=>{f.report.numTodoTests=0;},
    f=>{f.report.testResults[0].assertionResults[1].status='pending';},
    f=>{f.report.testResults[0].assertionResults[0].status='failed';f.end.modules[0].assertions[0].status='failed';},
    f=>{f.report.testResults[0].assertionResults.pop();},
    f=>{f.end.unhandledErrors=1;},
    f=>{f.end.reason='interrupted';},
    f=>{f.end.unsettledTasks=1;},
    f=>{f.collection.files=[];f.end.startedIds=[];f.end.endedIds=[];f.end.runEndIds=[];f.end.modules=[];}
  ]){const f=completeFixture();mutate(f);assert.throws(()=>validateCompleteness(f.collection,f.end,f.report));}
});
test('R2 actual reporter callback omission writes diagnostic sets then refuses balanced A/B of A/B/C',{skip:!linux},()=>{
  const f=completeFixture(),r=root(),nonce='synthetic-r2',prior=[process.env.XENIOS_CI_CENSUS_ROOT,process.env.XENIOS_CI_CENSUS_NONCE];
  newJson(r,'owner.json',{kind:'private-census-pilot-v1',nonce});
  process.env.XENIOS_CI_CENSUS_ROOT=r;process.env.XENIOS_CI_CENSUS_NONCE=nonce;
  try{
    const p=new Reporter();p.onInit({config});const project={config};
    p.onTestRunStart(f.collection.files.map(moduleId=>({project,moduleId})));
    for(const module of f.modules.slice(0,2))p.onTestModuleStart(module);
    for(const module of f.modules.slice(0,2))p.onTestModuleEnd(module);
    assert.throws(()=>p.onTestRunEnd(f.modules,[],'passed'),/module_set_mismatch/);
    const end=JSON.parse(fs.readFileSync(path.join(r,'reporter-end.json'),'utf8'));
    assert.equal(end.started,end.ended);assert.equal(end.moduleCount,3);assert.equal(end.startedIds.length,2);
    assert.throws(()=>p.onTestModuleStart(f.modules[0]),/module_start_identity/);
  }finally{for(const [i,k]of['XENIOS_CI_CENSUS_ROOT','XENIOS_CI_CENSUS_NONCE'].entries()){
    if(prior[i]===undefined)delete process.env[k];else process.env[k]=prior[i];}}
});

// R3 primary-shaped task ancestry: the file is counted, but is not test.suite.
function primaryNameProjection(task){
  const ancestors=[];let parent=task.suite;
  while(parent){ancestors.push(parent.name);parent=parent.suite;}
  ancestors.reverse();
  return {ancestorTitles:ancestors,fullName:task.name?[...ancestors,task.name].join(' '):ancestors.join(' '),
    title:task.name,status:'passed'};
}
function primaryAncestryFixture(){
  const id='/owned/never-an-ancestor.test.ts';
  const leaf=(taskId,name,suite)=>({id:taskId,type:'test',name,mode:'run',result:{state:'pass'},...(suite?{suite}:{})});
  const outer={id:'r3-outer',type:'suite',name:'outer',mode:'run',result:{state:'pass'},tasks:[]};
  const empty={id:'r3-empty',type:'suite',name:'',mode:'run',result:{state:'pass'},tasks:[],suite:outer};
  const top=leaf('r3-top','case'),nested=leaf('r3-nested','nested',empty),blank=leaf('r3-blank','',outer);
  empty.tasks=[nested];outer.tasks=[empty,blank];
  const file={id:'r3-file',type:'suite',name:'never-an-ancestor.test.ts',filepath:id,mode:'run',result:{state:'pass'},tasks:[top,outer]};
  const module={moduleId:id,task:file},snapshot=taskSnapshot([module]);
  const expected=[
    {ancestorTitles:[],fullName:'case',title:'case',status:'passed'},
    {ancestorTitles:['outer',''],fullName:'outer  nested',title:'nested',status:'passed'},
    {ancestorTitles:['outer'],fullName:'outer',title:'',status:'passed'}
  ];
  const totals={numTotalTests:3,numPassedTests:3,numFailedTests:0,numPendingTests:0,numTodoTests:0,
    numTotalTestSuites:3,numPassedTestSuites:3,numFailedTestSuites:0,numPendingTestSuites:0};
  return {top,outer,leaves:[top,nested,blank],expected,snapshot,
    collection:{files:[id]},end:{...snapshot,reason:'passed',unhandledErrors:0,moduleCount:1,
      started:1,ended:1,activeAtEnd:0,startedIds:[id],endedIds:[id]},
    report:{...totals,success:true,testResults:[{name:id,status:'passed',assertionResults:expected.map(a=>({...a,ancestorTitles:[...a.ancestorTitles]}))}]},
    totals};
}
test('R3 pinned top-level, nested and empty-named describes retain primary JSON names and root numeric suite count',()=>{
  const f=primaryAncestryFixture();
  assert.equal(Object.hasOwn(f.top,'suite'),false);assert.equal(Object.hasOwn(f.outer,'suite'),false);
  assert.deepEqual(f.leaves.map(primaryNameProjection),f.expected);
  assert.deepEqual(f.snapshot.modules[0].assertions,f.expected);
  assert.deepEqual(f.snapshot.totals,f.totals);assert.equal(f.snapshot.totals.numTotalTestSuites,3);
  assert.equal(validateCompleteness(f.collection,f.end,f.report).complete,true);
});
test('R3 file prefixes, wrong nested names, lost empty describes and missing assertions remain rejected',()=>{
  for(const mutate of [
    f=>{const a=f.report.testResults[0].assertionResults[0];a.ancestorTitles=['never-an-ancestor.test.ts'];a.fullName='never-an-ancestor.test.ts case';},
    f=>{const a=f.report.testResults[0].assertionResults[1];a.ancestorTitles=['wrong',''];a.fullName='wrong  nested';},
    f=>{const a=f.report.testResults[0].assertionResults[1];a.ancestorTitles=['outer'];a.fullName='outer nested';},
    f=>{const a=f.report.testResults[0].assertionResults[2];a.title='changed';a.fullName='outer changed';},
    f=>{f.report.testResults[0].assertionResults.pop();}
  ]){const f=primaryAncestryFixture();mutate(f);assert.throws(()=>validateCompleteness(f.collection,f.end,f.report),/json_assertion_mismatch/);}
});
