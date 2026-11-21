// PRIVATE AUTHORED_UNRUN. Native Node20 event inventory; no invented test outcome.
import fs from 'node:fs';
import crypto from 'node:crypto';

const specUrl=new URL('./expected-cases.json',import.meta.url);
const raw=fs.readFileSync(specUrl);
if(crypto.createHash('sha256').update(raw).digest('hex')!=='8eca242c2a84e139e7f531a555b8e2d623106c92a776279d37126b14dd50f7a2')throw new Error('OWNED_REPORTER_SPEC_REFUSED');
const spec=JSON.parse(raw),expected=new Map(spec.cases.map(x=>[x.name,x.nesting]));
if(expected.size!==20||spec.cases.length!==20||spec.caseCount!==20)throw new Error('OWNED_REPORTER_INVENTORY_REFUSED');
const cancelled=new Set(['cancelledByParent','testAborted','testTimeoutFailure']);
const failureKinds=new Set([...cancelled,'testCodeFailure','subtestsFailed','parentAlreadyFinished','hookFailed','uncaughtException','unhandledRejection']);


// Diagnostic companion only. Never stringify an Error, stack, actual/expected
// assertion payload, environment, request, command line or unapproved message.
const diagnosticNames=new Set(['Error','TypeError','RangeError','ReferenceError','SyntaxError','URIError','EvalError','AssertionError','SystemError','AggregateError']);
const diagnosticCodes=new Set(["EACCES","ECANCELED","EEXIST","EINVAL","EISDIR","ENOBUFS","ENOENT","ENOTDIR","EPERM","EPIPE","ERR_ASSERTION","ERR_CHILD_PROCESS_STDIO_MAXBUFFER","ERR_INVALID_ARG_TYPE","ERR_INVALID_ARG_VALUE","ERR_OUT_OF_RANGE","ERR_TEST_FAILURE","ETIMEDOUT","actual_corpus_publication_result","actual_git_common_mismatch","actual_runtime_namespace_mismatch","advanced_authority_requires_existing_coordinator","advanced_or_unexpected_trusted_read","after_trusted_read","archive_verified","before_binding","before_dead_owner_recovery","before_filesystem","before_installation_custody","before_trusted_read","binding_already_present","binding_changed_during_resume","binding_observed","binding_observed_requires_trusted_read","binding_prepared","binding_without_image","bounded_git_refused","custody_acquired","custody_chain_drift","directory_inventory_drift","duplicate_preimage_directory","existing_publication_record_mismatch","external_recovery_identity_required","file_identity_drift","file_size_drift","filesystem_corpus_publication_inspection","foreign_future_identity","foreign_installation_custody","foreign_or_unknown_binding","foreign_preparation_directory","foreign_prepared_head","future_creation_ownership_unknown","future_identity_record_invalid","future_target_not_approved_empty_or_absent","genesis_outcome_unknown_preserved","held_for_explicit_recovery","image_verified","immediately_before_binding","installation_custody_lost","installation_custody_partial_or_unknown","installation_lock_invalid","installation_owner_not_proven_absent","invalid_bounded_file","invalid_progress_port","invalid_publication_budget","loaded_source_mode_or_path_mismatch","loaded_source_pin_mismatch","owned_directory_changed","owned_directory_invalid","owner_observation_unavailable","partial_or_foreign_preparation_file","partial_unpublished_preserved","physical_alias_or_link","physical_path_absent","physical_probe_bound","physical_probe_refused","plan_identity_mismatch","plan_not_mechanically_complete","preimage_directory_inventory_required","prepared_binding_drift","prepared_unpublished","publication_already_started","publication_deadline","publication_identity_and_source_required","publication_journal_incomplete","publication_journal_type_invalid","publication_namespace_already_present","publication_record_invalid","publication_refused","publication_source_delta_mismatch","publication_source_parent_mismatch","published_binding_drift","raw_preimage_byte_drift","raw_preimage_inventory_drift","recovery_namespace_changed","resume_custody_missing","snapshot_byte_bound","snapshot_directory_invalid","snapshot_entry_or_path_bound","snapshot_link_refused","snapshot_type_refused","strict_preparation_refused","trusted_action_capability_required","trusted_action_port_required","trusted_action_recheck_refused","trusted_binding_mismatch","trusted_image_byte_mismatch","trusted_image_inventory_mismatch","trusted_read_verified","unknown_publication_journal_entry","unowned_or_published_genesis","unsafe_relative_path","unsupported_physical_path","unsupported_publication_runtime","write_byte_bound","write_readback_mismatch"]);
const diagnosticMessages=new Set(diagnosticCodes);
function dataField(object,key,prototypeDepth=0){
 if(object===null||typeof object!=='object')return {state:'ABSENT_OR_NONOBJECT'};
 try{let current=object;for(let depth=0;depth<=prototypeDepth&&current!==null;depth++){
  const d=Object.getOwnPropertyDescriptor(current,key);
  if(d)return Object.hasOwn(d,'value')?{state:'DATA',value:d.value}:{state:'ACCESSOR_OMITTED'};
  current=Object.getPrototypeOf(current);
 }return {state:'ABSENT'};}catch{return {state:'READ_REFUSED'};}
}
function fixedField(object,key,allowed,cap,depth=0){
 const item=dataField(object,key,depth);if(item.state!=='DATA')return {value:null,state:item.state};
 const value=item.value;
 if(typeof value!=='string')return {value:null,state:'NONSTRING_OMITTED'};
 if(value.length>cap)return {value:null,state:'OVER_CAP_OMITTED'};
 return allowed.has(value)?{value,state:'RETAINED_FIXED_LITERAL'}:{value:null,state:'NOT_ALLOWLISTED_OMITTED'};
}
function errorFacts(object){
 if(object===null||typeof object!=='object')return null;
 return {name:fixedField(object,'name',diagnosticNames,48,3),
  code:fixedField(object,'code',diagnosticCodes,96),
  failureType:fixedField(object,'failureType',failureKinds,48),
  message:fixedField(object,'message',diagnosticMessages,256)};
}

const observerStages=new Set(['runtime','authority_path','fixed_ntfs','serializer_selfcheck','management_assembly','local_scope','operating_system','process','serialization','complete']);
const exceptionTypes=new Set(['System.Management.ManagementException','System.TimeoutException','System.ComponentModel.Win32Exception','System.UnauthorizedAccessException','System.ArgumentException','System.IO.IOException','System.InvalidOperationException','System.Runtime.InteropServices.COMException','System.Management.Automation.RuntimeException','System.Management.Automation.MethodInvocationException','System.Management.Automation.ParentContainsErrorRecordException']);
const publicationPhases=new Set(['admission','custody_acquired','archive_verified','image_verified','binding_prepared','binding_observed','trusted_read_verified']);
function ownValue(object,key){const f=dataField(object,key);return f.state==='DATA'?f.value:undefined;}
function integerField(object,key,min,max){const v=ownValue(object,key);return Number.isSafeInteger(v)&&v>=min&&v<=max?v:null;}
function hashField(object,key){const v=ownValue(object,key);return typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)?v:null;}
function observerReceipt(object){
 if(object===null||typeof object!=='object')return null;
 const helper=ownValue(object,'helperJson');
 return {helperExitCode:integerField(object,'helperExitCode',-2147483648,4294967295),
  transportCode:fixedField(object,'transportCode',diagnosticCodes,96),
  signal:fixedField(object,'signal',new Set(['SIGTERM','SIGKILL','SIGINT']),16),
  validation:fixedField(object,'validation',new Set(['pending','accepted','refused']),16),
  stdoutBytes:integerField(object,'stdoutBytes',0,131072),stderrBytes:integerField(object,'stderrBytes',0,131072),
  stdoutSha256:hashField(object,'stdoutSha256'),stderrSha256:hashField(object,'stderrSha256'),
  helperJson:helper&&typeof helper==='object'?{
   code:fixedField(helper,'code',diagnosticCodes,96),stage:fixedField(helper,'stage',observerStages,48),
   exceptionType:fixedField(helper,'exceptionType',exceptionTypes,128),hresult:integerField(helper,'hresult',-2147483648,2147483647)}:null,
  helperPid:null,helperBirth:null,wholeDescendantExitVerified:false};
}
function existingObserverDiagnostics(objects){
 const out={fixture:null,publication:null,scope:'FIRST_FAILED_NATIVE_CASE_ONLY_NO_CAUSE_INFERENCE'};
 for(const error of objects){
  const fixture=ownValue(error,'ownedFixtureObserver');
  if(!out.fixture&&ownValue(fixture,'schemaVersion')===1&&ownValue(fixture,'fixtureOnly')===true&&ownValue(fixture,'phase')==='request_for_runtime')
   out.fixture={phase:'request_for_runtime',fixtureOnly:true,receipt:observerReceipt(ownValue(fixture,'receipt'))};
  const publication=ownValue(error,'publication'),diagnostics=ownValue(publication,'diagnostics');
  if(!out.publication&&publication&&typeof publication==='object'){
   const selected=[];const length=Array.isArray(diagnostics)?ownValue(diagnostics,'length'):null;
   if(Number.isSafeInteger(length)&&length>=0){for(let i=length-1;i>=Math.max(0,length-64)&&selected.length<2;i--){
    const row=ownValue(diagnostics,String(i));if(ownValue(row,'tool')==='production-observer')selected.push({sourceIndex:i,receipt:observerReceipt(row)});
   }}
   out.publication={phase:fixedField(publication,'phase',publicationPhases,48),
    code:fixedField(publication,'code',diagnosticCodes,96),observerReceiptsNewestFirst:selected,
    omittedOlderOrOtherToolRecords:true};
  }
 }
 return out;
}

function failureDiagnostic(error,includeObserver){
 const cause=dataField(error,'cause');
 const original=cause.state==='DATA'?cause.value:null;
 // Native AssertionError.actual may be the original thrown Error after an
 // assert.rejects predicate failed. Only the same four safe fields are read;
 // never serialize arbitrary actual/expected values or execute getters.
 const assertionCode=dataField(original,'code');
 const actual=assertionCode.state==='DATA'&&assertionCode.value==='ERR_ASSERTION'?dataField(original,'actual'):{state:'NOT_APPLICABLE'};
 return {schemaVersion:1,native:errorFacts(error),causeLink:cause.state,
  cause:errorFacts(original),assertionActualLink:actual.state,
  assertionActual:actual.state==='DATA'?errorFacts(actual.value):null,
  existingObserver:includeObserver?existingObserverDiagnostics([error,original,actual.state==='DATA'?actual.value:null]):{state:'BOUNDED_TO_FIRST_FAILED_NATIVE_CASE'},
  arbitraryMessageOrPayloadRetained:false,underlyingRuntimeCauseEstablished:false};
}

export default async function* report(source){
 const observed=new Map(),problems=new Set(),diagnostics=new Map();
 let events=0,unknownTerminals=0,stdioEvents=0,stdioBytes=0,diagnosticBytes=0,diagnosticFailures=0;
 for await(const event of source){
  events++;if(events>2000)throw new Error('OWNED_REPORTER_EVENT_BOUND');
  const d=event.data??{};
  if(event.type==='test:stdout'||event.type==='test:stderr'){
   stdioEvents++;stdioBytes+=typeof d.message==='string'?Buffer.byteLength(d.message):0;
   if(stdioBytes>65536)throw new Error('OWNED_REPORTER_STDIO_BOUND');continue;
  }
  if(event.type==='test:diagnostic'){
   const match=typeof d.message==='string'?/^(tests|pass|fail|cancelled|skipped|todo) ([0-9]+)$/.exec(d.message):null;
   if(match){if(diagnostics.has(match[1]))problems.add('DUPLICATE_SUMMARY_FIELD');const count=Number(match[2]);if(!Number.isSafeInteger(count)||count>1000)throw new Error('OWNED_REPORTER_COUNT_BOUND');diagnostics.set(match[1],count);}
   continue;
  }
  if(event.type!=='test:pass'&&event.type!=='test:fail')continue;
  if(!expected.has(d.name)){unknownTerminals++;problems.add('UNEXPECTED_TERMINAL');continue;}
  if(observed.has(d.name)){problems.add('DUPLICATE_TERMINAL');continue;}
  if(d.nesting!==expected.get(d.name))problems.add('WRONG_NESTING');
  const duration=d.details?.duration_ms;
  if(!Number.isFinite(duration)||duration<0||duration>300000)problems.add('INVALID_DURATION');
  const kind=d.details?.error?.failureType;
  const failureType=typeof kind==='string'&&failureKinds.has(kind)?kind:(kind===undefined?null:'UNRECOGNIZED');
  const skip=d.skip!==undefined&&d.skip!==false,todo=d.todo!==undefined&&d.todo!==false;
  const outcome=skip?'skipped':todo?'todo':event.type==='test:pass'?'passed':cancelled.has(failureType)?'cancelled':'failed';
  const diagnostic=event.type==='test:fail'?failureDiagnostic(d.details?.error,++diagnosticFailures===1):null;
  diagnosticBytes+=Buffer.byteLength(JSON.stringify(diagnostic));if(diagnosticBytes>32768)throw new Error('OWNED_REPORTER_DIAGNOSTIC_BOUND');
  observed.set(d.name,{name:d.name,nesting:d.nesting,outcome,failureType,durationMs:Number.isFinite(duration)?duration:null,failureDiagnostic:diagnostic});
 }
 const counts={};for(const key of ['tests','pass','fail','cancelled','skipped','todo']){counts[key]=diagnostics.has(key)?diagnostics.get(key):null;if(counts[key]===null)problems.add('MISSING_SUMMARY_FIELD');}
 const actual={passed:0,failed:0,cancelled:0,skipped:0,todo:0};for(const row of observed.values())actual[row.outcome]++;
 for(const [field,key]of Object.entries({pass:'passed',fail:'failed',cancelled:'cancelled',skipped:'skipped',todo:'todo'}))if(counts[field]!==actual[key])problems.add('SUMMARY_TERMINAL_DISAGREEMENT');
 if(counts.tests!==observed.size+unknownTerminals)problems.add('SUMMARY_TOTAL_DISAGREEMENT');
 const rows=[...expected].map(([name,nesting])=>observed.get(name)??{name,nesting,outcome:'NOT_OBSERVED',failureType:null,durationMs:null});
 if(rows.some(x=>x.outcome==='NOT_OBSERVED'))problems.add('MISSING_INVENTORY_RESULT');
 if(stdioEvents!==0)problems.add('UNEXPECTED_TEST_STDIO');
 const complete=problems.size===0&&rows.length===20&&observed.size===20;
 yield JSON.stringify({kind:'CORPUS_PUBLICATION_NODE20_OBSERVED_EVENTS',node:process.versions.node,eventCount:events,observedTerminalCount:observed.size,unknownTerminals,stdioEvents,stdioBytes,diagnosticBytes,nodeReportedCounts:counts,observedOutcomeCounts:actual,inventoryComplete:complete,problems:[...problems].sort(),rows})+'\n';
}
