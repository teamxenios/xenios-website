// AUTHORED_UNRUN. Builtin Node controls; these invoke no Git, PS or native probe.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {CONTROL_NAMES,extractPrimitive,instrumentPrimitive,restorePrimitive,parseStages,parseNativeDiagnostics,projectNative,projectControlOutput,makeEnvironment,createOwnedOutput,ownsOutput,writeOwnedJSON} from './capture-physical-focus.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

test('instrumentation inverse restores the exact frozen primitive and leaves its predicates intact',()=>{
 const raw=fs.readFileSync(new URL('../../agentic/corpus-adoption-publication.mjs',import.meta.url));
 const parts=extractPrimitive(raw),staged=instrumentPrimitive(parts),restored=restorePrimitive(staged.script,staged.edits);
 assert.equal(sha(Buffer.from(restored)),'0c7bbe165125e3a1b0a257c491aa0f5e36d3441dfd5d07fbdf42e5ae976c2b6d');
 assert.equal(restored,parts.join(';'));assert.equal(staged.edits.length,8);
 for(const predicate of ["$drive.DriveFormat -ne 'NTFS'",'[IO.FileAttributes]::ReparsePoint','if($n -eq $q){break}',"if($items.Count -gt 10000){throw 'bound'}"])
  assert(staged.script.includes(predicate));
 assert.throws(()=>restorePrimitive(staged.script.replace('XR_PHYSICAL_STAGE','FOREIGN_TRACE'),staged.edits));
 assert.equal(staged.script.split('Get-Command -Name ConvertFrom-Json').length-1,1);
 assert.equal(staged.script.split('$xrRaw | & $xrCommand').length-1,1);
 assert(!staged.script.includes('ConvertTo-Json'));assert(!staged.script.includes('Import-Module'));
 for(const tag of ['RUNTIME_BEFORE','RUNTIME_AFTER','RESOLVE_BEFORE','RESOLVE_AFTER','INVOKE_BEFORE','INVOKE_AFTER'])assert(staged.script.includes(tag));
});
test('closed stage parser retains only known tags and opaque bounded ordinals',()=>{
 const tags=['ENTRY -1 -1','READ_BEFORE -1 -1','READ_AFTER -1 -1','JSON_BEFORE -1 -1','JSON_AFTER -1 -1','PATH_BEFORE 0 0','PATH_AFTER 0 0','ATTR_BEFORE 0 0','ATTR_AFTER 0 0','PARENT_BEFORE 0 0','PARENT_AFTER 0 0','WRITE_BEFORE -1 -1','DONE -1 -1'];
 const result=parseStages(Buffer.from(tags.map(x=>'XR_PHYSICAL_STAGE '+x).join('\r\n')));
 assert.equal(result.valid,true);assert.equal(result.truncated,false);assert.equal(result.lastStage,'DONE');
 assert.equal(result.records.length,13);assert.deepEqual(result.records[5],{tag:'PATH_BEFORE',pathOrdinal:0,ancestorDepth:0});
});
test('arbitrary secret-like stderr is counted without being retained',()=>{
 const result=parseStages(Buffer.from('private@example.invalid secret-token\nC:\\private\\fixture\nXR_PHYSICAL_STAGE ENTRY -1 -1\n'));
 assert.equal(result.otherLines,2);assert.equal(result.records.length,1);
 const wire=JSON.stringify(result);assert(!wire.includes('private'));assert(!wire.includes('secret-token'));
});
test('malformed or excessive stage records cannot masquerade as complete diagnostics',()=>{
 const bad=parseStages(Buffer.from('XR_PHYSICAL_STAGE UNKNOWN -1 -1\nXR_PHYSICAL_STAGE PATH_BEFORE 6 100\n'));
 assert.equal(bad.valid,false);assert.equal(bad.records.length,0);
 const tooMany=parseStages(Buffer.from(Array.from({length:258},()=> 'XR_PHYSICAL_STAGE ENTRY -1 -1').join('\n')));
 assert.equal(tooMany.valid,false);assert(tooMany.problems.includes('STAGE_COUNT_BOUND'));
 const wrongOrder=parseStages(Buffer.from('XR_PHYSICAL_STAGE JSON_AFTER -1 -1\nXR_PHYSICAL_STAGE READ_BEFORE -1 -1'));
 assert.equal(wrongOrder.valid,false);
 const invokeBeforeResolve=parseStages(Buffer.from('XR_PHYSICAL_STAGE ENTRY -1 -1\nXR_PHYSICAL_STAGE INVOKE_BEFORE -1 -1\nXR_PHYSICAL_STAGE RESOLVE_AFTER -1 -1'));
 assert.equal(invokeBeforeResolve.valid,false);
 const partialResolve=parseStages(Buffer.from('XR_PHYSICAL_STAGE ENTRY -1 -1\nXR_PHYSICAL_STAGE JSON_BEFORE -1 -1\nXR_PHYSICAL_STAGE RESOLVE_BEFORE -1 -1'));
 assert.equal(partialResolve.valid,true);assert.equal(partialResolve.lastStage,'RESOLVE_BEFORE');
});
test('native transport projection omits accessors and arbitrary error payloads',()=>{
 let getters=0;const error=Object.defineProperties({}, {status:{value:null},signal:{value:'SIGTERM'},code:{get(){getters++;return 'secret-code';}},message:{get(){getters++;return 'private@example.invalid';}}});
 const value=projectNative(error,Buffer.from('private stdout'),Buffer.from('private stderr'),false);
 assert.equal(getters,0);assert.equal(value.status,null);assert.equal(value.statusState,'OBSERVED_NULL');assert.equal(value.errorCode,null);assert.equal(value.originalPredicateReached,false);
 assert.equal(value.stdoutBytes,14);assert.equal(value.nativeHelperPid,null);assert.equal(value.wholeDescendantExitVerified,false);
 const wire=JSON.stringify(value);assert(!wire.includes('private'));assert(!wire.includes('secret-code'));
 const success=projectNative(null,Buffer.from('{"schemaVersion":1,"noReparse":true,"checked":6}'),null,true);
 assert.equal(success.originalPredicateAccepted,true);assert.equal(success.stderrAvailable,false);assert.equal(success.stderrBytes,null);assert.equal(success.stderrSha256,null);
 // Synthetic unit input for the actual controls() retention projector. It
 // neither supplies native evidence nor replaces the real eight test events.
 const exact={kind:'OWNED_PHYSICAL_FOCUS_NATIVE_CONTROLS',node:'20.19.0',events:80,stdio:0,
  counts:{tests:8,pass:8,fail:0,cancelled:0,skipped:0,todo:0},
  rows:CONTROL_NAMES.map(name=>({name,nesting:0,outcome:'passed'})),problems:[],complete:true};
 const encode=value=>Buffer.from(JSON.stringify(value)+'\n'),accepted=projectControlOutput(encode(exact));
 assert.equal(accepted.accepted,true);assert.equal(accepted.code,'CONTROL_OUTPUT_ACCEPTED');assert.deepEqual(accepted.observed,exact);
 const rejected=[];
 for(const corrupt of [
  x=>{x.unexpected='PRIVATE_SENTINEL';},
  x=>{x.counts.unexpected='PRIVATE_SENTINEL';},
  x=>{x.rows[0].unexpected='PRIVATE_SENTINEL';},
  x=>{x.rows[0].name='PRIVATE_SENTINEL';},
  x=>{x.rows[1].name=x.rows[0].name;},
  x=>{x.rows[0].outcome='skipped';},
  x=>{x.rows[0].outcome='failed';x.counts.pass=7;x.counts.fail=1;x.complete=false;},
  x=>{x.rows[0].nesting='0';},
  x=>{x.counts.tests='8';},
  x=>{x.counts.tests=1001;},
  x=>{x.events=1001;},
  x=>{x.stdio=1;},
  x=>{x.complete='true';},
  x=>{x.problems=['PRIVATE_SENTINEL'];},
  x=>{x.rows.pop();}
 ]){
  const candidate=structuredClone(exact);corrupt(candidate);const result=projectControlOutput(encode(candidate));
  assert.deepEqual(result,{accepted:false,code:'CONTROL_OUTPUT_REFUSED',observed:null});rejected.push(result);
 }
 for(const raw of [Buffer.from('{"unexpected":"PRIVATE_SENTINEL"'),Buffer.alloc(65537,32),
  Buffer.from(encode(exact).toString('utf8').replace('"node":"20.19.0"','"node":"PRIVATE_SENTINEL","node":"20.19.0"')),
  Buffer.from(encode(exact).toString('utf8')+' ')]){
  const result=projectControlOutput(raw);assert.deepEqual(result,{accepted:false,code:'CONTROL_OUTPUT_REFUSED',observed:null});rejected.push(result);
 }
 const parent=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'physical-focus-projection-control-'))),owner=createOwnedOutput(parent,'11');
 writeOwnedJSON(owner,'pure-control-events.json',{kind:'SYNTHETIC_PROJECTOR_CONTROL_ONLY',accepted,rejected});
 const retained=fs.readFileSync(path.join(owner.root,'pure-control-events.json'),'utf8');
 assert(!retained.includes('PRIVATE_SENTINEL'));assert(!retained.includes('unexpected'));assert.equal(rejected.length,19);
 const runtime={PS_VERSION:'5.1.20348.2849',PS_EDITION:'Desktop',CLR_VERSION:'4.0.30319.42000',EXE_NAME:'powershell.exe',EXE_CLASS:'SYSTEM32_WINDOWS_POWERSHELL',EXE_VERSION:'10.0.20348.2849',EXE_PATH_SHA256:'a'.repeat(64),NATIVE_PID:'127',START_TICKS:'638992235000000000',INPUT_WEBNAME:'utf-8',INPUT_CODEPAGE:'65001',OUTPUT_WEBNAME:'ibm437',OUTPUT_CODEPAGE:'437',PIPELINE_WEBNAME:'us-ascii',PIPELINE_CODEPAGE:'20127',AUTOLOAD_MODE:'DEFAULT_UNSET',MODULE_PATH_PRESENT:'1',MODULE_PATH_ENTRIES:'3',COMMAND_NAME:'ConvertFrom-Json',COMMAND_MODULE:'Microsoft.PowerShell.Utility',COMMAND_VERSION:'3.1.0.0',COMMAND_TYPE:'Microsoft.PowerShell.Commands.ConvertFromJsonCommand'};
 const frame=(key,value)=>'XR_PHYSICAL_META '+key+' '+Buffer.from(value).toString('base64')+'\n';
 const nativeRaw=Buffer.from(Object.entries(runtime).map(([key,value])=>frame(key,value)).join(''));
 const observed=parseNativeDiagnostics(nativeRaw,127);
 assert.equal(observed.completeRuntime,true);assert.equal(observed.completeCommand,true);assert.equal(observed.selfPidMatchesResult,true);assert.equal(observed.selfStartTicks,runtime.START_TICKS);assert.deepEqual(observed.problems,[]);assert.equal(observed.nativeKernelHandleObserved,false);assert.equal(observed.wholeDescendantExitVerified,false);
 for(const [key,bad]of [['PS_VERSION','PRIVATE_SENTINEL'],['INPUT_WEBNAME','PRIVATE_SENTINEL'],['COMMAND_MODULE','PRIVATE_SENTINEL'],['FOREIGN_KEY','PRIVATE_SENTINEL']]){
  const replacement=Object.entries(runtime).filter(([name])=>name!==key).map(([name,value])=>frame(name,value)).join('')+frame(key,bad);
  const result=parseNativeDiagnostics(Buffer.from(replacement),127);assert(result.problems.length>0);assert(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));assert(!JSON.stringify(result).includes('FOREIGN_KEY'));
 }
 const duplicate=parseNativeDiagnostics(Buffer.concat([nativeRaw,Buffer.from(frame('NATIVE_PID','128'))]),127);assert(duplicate.problems.includes('DUPLICATE_METADATA'));
 const mismatch=parseNativeDiagnostics(nativeRaw,128);assert.equal(mismatch.selfPidMatchesResult,false);assert(mismatch.problems.includes('NATIVE_PID_MISMATCH'));assert.equal(mismatch.selfStartTicks,null);
 const absent=parseNativeDiagnostics(Buffer.alloc(0),127);assert.equal(absent.completeRuntime,false);assert.equal(absent.selfPidMatchesResult,null);assert.equal(absent.selfStartTicks,null);
 const malformed=parseNativeDiagnostics(Buffer.from('XR_PHYSICAL_META PS_VERSION !!!PRIVATE_SENTINEL!!!\n'),127);assert(malformed.problems.length>0);assert(!JSON.stringify(malformed).includes('PRIVATE_SENTINEL'));
 // Marked scratch retained. The actual controls() path applies the same closed
 // projector before writeOwnedJSON and before sample authorization.
});
test('hosted worker environment uses only the original closed recipe',()=>{
 const env=makeEnvironment({PATH:'fixture-path',PSModulePath:'private-modules',SUPABASE_SERVICE_ROLE_KEY:'private-key',GITHUB_TOKEN:'private-token',NODE_OPTIONS:'--import unapproved'},'fixture-root');
 assert.equal(env.PATH,'fixture-path');assert.equal(env.NODE_OPTIONS,'');assert.equal(env.NODE_PATH,'');
 assert.equal(env.RUNNER_TEMP,'fixture-root');assert.equal(env.XR_PUBLICATION_SOURCE,'15f470bb708d27630c175b36c3fd2de721553e9e');
 assert(!('PSModulePath' in env));assert(!('SUPABASE_SERVICE_ROLE_KEY' in env));assert(!('GITHUB_TOKEN' in env));
});
test('preexisting foreign output remains untouched after exclusive creation refusal',()=>{
 const parent=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'physical-focus-control-')));
 const foreign=path.join(parent,'corpus-publication-owned-9-1-win32');fs.mkdirSync(foreign);fs.writeFileSync(path.join(foreign,'KEEP'),'foreign sentinel');
 assert.throws(()=>createOwnedOutput(parent,'9'));assert.deepEqual(fs.readdirSync(foreign),['KEEP']);assert.equal(fs.readFileSync(path.join(foreign,'KEEP'),'utf8'),'foreign sentinel');
 // Marked test scratch is retained, never recursively cleaned or uploaded.
});
test('cloned or replaced output ownership cannot authorize report writes',()=>{
 const parent=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'physical-focus-control-'))),owner=createOwnedOutput(parent,'10');
 assert.equal(ownsOutput(owner),true);assert.equal(ownsOutput({...owner}),false);
 assert.throws(()=>writeOwnedJSON({...owner},'qualification-report.json',{secret:'foreign'}));
 const saved=path.join(parent,'saved-owned-output');
 assert.equal(path.dirname(path.resolve(owner.root)),parent);assert.equal(path.dirname(path.resolve(saved)),parent);
 fs.renameSync(owner.root,saved);fs.mkdirSync(owner.root);fs.writeFileSync(path.join(owner.root,'KEEP'),'foreign replacement');
 assert.equal(ownsOutput(owner),false);assert.throws(()=>writeOwnedJSON(owner,'qualification-report.json',{wrong:true}));
 assert.equal(fs.existsSync(path.join(owner.root,'qualification-report.json')),false);assert.equal(fs.readFileSync(path.join(owner.root,'KEEP'),'utf8'),'foreign replacement');
});
