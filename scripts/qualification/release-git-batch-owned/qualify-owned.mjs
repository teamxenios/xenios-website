// PRIVATE PROPOSAL ONLY. Binding values must come from the later exact workflow.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const BASE='3be474533f313a6fa3f5dad09ccbe86d3eda5d3d',BASE_TREE='7483e088c24606e344f036131ae6177b447b16ab';
const BRANCH='refs/heads/codex/ea-release-git-batch-owned-20261120';
const PREFIX='scripts/qualification/release-git-batch-owned/';
const WORKFLOW='.github/workflows/release-git-batch-owned.yml';
const OID=/^[a-f0-9]{40}$/,HASH=/^[a-f0-9]{64}$/;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const inputs=[
 ['proposed/git-endpoint-batch.mjs','4cbe3b46d90e358c6addffa376a2afca5f675ec4820f2de2219e4a7d7c703eef'],
 ['qualification-source-v2/git-endpoint-batch.owned.test.mjs','c6ec6909d43cd1f6c2a403681a8ebfcde912c9ec1f2863053ce9114a3de8b220'],
 ['qualification-source-v2/FIXTURE-SPEC-AND-CASE-INVENTORY.json','3222b2817ab6cdf5bf80325bc9a8510345e11d73fe3e6f9445b561a509eb62e6'],
 ['owned-reporter.mjs',process.env.XR_BATCH_REPORTER_SHA256],
 ['qualify-owned.mjs',process.env.XR_BATCH_CONTROLLER_SHA256],
];
let phase='context',outputDir,sourceProof=null,runtimeProof=null,result=null,child=null;
function exactWrite(name,value){const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');assert(bytes.length<=200000);const fd=fs.openSync(path.join(outputDir,name),'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function envText(name,max=128){const v=process.env[name];assert(typeof v==='string'&&v.length>0&&v.length<=max&&!/[\x00-\x1f]/.test(v));return v;}
function optionalImage(name){const value=process.env[name];if(value===undefined)return null;assert(/^[A-Za-z0-9._-]{1,128}$/.test(value));return value;}
function flags(){return {appImports:false,npm:false,api:false,provider:false,deployment:false,managed:false,releaseToolAdoption:false,unknownIntentReplay:false};}
try{
 assert.equal(process.versions.node,'20.19.0');assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(process.env.GITHUB_EVENT_NAME,'push');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');assert.equal(process.env.GITHUB_REPOSITORY,'teamxenios/xenios-website');assert.equal(process.env.GITHUB_REF,BRANCH);
 assert.equal(process.env.XR_RUNNER_ENVIRONMENT,'github-hosted');
 const label=envText('XR_RUNNER_LABEL');assert(['ubuntu-24.04','windows-2022'].includes(label));assert.equal(process.platform,label==='ubuntu-24.04'?'linux':'win32');assert.equal(process.arch,'x64');
 const source=envText('XR_BATCH_INPUT_SOURCE'),sourceTree=envText('XR_BATCH_INPUT_TREE'),head=envText('GITHUB_SHA');assert(OID.test(source)&&OID.test(sourceTree)&&OID.test(head));
 assert(inputs.every(([,hash])=>HASH.test(hash)));
 const workspace=fs.realpathSync(envText('GITHUB_WORKSPACE',1024)),temp=fs.realpathSync(envText('RUNNER_TEMP',1024));
 outputDir=path.join(temp,'release-git-batch-owned-report');fs.mkdirSync(outputDir);assert(!fs.lstatSync(outputDir).isSymbolicLink());
 const eventPath=envText('GITHUB_EVENT_PATH',1024),eventStat=fs.lstatSync(eventPath);assert(eventStat.isFile()&&!eventStat.isSymbolicLink()&&eventStat.size<=1000000);
 const event=JSON.parse(fs.readFileSync(eventPath));assert.equal(event.created,true);assert.equal(event.forced,false);assert.equal(event.before,'0'.repeat(40));assert.equal(event.after,head);assert.equal(event.ref,BRANCH);assert.equal(event.deleted,false);assert.equal(event.repository?.full_name,'teamxenios/xenios-website');
 const versionResult=spawnSync('git',['--version'],{cwd:workspace,env:{...process.env},shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:10000,maxBuffer:1024});
 assert(!versionResult.error&&versionResult.status===0&&versionResult.signal===null&&versionResult.stderr.length===0);
 const observedGitVersion=versionResult.stdout.toString('utf8').trim();assert(/^git version [A-Za-z0-9.+-]{1,80}$/.test(observedGitVersion));
 runtimeProof={node:process.versions.node,gitVersion:observedGitVersion,platform:process.platform,arch:process.arch,runnerLabel:label,runnerOs:envText('RUNNER_OS'),imageOs:optionalImage('ImageOS'),imageVersion:optionalImage('ImageVersion')};
 function git(args,maxBuffer=2000000){const r=spawnSync('git',['--no-optional-locks','--no-replace-objects','--no-lazy-fetch','-C',workspace,...args],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_OPTIONAL_LOCKS:'0'},timeout:10000,maxBuffer});assert(!r.error&&r.status===0&&r.signal===null&&Buffer.isBuffer(r.stdout)&&Buffer.isBuffer(r.stderr)&&r.stderr.length===0);return r.stdout;}
 const gitText=args=>git(args).toString('utf8').trim();
 phase='exact_source';assert.equal(gitText(['rev-parse','HEAD']),head);assert.equal(gitText(['show','-s','--format=%P',head]),source);assert.equal(gitText(['rev-parse',source+'^{tree}']),sourceTree);assert.equal(gitText(['show','-s','--format=%P',source]),BASE);assert.equal(gitText(['rev-parse',BASE+'^{tree}']),BASE_TREE);
 function additions(from,to){const raw=git(['diff','--no-renames','--name-status','-z',from,to]);const text=raw.toString('utf8');assert(text.endsWith('\0'));const fields=text.slice(0,-1).split('\0');assert(fields.length%2===0);const pairs=[];for(let i=0;i<fields.length;i+=2){assert.equal(fields[i],'A');pairs.push(fields[i+1]);}assert.equal(new Set(pairs).size,pairs.length);return pairs.sort();}
 assert.deepEqual(additions(BASE,source),inputs.map(([p])=>PREFIX+p).sort());assert.deepEqual(additions(source,head),[WORKFLOW]);
 const workflowMatch=/^100644 blob ([a-f0-9]{40})\t(.+)$/.exec(gitText(['ls-tree',head,'--',WORKFLOW]));assert(workflowMatch&&workflowMatch[2]===WORKFLOW);
 const workflowRaw=git(['cat-file','blob',workflowMatch[1]]),workflowFile={path:WORKFLOW,mode:'100644',blob:workflowMatch[1],bytes:workflowRaw.length,sha256:sha(workflowRaw)};
 const pins=[];for(const [relative,expected]of inputs){const repoPath=PREFIX+relative,entry=gitText(['ls-tree',source,'--',repoPath]);const match=/^100644 blob ([a-f0-9]{40})\t(.+)$/.exec(entry);assert(match&&match[2]===repoPath);const raw=git(['cat-file','blob',match[1]]);assert.equal(sha(raw),expected);const physical=path.join(workspace,...repoPath.split('/'));assert(fs.lstatSync(physical).isFile()&&!fs.lstatSync(physical).isSymbolicLink());assert.equal(sha(fs.readFileSync(physical)),expected);pins.push({path:repoPath,mode:'100644',blob:match[1],bytes:raw.length,sha256:expected});}
 const ownPath=fs.realpathSync(fileURLToPath(import.meta.url));assert.equal(ownPath,fs.realpathSync(path.join(workspace,...(PREFIX+'qualify-owned.mjs').split('/'))));
 const gitVersion=observedGitVersion;
 const spec=JSON.parse(fs.readFileSync(path.join(workspace,...(PREFIX+'qualification-source-v2/FIXTURE-SPEC-AND-CASE-INVENTORY.json').split('/'))));assert.equal(spec.cases.length,41);assert.equal(spec.unimplemented.length,6);
 const run=envText('GITHUB_RUN_ID');assert(/^[0-9]+$/.test(run));const runnerOs=envText('RUNNER_OS');assert.equal(runnerOs,label==='ubuntu-24.04'?'Linux':'Windows');
 sourceProof={kind:'OWNED_GIT_BATCH_EXACT_INPUT_PROVENANCE',source,sourceTree,workflowHead:head,workflowTree:gitText(['rev-parse',head+'^{tree}']),workflowFile,orderedInputParents:[BASE],orderedWorkflowParents:[source],base:BASE,baseTree:BASE_TREE,branch:BRANCH,run,attempt:1,node:process.versions.node,gitVersion,platform:process.platform,arch:process.arch,runnerLabel:label,runnerOs,imageOs:optionalImage('ImageOS'),imageVersion:optionalImage('ImageVersion'),files:pins,effects:flags()};
 exactWrite('input-provenance.json',sourceProof);
 phase='one_owned_node_run';
 const reporter=path.join(workspace,...(PREFIX+'owned-reporter.mjs').split('/')),harness=path.join(workspace,...(PREFIX+'qualification-source-v2/git-endpoint-batch.owned.test.mjs').split('/'));
 const testEnv={};for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','PATHEXT','ComSpec','TEMP','TMP','TMPDIR','LANG','LC_ALL'])if(process.env[key]!==undefined)testEnv[key]=process.env[key];
 Object.assign(testEnv,{NODE_OPTIONS:'',NODE_PATH:'',GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0',GIT_ALLOW_PROTOCOL:'file'});
 // One child invocation only; no automatic retry or test-force-exit.
 child=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-timeout=240000','--test-reporter',pathToFileURL(reporter).href,harness],{cwd:path.dirname(harness),env:testEnv,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:300000,maxBuffer:256000});
 if(Buffer.isBuffer(child.stdout)&&child.stdout.length<=200000){try{result=JSON.parse(child.stdout.toString('utf8'));}catch{result=null;}}
 const goodProcess=!child.error&&child.status===0&&child.signal===null&&Buffer.isBuffer(child.stderr)&&child.stderr.length===0;
 const goodEvents=result?.kind==='OWNED_GIT_BATCH_NODE20_OBSERVED_EVENTS'&&result.node==='20.19.0'&&result.inventoryComplete===true&&result.problems.length===0&&result.rows.length===42&&result.rows.every(x=>x.outcome==='passed')&&result.nodeReportedCounts.tests===42&&result.nodeReportedCounts.pass===42&&['fail','cancelled','skipped','todo'].every(k=>result.nodeReportedCounts[k]===0);
 const expectedNames=[spec.parentTestTitle,...spec.cases.map(x=>x.fullName)].sort();if(result?.rows)assert.deepEqual(result.rows.map(x=>x.name).sort(),expectedNames);
 phase='completed';const passed=goodProcess&&goodEvents;
 exactWrite('qualification-report.json',{kind:'OWNED_GIT_BATCH_HOSTED_QUALIFICATION',state:passed?'PASS_OWNED_HELPER_AND_PARSERS':'FAIL_OR_INCOMPLETE',sourceBinding:sourceProof,process:{exitCode:child.status,signal:child.signal??null,errorCode:child.error?.code??null,stderrBytes:Buffer.isBuffer(child.stderr)?child.stderr.length:null},observed:result,unimplemented:spec.unimplemented,limits:'Helper/parser/owned synthetic Git only; no release-tool adoption, real caller fences or actual production action.',effects:flags()});
 process.exitCode=passed?0:1;
}catch{
 if(outputDir){try{exactWrite('qualification-report.json',{kind:'OWNED_GIT_BATCH_HOSTED_QUALIFICATION',state:'HOLD_BEFORE_OR_DURING_QUALIFICATION',phase,runtime:runtimeProof,sourceBinding:sourceProof,observed:result,effects:flags()});}catch{}}
 process.stderr.write('OWNED_GIT_BATCH_QUALIFICATION_HOLD\n');process.exitCode=1;
}
