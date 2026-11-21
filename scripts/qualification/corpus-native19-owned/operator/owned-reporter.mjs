// PRIVATE AUTHORED_UNRUN. Native Node20 event inventory; no invented test outcome.
import fs from 'node:fs';
import crypto from 'node:crypto';

const specUrl=new URL('./expected-cases.json',import.meta.url);
const raw=fs.readFileSync(specUrl);
if(crypto.createHash('sha256').update(raw).digest('hex')!=='64431834d510e3798568916bd59b580b6b816dc19b9177d2c9c3991b9906fb42')throw new Error('OWNED_REPORTER_SPEC_REFUSED');
const spec=JSON.parse(raw),expected=new Map(spec.cases.map(x=>[x.name,x.nesting]));
if(expected.size!==47||spec.cases.length!==47||spec.caseCount!==47)throw new Error('OWNED_REPORTER_INVENTORY_REFUSED');
const cancelled=new Set(['cancelledByParent','testAborted','testTimeoutFailure']);
const failureKinds=new Set([...cancelled,'testCodeFailure','subtestsFailed','parentAlreadyFinished','hookFailed','uncaughtException','unhandledRejection']);

export default async function* report(source){
 const observed=new Map(),problems=new Set(),diagnostics=new Map();
 let events=0,unknownTerminals=0,stdioEvents=0,stdioBytes=0;
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
 yield JSON.stringify({kind:'CONTROL_ROOM_NODE20_OBSERVED_EVENTS',node:process.versions.node,eventCount:events,observedTerminalCount:observed.size,unknownTerminals,missingExpectedTerminals,stdioEvents,stdioBytes,nodeReportedCounts:counts,observedOutcomeCounts:actual,inventoryComplete:complete,problems:[...problems].sort(),rows})+'\n';
}
