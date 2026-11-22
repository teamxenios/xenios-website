// PRIVATE AUTHORED_UNRUN. Native Node20 event inventory; no invented test outcome.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const specUrl=new URL('./expected-cases.json',import.meta.url);
const raw=fs.readFileSync(specUrl);
if(crypto.createHash('sha256').update(raw).digest('hex')!=='64431834d510e3798568916bd59b580b6b816dc19b9177d2c9c3991b9906fb42')throw new Error('OWNED_REPORTER_SPEC_REFUSED');
const spec=JSON.parse(raw),expected=new Map(spec.cases.map(x=>[x.name,x.nesting]));
if(expected.size!==47||spec.cases.length!==47||spec.caseCount!==47)throw new Error('OWNED_REPORTER_INVENTORY_REFUSED');
const cancelled=new Set(['cancelledByParent','testAborted','testTimeoutFailure']);
const failureKinds=new Set([...cancelled,'testCodeFailure','subtestsFailed','parentAlreadyFinished','hookFailed','uncaughtException','unhandledRejection']);

export const OPERATOR_STDIO_SCHEMA=Object.freeze({
 maxProjectedEvents:32,maxMessageBytes:65536,
 streams:Object.freeze(['STDOUT','STDERR','UNBOUND']),
 files:Object.freeze(['CONTROL_ROOM','MCP_BRIDGE','GUARDED_INTEGRATION','UNBOUND']),
 classes:Object.freeze(['PUBLIC_FIXTURE_ACK_SUMMARY_EXACT','PUBLIC_NPM_PRODUCTION_CONFIG_WARNING_EXACT','GIT_STYLE_HINT_PREFIX_ONLY','GIT_STYLE_WARNING_PREFIX_ONLY','UNKNOWN']),
});
const operatorFiles=Object.freeze([
 ['CONTROL_ROOM','scripts/xenios-control/control-room.node-test.mjs'],
 ['MCP_BRIDGE','scripts/xenios-control/control-room-mcp.node-test.mjs'],
 ['GUARDED_INTEGRATION','scripts/xenios-control/control-room-integration.node-test.mjs'],
]);
/** Classification only. No message/hash/test name/path is returned, even on unknown input. */
export function projectOperatorStdio(event,sourceDirectory){
 const data=event?.data??{},message=typeof data.message==='string'?data.message:null;
 const bytes=message===null?null:Buffer.byteLength(message,'utf8');
 const bounded=bytes!==null&&bytes<=OPERATOR_STDIO_SCHEMA.maxMessageBytes;
 const stream=event?.type==='test:stdout'?'STDOUT':event?.type==='test:stderr'?'STDERR':'UNBOUND';
 let file='UNBOUND';
 if(typeof data.file==='string'&&typeof sourceDirectory==='string')for(const [id,relative]of operatorFiles){
  const absolute=path.resolve(sourceDirectory,relative);
  if(data.file===relative||data.file===absolute||data.file===pathToFileURL(absolute).href){file=id;break;}
 }
 const line=file!=='UNBOUND'&&Number.isSafeInteger(data.line)&&data.line>=1&&data.line<=1000000?data.line:null;
 let classification='UNKNOWN';
 if(bounded){
  if(message==='Reviewed the handoff and accepted the requested task.')classification='PUBLIC_FIXTURE_ACK_SUMMARY_EXACT';
  else if(message==='npm warn config production Use `--omit=dev` instead.\n')classification='PUBLIC_NPM_PRODUCTION_CONFIG_WARNING_EXACT';
  else if(/^hint:(?: |\r?\n|$)/u.test(message))classification='GIT_STYLE_HINT_PREFIX_ONLY';
  else if(/^warning:(?: |\r?\n|$)/u.test(message))classification='GIT_STYLE_WARNING_PREFIX_ONLY';
 }
 return {stream,file,line,utf8Bytes:bounded?bytes:null,classification};
}
export function createOperatorStdioDiagnostics(){
 const projected=[],streamCounts=Object.fromEntries(OPERATOR_STDIO_SCHEMA.streams.map(key=>[key,0])),classificationCounts=Object.fromEntries(OPERATOR_STDIO_SCHEMA.classes.map(key=>[key,0]));let total=0;
 return {
  observe(event,sourceDirectory){
   if(total>=2000)throw new Error('OWNED_REPORTER_EVENT_BOUND');
   const row=projectOperatorStdio(event,sourceDirectory);total++;streamCounts[row.stream]++;classificationCounts[row.classification]++;
   if(projected.length<OPERATOR_STDIO_SCHEMA.maxProjectedEvents)projected.push(row);
  },
  snapshot(){return {version:1,scope:'DIAGNOSTIC_ONLY_ALL_STDIO_REMAINS_DISQUALIFYING',projectedEventLimit:32,projectedEventCount:projected.length,
   projectedEvents:projected.map(row=>({...row})),remainingEventCount:total-projected.length,truncated:total>projected.length,
   streamCounts:{...streamCounts},classificationCounts:{...classificationCounts},unknownEvents:classificationCounts.UNKNOWN};},
 };
}

export default async function* report(source){
 const observed=new Map(),problems=new Set(),diagnostics=new Map(),stdioDiagnostics=createOperatorStdioDiagnostics();
 let events=0,unknownTerminals=0,stdioEvents=0,stdioBytes=0;
 for await(const event of source){
  events++;if(events>2000)throw new Error('OWNED_REPORTER_EVENT_BOUND');
  const d=event.data??{};
  if(event.type==='test:stdout'||event.type==='test:stderr'){
   stdioEvents++;stdioBytes+=typeof d.message==='string'?Buffer.byteLength(d.message):0;
   if(stdioBytes>65536)throw new Error('OWNED_REPORTER_STDIO_BOUND');stdioDiagnostics.observe(event,process.cwd());continue;
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
  observed.set(d.name,{name:d.name,nesting:d.nesting,outcome,failureType,durationMs:Number.isFinite(duration)?duration:null});
 }
 const counts={};for(const key of ['tests','pass','fail','cancelled','skipped','todo']){counts[key]=diagnostics.has(key)?diagnostics.get(key):null;if(counts[key]===null)problems.add('MISSING_SUMMARY_FIELD');}
 const actual={passed:0,failed:0,cancelled:0,skipped:0,todo:0};for(const row of observed.values())actual[row.outcome]++;
 for(const [field,key]of Object.entries({pass:'passed',fail:'failed',cancelled:'cancelled',skipped:'skipped',todo:'todo'}))if(counts[field]!==actual[key])problems.add('SUMMARY_TERMINAL_DISAGREEMENT');
 if(counts.tests!==observed.size+unknownTerminals)problems.add('SUMMARY_TOTAL_DISAGREEMENT');
 const rows=[...expected].map(([name,nesting])=>observed.get(name)??{name,nesting,outcome:'NOT_OBSERVED',failureType:null,durationMs:null});
 if(rows.some(x=>x.outcome==='NOT_OBSERVED'))problems.add('MISSING_INVENTORY_RESULT');
 if(stdioEvents!==0)problems.add('UNEXPECTED_TEST_STDIO');
 const missingExpectedTerminals=rows.filter(x=>x.outcome==='NOT_OBSERVED').length;
 const complete=problems.size===0&&rows.length===47&&observed.size===47&&missingExpectedTerminals===0;
 yield JSON.stringify({kind:'CONTROL_ROOM_NODE20_OBSERVED_EVENTS',node:process.versions.node,eventCount:events,observedTerminalCount:observed.size,unknownTerminals,missingExpectedTerminals,stdioEvents,stdioBytes,stdioDiagnostics:stdioDiagnostics.snapshot(),nodeReportedCounts:counts,observedOutcomeCounts:actual,inventoryComplete:complete,problems:[...problems].sort(),rows})+'\n';
}
