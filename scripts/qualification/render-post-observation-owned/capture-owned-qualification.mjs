// Private unbound hosted qualifier only. No real provider/action module is imported.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
const BASE='3be474533f313a6fa3f5dad09ccbe86d3eda5d3d',BASE_TREE='7483e088c24606e344f036131ae6177b447b16ab';
const REF='refs/heads/codex/ea-post-observation-owned-20261120',PREFIX='scripts/qualification/render-post-observation-owned/';
const WORKFLOW='.github/workflows/release-post-observation-owned.yml',HASH=/^[a-f0-9]{64}$/,OID=/^[a-f0-9]{40}$/;
const INPUTS=[
 ['R2/deploy-post-observability-proposal.mjs','3c755df4e7501894d13aab88d3be1ea2f947173b9c7ee0ab145616d6443487a6'],
 ['R2/accepted-deploy-d1a3-original.mjs','d1a3c8ddf1d088422b315ac32eed8fe8b8e990363ff836b82ae93796256b5ef2'],
 ['R2/POST-OBSERVABILITY-FRAGMENT.mjs.txt','033b4c4fc82223c8e0bc7a7032c85da2692f5cd72f6e222186e481db3ef90164'],
 ['R2/POST-OBSERVABILITY-INVERSE.patch','bfb8703413f8fc74d3366bbdf527fddb1ae6f05945fec8a55c9df763fdf1ca70'],
 ['R2/qualification-source-v1/render-post-observability.owned.test.mjs','8cc9aa3de2a04a24c39de7c1a592939a88ed416706a40cab1c64383c20a01934'],
 ['R2/qualification-source-v1/HARNESS-SPEC.json','20c794b6839f6075ca65e11d0887e107238ba836a21cd274cc4813b078a72fbd'],
 ['R2/qualification-source-v1/EXTRACTION-CONTRACT.json','238aff3aa8b5c2aad40fae9f66cdced4c1c0121fca2fee65b0a675d003734c9c'],
 ['capture-owned-qualification.mjs',process.env.XR_OBS_CONTROLLER_SHA256],
];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const started=performance.now();let phase='context',outputDir,outputOwned=null,sourceProof=null,child=null,observed=null,sourceWritten=false;
function remaining(){return 270000-(performance.now()-started);}
function env(name,max=256){const v=process.env[name];assert(typeof v==='string'&&v.length>0&&v.length<=max&&!/[\x00-\x1f]/.test(v));return v;}
function write(name,value){assert(outputOwned&&verifyOwnedReportDirectory(outputOwned)===outputDir);const b=Buffer.from(JSON.stringify(value,null,2)+'\n');assert(b.length<=100000);const fd=fs.openSync(path.join(outputDir,name),'wx',0o600);try{fs.writeFileSync(fd,b);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function effects(){return {realProviderRequests:0,operatorActionImports:0,operationalToolOrSpentIntentInputs:0,inertReviewedSourceFixtures:4,credentialInputs:0,gitMutations:0,publication:0};}
function safeImage(key){const v=process.env[key];if(v===undefined)return null;assert(/^[A-Za-z0-9._-]{1,128}$/.test(v));return v;}
// An existing directory/link is never adopted; state is returned only after creation and verification.
function createOwnedReportDirectory(temp){
 const root=fs.realpathSync(temp),candidate=path.join(root,'render-post-observation-owned-report');
 assert(fs.lstatSync(root).isDirectory());
 fs.mkdirSync(candidate,{mode:0o700});
 const stat=fs.lstatSync(candidate),real=fs.realpathSync(candidate);
 assert(stat.isDirectory()&&!stat.isSymbolicLink()&&real===candidate&&path.dirname(real)===root);
 return Object.freeze({root,path:real,dev:stat.dev,ino:stat.ino});
}
function verifyOwnedReportDirectory(owned){
 assert(owned&&owned.path===path.join(owned.root,'render-post-observation-owned-report'));
 const stat=fs.lstatSync(owned.path),real=fs.realpathSync(owned.path);
 assert(stat.isDirectory()&&!stat.isSymbolicLink()&&real===owned.path&&path.dirname(real)===owned.root&&stat.dev===owned.dev&&stat.ino===owned.ino);
 return real;
}
function publishOwnedReportDirectory(owned,outputFile){
 const dir=verifyOwnedReportDirectory(owned);assert(!/[\r\n]/.test(dir)&&dir.length<=2300);
 const absolute=path.resolve(outputFile),stat=fs.lstatSync(absolute);
 assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size===0&&fs.realpathSync(absolute)===absolute&&absolute.startsWith(owned.root+path.sep));
 const fd=fs.openSync(absolute,'a');
 try{const opened=fs.fstatSync(fd);assert(opened.dev===stat.dev&&opened.ino===stat.ino);fs.writeSync(fd,'artifact_dir='+dir+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function parseNativeTap(bytes,spec){
 assert(Buffer.isBuffer(bytes)&&bytes.length<=256000);
 const raw=bytes.toString('utf8');assert(Buffer.from(raw).equals(bytes));
 const parent=spec.parentTitle,ids=spec.groups.map(x=>x.id),expected=new Map([[parent,{indent:0,number:1}],...ids.map((x,i)=>[x,{indent:4,number:i+1}])]);
 assert.equal(expected.size,17);assert.equal(ids.length,16);
 const terminals=new Map(),counts=new Map(),problems=new Set(),rootPlans=[],childPlans=[];
 let unknown=0,versions=0,currentTerminal=null;const failureTypes=new Set(),cancelled=new Set(['cancelledByParent','testAborted','testTimeoutFailure']);
 for(const line of raw.split(/\r?\n/)){
  if(line==='TAP version 13'){versions++;continue;}
  const summary=/^# (tests|suites|pass|fail|cancelled|skipped|todo) ([0-9]+)$/.exec(line);
  if(summary){if(counts.has(summary[1]))problems.add('DUPLICATE_NATIVE_SUMMARY');const n=Number(summary[2]);assert(Number.isSafeInteger(n)&&n<=1000);counts.set(summary[1],n);continue;}
  const plan=/^( *)([0-9]+)\.\.([0-9]+)(?:\s+#.*)?$/.exec(line);
  if(plan){const value=[Number(plan[2]),Number(plan[3])];if(plan[1].length===0)rootPlans.push(value);else if(plan[1].length===4)childPlans.push(value);else problems.add('UNEXPECTED_PLAN_NESTING');continue;}
  const terminal=/^( *)(not ok|ok) ([1-9][0-9]*) - (.*)$/.exec(line);
  if(terminal){
   const directive=/\s+# (SKIP|TODO)(?:\s|$)/i.exec(terminal[4]);const name=directive?terminal[4].slice(0,directive.index):terminal[4];
   if(!expected.has(name)){unknown++;problems.add('UNEXPECTED_NATIVE_TEST');continue;}
   if(terminals.has(name)){problems.add('DUPLICATE_NATIVE_TEST');continue;}
   const want=expected.get(name);if(terminal[1].length!==want.indent||Number(terminal[3])!==want.number)problems.add('NATIVE_ORDER_OR_NESTING_MISMATCH');
   const outcome=directive?directive[1].toUpperCase()==='SKIP'?'skipped':'todo':terminal[2]==='ok'?'passed':'failed';
   currentTerminal=name;terminals.set(name,{name,number:Number(terminal[3]),nesting:terminal[1].length/4,nativeStatus:terminal[2],outcome,failureType:null});continue;
  }
  const failure=/^\s+failureType: ['"]?(testCodeFailure|subtestsFailed|testTimeoutFailure|testAborted|cancelledByParent|uncaughtException|unhandledRejection|hookFailed)['"]?\s*$/.exec(line);
  if(failure){failureTypes.add(failure[1]);const row=terminals.get(currentTerminal);if(row&&row.nativeStatus==='not ok'){row.failureType=failure[1];if(cancelled.has(failure[1]))row.outcome='cancelled';}}
 }
 if(versions!==1)problems.add('MISSING_OR_DUPLICATE_TAP_VERSION');
 if(JSON.stringify(rootPlans)!==JSON.stringify([[1,1]])||JSON.stringify(childPlans)!==JSON.stringify([[1,16]]))problems.add('NATIVE_PLAN_MISMATCH');
 const nativeCounts={};for(const key of ['tests','suites','pass','fail','cancelled','skipped','todo']){nativeCounts[key]=counts.has(key)?counts.get(key):null;if(nativeCounts[key]===null)problems.add('MISSING_NATIVE_SUMMARY');}
 const rows=[...expected].map(([name,want])=>terminals.get(name)??{name,number:want.number,nesting:want.indent/4,outcome:'NOT_OBSERVED'});
 if(rows.some(x=>x.outcome==='NOT_OBSERVED'))problems.add('MISSING_NATIVE_TEST');
 const actual={passed:0,failed:0,cancelled:0,skipped:0,todo:0};for(const row of terminals.values())actual[row.outcome]++;
 if(nativeCounts.tests!==17||nativeCounts.tests!==terminals.size+unknown||nativeCounts.suites!==0)problems.add('NATIVE_TOTAL_MISMATCH');
 for(const [key,observed]of Object.entries({pass:actual.passed,fail:actual.failed,cancelled:actual.cancelled,skipped:actual.skipped,todo:actual.todo}))if(nativeCounts[key]!==observed)problems.add('NATIVE_OUTCOME_COUNT_MISMATCH');
 if(nativeCounts.cancelled!==0||rows.some(x=>x.outcome!=='passed'))problems.add('NONPASS_OR_CANCELLED');
 return {kind:'OBSERVED_NATIVE_NODE20_TAP',nativeTapSha256:sha(bytes),nativeTapBytes:bytes.length,versionHeaders:versions,nativeCounts,rows,observedCounts:actual,unknownTests:unknown,closedFailureTypes:[...failureTypes].sort(),problems:[...problems].sort(),inventoryComplete:problems.size===0&&terminals.size===17};
}
try{
 outputOwned=createOwnedReportDirectory(env('RUNNER_TEMP',2048));outputDir=outputOwned.path;
 assert.equal(process.versions.node,'20.19.0');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_EVENT_NAME,'push');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');assert.equal(process.env.GITHUB_REPOSITORY,'teamxenios/xenios-website');assert.equal(process.env.GITHUB_REF,REF);assert.equal(process.env.XR_OBS_RUNNER_ENVIRONMENT,'github-hosted');
 const runnerLabel=env('XR_OBS_RUNNER_LABEL');assert(['windows-2022','ubuntu-24.04'].includes(runnerLabel));assert.equal(process.platform,runnerLabel==='windows-2022'?'win32':'linux');assert.equal(process.arch,'x64');assert.equal(env('RUNNER_OS'),runnerLabel==='windows-2022'?'Windows':'Linux');
 const source=env('XR_OBS_INPUT_SOURCE'),sourceTree=env('XR_OBS_INPUT_TREE'),workflowHead=env('GITHUB_SHA'),run=env('GITHUB_RUN_ID');assert(OID.test(source)&&OID.test(sourceTree)&&OID.test(workflowHead)&&/^[0-9]+$/.test(run));assert(INPUTS.every(([,hash])=>HASH.test(hash)));
 const workspace=fs.realpathSync(env('GITHUB_WORKSPACE',2048));
 const eventPath=env('GITHUB_EVENT_PATH',2048),eventStat=fs.lstatSync(eventPath);assert(eventStat.isFile()&&!eventStat.isSymbolicLink()&&eventStat.size<=1000000);const event=JSON.parse(fs.readFileSync(eventPath));assert.equal(event.created,true);assert.equal(event.forced,false);assert.equal(event.deleted,false);assert.equal(event.before,'0'.repeat(40));assert.equal(event.after,workflowHead);assert.equal(event.ref,REF);assert.equal(event.repository?.full_name,'teamxenios/xenios-website');
 function git(args,maxBuffer=1000000){assert(remaining()>1000);const r=spawnSync('git',['--no-optional-locks','--no-replace-objects','--no-lazy-fetch','-C',workspace,...args],{stdio:['ignore','pipe','pipe'],shell:false,windowsHide:true,timeout:Math.min(10000,Math.floor(remaining())),maxBuffer,env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'}});assert(!r.error&&r.status===0&&r.signal===null&&Buffer.isBuffer(r.stdout)&&Buffer.isBuffer(r.stderr)&&r.stderr.length===0);return r.stdout;}
 const gt=args=>git(args).toString('utf8').trim();phase='exact_input_and_workflow_graph';
 assert.equal(gt(['rev-parse','HEAD']),source);assert.equal(gt(['rev-parse','HEAD^{tree}']),sourceTree);assert.equal(gt(['show','-s','--format=%P',source]),BASE);assert.equal(gt(['rev-parse',BASE+'^{tree}']),BASE_TREE);assert.equal(gt(['show','-s','--format=%P',workflowHead]),source);
 const workflowTree=gt(['rev-parse',workflowHead+'^{tree}']);assert(OID.test(workflowTree));
 function additions(from,to){const raw=git(['diff','--no-renames','--name-status','-z',from,to]);const text=raw.toString('utf8');assert(text.endsWith('\0'));const fields=text.slice(0,-1).split('\0');assert(fields.length%2===0);const paths=[];for(let i=0;i<fields.length;i+=2){assert.equal(fields[i],'A');paths.push(fields[i+1]);}assert.equal(new Set(paths).size,paths.length);return paths.sort();}
 assert.deepEqual(additions(BASE,source),INPUTS.map(([p])=>PREFIX+p).sort());assert.deepEqual(additions(source,workflowHead),[WORKFLOW]);
 const files=[];for(const[relative,expected]of INPUTS){const repoPath=PREFIX+relative,entry=gt(['ls-tree',source,'--',repoPath]),match=/^100644 blob ([a-f0-9]{40})\t(.+)$/.exec(entry);assert(match&&match[2]===repoPath);const raw=git(['cat-file','blob',match[1]]);assert.equal(sha(raw),expected);const physical=path.join(workspace,...repoPath.split('/')),stat=fs.lstatSync(physical);assert(stat.isFile()&&!stat.isSymbolicLink());assert.equal(sha(fs.readFileSync(physical)),expected);files.push({path:repoPath,mode:'100644',blob:match[1],bytes:raw.length,sha256:expected});}
 assert.equal(fs.realpathSync(fileURLToPath(import.meta.url)),fs.realpathSync(path.join(workspace,...(PREFIX+'capture-owned-qualification.mjs').split('/'))));
 const workflowMatch=/^100644 blob ([a-f0-9]{40})\t(.+)$/.exec(gt(['ls-tree',workflowHead,'--',WORKFLOW]));assert(workflowMatch&&workflowMatch[2]===WORKFLOW);const workflowRaw=git(['cat-file','blob',workflowMatch[1]]);
 const spec=JSON.parse(fs.readFileSync(path.join(workspace,...(PREFIX+'R2/qualification-source-v1/HARNESS-SPEC.json').split('/'))));assert.equal(spec.groupCount,16);assert.equal(spec.nodeExpectedTestsIncludingParent,17);assert.equal(spec.groups.length,16);assert.equal(new Set(spec.groups.map(x=>x.id)).size,16);assert(spec.groups.every(x=>/^P(?:0[1-9]|1[0-6])_[A-Z0-9_]+$/.test(x.id)));assert.equal(spec.parentTitle,'owned R2 future POST observability; no action/provider execution');
 const harness=path.join(workspace,...(PREFIX+'R2/qualification-source-v1/render-post-observability.owned.test.mjs').split('/'));
 const version=spawnSync('git',['--version'],{stdio:['ignore','pipe','pipe'],shell:false,windowsHide:true,timeout:10000,maxBuffer:1024});assert(!version.error&&version.status===0&&version.signal===null&&version.stderr.length===0);const gitVersion=version.stdout.toString('utf8').trim();assert(/^git version [A-Za-z0-9.+-]{1,80}$/.test(gitVersion));
 sourceProof={kind:'EXACT_OWNED_POST_OBSERVATION_INPUT_PROVENANCE',source,sourceTree,workflowHead,workflowTree,executedHead:source,executedTree:sourceTree,checkoutKind:'EXACT_INPUT_COMMIT_CHECKOUT',inputParents:[BASE],workflowParents:[source],base:BASE,baseTree:BASE_TREE,workflowFile:{path:WORKFLOW,mode:'100644',blob:workflowMatch[1],bytes:workflowRaw.length,sha256:sha(workflowRaw)},files,run,attempt:1,jobKey:'qualify',numericJobId:null,repository:'teamxenios/xenios-website',ref:REF,runnerLabel,platform:process.platform,arch:process.arch,node:process.versions.node,gitVersion,imageOs:safeImage('ImageOS'),imageVersion:safeImage('ImageVersion'),effects:effects()};
 write('input-provenance.json',sourceProof);sourceWritten=true;
 phase='one_native_tap_child';assert(remaining()>=210000,'insufficient remaining controller budget for original parent/child limits');
 const childEnv={};for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','PATHEXT','ComSpec','TEMP','TMP','TMPDIR','LANG','LC_ALL'])if(process.env[key]!==undefined)childEnv[key]=process.env[key];Object.assign(childEnv,{NODE_OPTIONS:'',NODE_PATH:''});
 child=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-timeout=180000','--test-reporter=tap',harness],{cwd:path.dirname(harness),env:childEnv,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:200000,maxBuffer:256000});
 phase='native_tap_reconciliation';if(Buffer.isBuffer(child.stdout)&&child.stdout.length<=256000)observed=parseNativeTap(child.stdout,spec);
 const processPassed=!child.error&&child.status===0&&child.signal===null&&Buffer.isBuffer(child.stderr)&&child.stderr.length===0;
 const passed=processPassed&&observed?.inventoryComplete===true&&observed.nativeCounts.tests===17&&observed.nativeCounts.pass===17&&['fail','cancelled','skipped','todo'].every(k=>observed.nativeCounts[k]===0)&&remaining()>0;
 write('qualification-report.json',{kind:'OWNED_R2_POST_OBSERVATION_HOSTED_QUALIFICATION',state:passed?'PASS_ISOLATED_DETERMINISTIC_FIXTURE_ONLY':'FAIL_OR_INCOMPLETE',phase,sourceBinding:sourceProof,process:{exitCode:child.status,signal:child.signal??null,errorCode:child.error?.code??null,stdoutBytes:Buffer.isBuffer(child.stdout)?child.stdout.length:null,stdoutSha256:Buffer.isBuffer(child.stdout)?sha(child.stdout):null,stderrBytes:Buffer.isBuffer(child.stderr)?child.stderr.length:null,stderrSha256:Buffer.isBuffer(child.stderr)?sha(child.stderr):null},observed,elapsedMs:Math.round(performance.now()-started),timingLimits:'Injected virtual30s/15s/250ms classification; not real provider/network/kernel cancellation qualification',scope:'Inert R2 source extraction, owned temp filesystem/hardlink and voluntary5s child-stop fixture only; no operator adoption or original UNKNOWN recovery',effects:effects()});
 process.exitCode=passed?0:1;
}catch{
 if(outputOwned){if(!sourceWritten){try{write('input-provenance.json',{kind:'EXACT_OWNED_POST_OBSERVATION_INPUT_PROVENANCE',state:'HOLD_NOT_VERIFIED',phase,sourceBinding:sourceProof,effects:effects()});}catch{}}
 try{write('qualification-report.json',{kind:'OWNED_R2_POST_OBSERVATION_HOSTED_QUALIFICATION',state:'HOLD_BEFORE_OR_DURING_QUALIFICATION',phase,sourceBinding:sourceProof,observed,process:child?{exitCode:child.status,signal:child.signal??null,errorCode:child.error?.code??null,stdoutBytes:Buffer.isBuffer(child.stdout)?child.stdout.length:null,stdoutSha256:Buffer.isBuffer(child.stdout)?sha(child.stdout):null,stderrBytes:Buffer.isBuffer(child.stderr)?child.stderr.length:null}:null,elapsedMs:Math.round(performance.now()-started),effects:effects()});}catch{}}
 process.stderr.write('OWNED_POST_OBSERVATION_QUALIFICATION_HOLD\n');process.exitCode=1;
}finally{
 if(outputOwned){try{publishOwnedReportDirectory(outputOwned,env('GITHUB_OUTPUT',2048));}catch{process.stderr.write('OWNED_POST_OBSERVATION_OUTPUT_PUBLICATION_HOLD\n');process.exitCode=1;}}
}
