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
    rows.push({evidence:id+'.txt',url:observation.url,observedAt:observation.at,role:match[1],label:match[2],destination:lines[index+1]?.match(/\/url: (.*)/)?.[1]??'',disabled:lines[index].includes('[disabled]'),exerciseStatus:'OBSERVED; individual action NOT RUN unless listed in scenario matrix'});
  }
}
const csvValue=x=>'"'+String(x??'').replaceAll('"','""')+'"';
const keys=Object.keys(rows[0]);
fs.writeFileSync(path.join(root,'CTA_MATRIX.csv'),[keys.map(csvValue).join(','),...rows.map(row=>keys.map(k=>csvValue(row[k])).join(','))].join('\n')+'\n');
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
