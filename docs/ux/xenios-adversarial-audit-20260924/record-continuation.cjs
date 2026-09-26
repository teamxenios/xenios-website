const fs = require('node:fs');
const path = require('node:path');
const base = __dirname;
const runtime = 'c4ea8a9111fcdf7b66cff7db42347e7d38a3fefa';
const cases = [
 ['Cross-owner order denied','resume-cross-owner-denial.txt','native real guard/service; synthetic owners and memory order','PASS','No production RLS claim'],
 ['Correct owner sees seeded order','resume-owner-positive.txt','native real guard/service; synthetic owner','PASS','One seeded order'],
 ['Admin starts processing','resume-admin-processing.txt','native real admin guard/order service','PASS','No physical fulfillment'],
 ['Admin records tracking','resume-admin-tracking.txt','native real admin guard/order service','PASS','Synthetic tracking only'],
 ['Admin marks order shipped','resume-admin-shipped.txt','native real admin guard/order service','PASS','Order-level transition; package row not qualified'],
 ['Valid signed status token','resume-valid-status.txt','actual HMAC/status route; synthetic row','PASS','Read-only status fixture'],
 ['Expired signed status token','resume-expired-status.txt','actual HMAC/status route; synthetic row','PASS','No external recovery delivery'],
 ['Approved status controls','resume-approved-status.txt','actual status projection; synthetic approved row','PASS','Claim submission not executed in browser'],
 ['Active account status controls','resume-active-status.txt','actual status projection; synthetic active row','PASS','Seeded active state, not a claim-consumption event'],
 ['Courtesy stall preserves accepted result','resume-courtesy-stall.txt','actual bundle; isolated provider capture','PASS','Team accepted, courtesy bounded at 2 seconds'],
 ['Team provider timeout bounded','resume-team-timeout.txt','actual bundle; isolated provider capture','PASS','Unknown acceptance; draft retained; 10-second bound'],
 ['Provider response lost after acceptance','resume-provider-response-lost.txt','actual bundle; isolated provider capture','PASS','Receipt unknown, not definitive failure'],
 ['Provider retry replays acceptance','resume-provider-retry-accepted.txt','actual bundle; isolated provider capture','PASS','Unchanged payload; no second team acceptance'],
 ['Browser response lost after acceptance','resume-browser-response-lost.txt','actual bundle; CDP response interruption; capture','PASS','Response blocked after provider acceptance'],
 ['Retry rate limit retains draft','resume-retry-throttled.txt','actual route rate limit; isolated capture','PASS','Existing 5 per 10-minute limit'],
 ['Browser retry accepted without duplicate','resume-browser-response-retry-accepted.txt','actual bundle; isolated provider replay','PASS','Both email keys replay; no new acceptance'],
 ['Canonical documents sign-in return','resume-secure-documents-return.txt','actual c4ea8a9 browser bundle','PASS','Signed-out gate only'],
 ['Mobile validation and keyboard focus','resume-mobile-inquiry-validation.txt','actual c4ea8a9 browser bundle','PASS','390px sampled inquiry flow'],
 ['Responsive 390/768/1440','resume-responsive.json','actual c4ea8a9 browser bundle','PASS','Inquiry page sample, not all routes'],
 ['Slow-network pending state','resume-slow-inquiry-pending.txt','CDP 800ms latency and bandwidth limits','PASS','Submitting disabled; retained draft'],
 ['Slow-network completion','resume-slow-inquiry-accepted.txt','actual bundle; isolated provider capture','PASS','Acceptance only'],
 ['Duplicate inquiry replay','resume-duplicate-inquiry.txt','actual bundle; isolated provider capture','PASS','No duplicate captured acceptance'],
 ['200 percent visual scale','resume-visual-zoom-200.png','CDP page visual scale','PASS','Pinch-style scale, not desktop CSS reflow'],
 ['Desktop browser zoom qualification','resume-desktop-zoom-attempt.txt','browser keyboard attempt and DOM measurements','NOT RUN','Keyboard shortcut did not change measured width or pixel ratio; no 200-percent reflow claim'],
 ['Second owner history isolated','resume-other-owner-history.txt','real account/history projection and guard; native synthetic rows','PASS','No seeded order or assisted requests visible; unavailable sources disclosed'],
 ['Correct owner history visible','resume-correct-owner-history.txt','real account/history projection and guard; native synthetic rows','PASS','One order and two assisted requests; no production RLS claim'],
 ['Interrupted tab session recovers','resume-session-reopened.txt','native synthetic session; real account gate','PASS','Close tab and cold reopen retains authorized owner history'],
 ['Explicit sign-out revokes cold access','resume-session-revoked.txt','native synthetic session; real account gate','PASS','Cold account navigation returns to sign-in'],
 ['Status-purpose cannot claim','sql-claims-qualification.json','real HTTP token validator and production dependency; actual local SQL','PASS','401; no membership grant'],
 ['Expired claim cannot grant access','sql-claims-qualification.json','real signed-token validator and actual local SQL','PASS','401 even with correctly signed expired token'],
 ['Recovery-purpose session cannot claim','sql-claims-qualification.json','real production verifySignIn and actual local SQL','PASS','409; provider session is synthetic, exact-match verified'],
 ['Different signed-in owner cannot claim','sql-claims-qualification.json','real claim ownership check and actual local SQL','PASS','409; no foreign grant'],
 ['Approved owner claims in browser','sql-claim-after.txt','actual SPA, member claim route, production dependency and candidate SQL','PASS','One local active member; billing remains not_started'],
 ['Consumed claim replay is idempotent','sql-claims-qualification.json','actual HTTP claim route and SQL replay','PASS','One member and one welcome event; no duplicate'],
 ['Normal member denied admin approval','sql-admin-approval.json','canonical requireSupabaseAdmin and actual SQL','PASS','403; browser roles cannot grant admin'],
 ['Admin approval queues local claim','sql-admin-approval.json','canonical guard, approval registrar, production dependency and actual SQL','PASS','Queued is not delivered'],
 ['Admin approval retry replays','sql-admin-approval.json','actual SQL idempotency behind real admin guard','PASS','No duplicate approval notification'],
 ['Recovery browser hides claim action','sql-recovery-browser-boundary.txt','actual SPA recovery marker and real approved SQL row','PASS','Normal sign-in required; no password reset performed'],
 ['Consumed claim displays active status','sql-claim-consumed-status.txt','actual SPA status route after actual SQL claim','PASS','No second create-account form'],
];
const q = s => '"'+String(s??'').replaceAll('"','""')+'"';
const rows = cases.map((x,i)=>({id:'R'+String(i+1).padStart(3,'0'),scenario:x[0],evidence:'evidence/'+x[1],provenance:x[2],status:x[3],limitation:x[4],runtime:i<5?'02d525b UI; unchanged native guard/order source at c4ea8a9':runtime}));
fs.writeFileSync(path.join(base,'CONTINUATION_SCENARIOS.csv'),[['id','scenario','evidence','provenance','status','limitation','runtime'],...rows.map(r=>Object.values(r))].map(row=>row.map(q).join(',')).join('\n')+'\n');
// Preserve the historical rows while making the existing scenario ledger the
// entry point for new executed work. Provenance is an independent column.
const ledgerPath=path.join(base,'SCENARIO_RESULTS.csv');
let ledger=fs.readFileSync(ledgerPath,'utf8').trimEnd().split(/\r?\n/).filter(line=>!/^"R\d{3}"/.test(line));
if(!ledger[0].includes('"provenance"')) ledger=ledger.map((line,i)=>line+','+q(i===0?'provenance':'Historical evidence; see environment/build and original receipt'));
for(const r of rows)ledger.push([r.id,r.scenario,'LOCAL '+r.runtime,'synthetic only','See evidence','Isolated fixture','See evidence',r.scenario,'See scenario receipt','See scenario receipt',r.evidence,'See fixture receipt',r.evidence,r.status,r.limitation,'','Current continuation',r.provenance].map(q).join(','));
fs.writeFileSync(ledgerPath,ledger.join('\n')+'\n');
let nav=JSON.parse(fs.readFileSync(path.join(base,'evidence/resume-navigation-results.json')));
nav[70].limitation='Invitation password gate is rendered; order-request link is not available in this configured capture fixture. No password guessed or real invitation used.';
nav[74].limitation='Retired destination intentionally replaced by /research/account/documents. Replacement browser journey PASS in R017; old control is superseded, not a broken retained link.';
fs.writeFileSync(path.join(base,'evidence/resume-navigation-results.json'),JSON.stringify(nav,null,2)+'\n');
fs.writeFileSync(path.join(base,'continuation-coverage.json'),JSON.stringify({runtime,originalTestedRepair:'02d525baa7d784ed16e297c1d17b1e4050ecf4cc',testOnlySuccessor:'ee1c972ce57e34ed185949a72b0ce55256a35951',discoveredControls:3910,navigationPlan:nav.length,navigationExecuted:nav.filter(x=>x.executed).length,navigationNotExecuted:nav.filter(x=>!x.executed).map(x=>({id:x.scenarioId,limitation:x.limitation})),scenarioRows:rows.length,scenariosPass:rows.filter(x=>x.status==='PASS').length,scenariosNotRun:rows.filter(x=>x.status==='NOT RUN').length,externalDelivery:'UNVERIFIED',productionMutated:false},null,2)+'\n');
for(const name of ['focused','typecheck','build','full-tests','quality-regression','lifecycle-tests','approved-sql','partner-sql','protected-review','dag','routes']) {
 const src=path.join(base,'resume-'+name+'.log');if(fs.existsSync(src))fs.copyFileSync(src,path.join(base,'evidence/validation-'+name+'.txt'));
}
for (const file of ['AUDIT_REPORT.md','RELEASE_PACKET.md','BASELINE_COVERAGE.md','HANDOFF.md']) {
 const f=path.join(base,file);let s=fs.readFileSync(f,'utf8');let note='> Continuation supersedes this historical checkpoint: see [CONTINUATION_RESULTS.md](CONTINUATION_RESULTS.md), [CONTINUATION_SCENARIOS.csv](CONTINUATION_SCENARIOS.csv), and [PROTECTED_CHANGE_REVIEW.md](PROTECTED_CHANGE_REVIEW.md). Original repair 02d525b remains preserved; c4ea8a9 is the application successor; ee1c972 is test-only.\n\n';if(!s.startsWith('> Continuation'))fs.writeFileSync(f,note+s);
}
