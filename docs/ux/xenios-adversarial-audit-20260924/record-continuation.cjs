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
];
const q = s => '"'+String(s??'').replaceAll('"','""')+'"';
const rows = cases.map((x,i)=>({id:'R'+String(i+1).padStart(3,'0'),scenario:x[0],evidence:'evidence/'+x[1],provenance:x[2],status:x[3],limitation:x[4],runtime:i<5?'02d525b UI; unchanged native guard/order source at c4ea8a9':runtime}));
fs.writeFileSync(path.join(base,'CONTINUATION_SCENARIOS.csv'),[['id','scenario','evidence','provenance','status','limitation','runtime'],...rows.map(r=>Object.values(r))].map(row=>row.map(q).join(',')).join('\n')+'\n');
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
