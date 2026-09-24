import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const evidence = path.join(root,'evidence');
const observations = JSON.parse(fs.readFileSync(path.join(evidence,'browser-evidence-index.json'),'utf8'));
const latest = new Map(observations.map(x=>[x.id,x]));
const rows=[];
for(const [id,observation] of latest){
  const file=path.join(evidence,id+'.txt');
  if(!fs.existsSync(file))continue;
  const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
  for(let index=0;index<lines.length;index++){
    const match=lines[index].match(/^\s*- (link|button|textbox|combobox|tab|searchbox|checkbox|radio) "([^"]+)"/);
    if(!match)continue;
    rows.push({ctaId:'CTA-'+id+'-L'+(index+1),evidence:id+'.txt',url:observation.url,observedAt:observation.at,role:match[1],label:match[2],destination:lines[index+1]?.match(/\/url: (.*)/)?.[1]??'',disabled:lines[index].includes('[disabled]'),exerciseStatus:'OBSERVED; individual action NOT RUN unless listed in scenario matrix'});
  }
}
const csvValue=x=>'"'+String(x??'').replaceAll('"','""')+'"';
const keys=Object.keys(rows[0]);
fs.writeFileSync(path.join(root,'CTA_MATRIX.csv'),[keys.map(csvValue).join(','),...rows.map(row=>keys.map(k=>csvValue(row[k])).join(','))].join('\n')+'\n');
function environment(url){const u=new URL(url);return u.hostname==='xeniostechnology.com'?'PRODUCTION 79414143d4355d5d3d14cd5fe6e5a536dc68d99d':u.port==='5302'||u.port==='5303'?'LOCAL REPAIR 02d525baa7d784ed16e297c1d17b1e4050ecf4cc':'LOCAL BASELINE 0574264562f33fe40572b1d9976f4700bef9c83e';}
const contractColumns=['CTA ID','environment/build','route','UI location','persona','exact label','likely user expectation','actual destination/action','prerequisites','server write expected/observed','persistence contract','confirmation','notification requirements','operator owner/queue','return/status path','applicable scenario IDs','mobile result','desktop result','evidence','finding IDs'];
const contracts=rows.map(r=>[r.ctaId,environment(r.url),new URL(r.url).pathname,r.role+'; '+r.evidence,'See evidence fixture/scenario; not individually qualified',r.label,'Label implies '+(r.role==='link'?'navigation':'interaction')+'; individual expectation review NOT RUN',r.destination||'Control observed; action contract NOT RUN',r.disabled?'Disabled in observed state':'Not individually verified','NOT RUN unless scenario explicitly records submission','NOT VERIFIED','See scenario results; otherwise NOT RUN','NOT VERIFIED','NOT VERIFIED',r.destination||'NOT VERIFIED','Map through evidence filename to SCENARIO_RESULTS.csv','NOT INDIVIDUALLY RUN','NOT INDIVIDUALLY RUN','evidence/'+r.evidence,/partnership|repair-.*(?:provider|accepted|courtesy)/.test(r.evidence)?'AUD-001':'']);
fs.writeFileSync(path.join(root,'ROUTE_AND_CTA_MATRIX.csv'),[contractColumns.map(csvValue).join(','),...contracts.map(r=>r.map(csvValue).join(','))].join('\n')+'\n');
const visits=JSON.parse(fs.readFileSync(path.join(evidence,'route-visits.json'),'utf8'));
const visited=new Set(visits.map(x=>x.path));
for(const o of observations)visited.add(new URL(o.url).pathname);
const routes=JSON.parse(fs.readFileSync(path.join(root,'route-inventory.json'),'utf8'));
for(const r of routes){
  const matcher=new RegExp('^'+r.path.split('/').map(s=>s.startsWith(':')?'[^/]+':s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/')+'$');
  r.evidence=observations.filter(o=>matcher.test(new URL(o.url).pathname)).map(o=>o.id+'.txt');
  r.status=r.path.includes('*')?'ROUTER WILDCARD; not a discrete scenario':visited.has(r.path)||r.evidence.length?'BROWSER ENTRY OBSERVED; full lifecycle NOT QUALIFIED':'NOT RUN';
  if(!r.evidence.length&&visited.has(r.path))r.evidence=['evidence/route-visits.json (requested route may redirect)'];
}
fs.writeFileSync(path.join(root,'route-inventory.json'),JSON.stringify(routes,null,2)+'\n');
const summary={observations:observations.length,uniqueSnapshotIds:latest.size,observedControls:rows.length,routeDeclarations:routes.length,entryObserved:routes.filter(r=>r.status.startsWith('BROWSER')).length,notRun:routes.filter(r=>r.status==='NOT RUN').length,notRunPaths:routes.filter(r=>r.status==='NOT RUN').map(r=>r.path),warning:'Loading snapshots, repeats and fixture states are not scenario pass counts. Controls are inventoried, not automatically exercised.'};
fs.writeFileSync(path.join(root,'coverage-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
