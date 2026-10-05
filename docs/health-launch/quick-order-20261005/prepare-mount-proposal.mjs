// Generates review artifacts only. Never writes the protected destination paths.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=process.cwd();
const dir=path.join(root,'docs/health-launch/quick-order-20261005');
const proposals=[
 ['client/src/App.tsx',[
  ['const CareSection = lazy(() => import("@/care/section"));','const QuickOrderPage = lazy(() => import("@/research/quick-order/QuickOrderPage"));\nconst CareSection = lazy(() => import("@/care/section"));'],
  ['      <Route path="/health"><Redirect to="/" /></Route>','      <Route path="/health/quick-order"><Suspense fallback={<div aria-busy="true" />}><QuickOrderPage sessionKey={null} /></Suspense></Route>\n      <Route path="/health"><Redirect to="/" /></Route>']
 ]],
 ['shared/care/paths.ts',[
  ['/** The exact public umbrella gateway for the Care and Research pathways. */','/** Exact sensitive intake namespace, distinct from the public gateway. */\nexport function isHealthIntakePath(value: string): boolean {\n  return normalizeCarePath(value) === "/health/quick-order";\n}\n\n/** The exact public umbrella gateway for the Care and Research pathways. */']
 ]],
 ['client/src/lib/tracking.ts',[
  ['import { isCarePath, isHealthGatewayPath }','import { isCarePath, isHealthGatewayPath, isHealthIntakePath }'],
  ['    || isHealthGatewayPath(pathname)','    || isHealthGatewayPath(pathname)\n    || isHealthIntakePath(pathname)'],
  ['  if (isHealthGatewayPath(pathname)) return "health";','  if (isHealthGatewayPath(pathname) || isHealthIntakePath(pathname)) return "health";']
 ]],
 ['client/src/lib/attribution.ts',[
  ['import { isCarePath, isHealthGatewayPath }','import { isCarePath, isHealthGatewayPath, isHealthIntakePath }'],
  ['    isHealthGatewayPath(pathname) ||','    isHealthGatewayPath(pathname) ||\n    isHealthIntakePath(pathname) ||']
 ]],
 ['server/research/seo/raw-http-document-policy.ts',[
  ['  for (const path of KNOWN_NOINDEX_EXACT_PATHS) addPrivate(path);','  addPrivate("/health/quick-order");\n  for (const path of KNOWN_NOINDEX_EXACT_PATHS) addPrivate(path);']
 ]],
 ['server/index.ts',[
  ['import { registerRoutes } from "./routes";','import { registerRoutes } from "./routes";\nimport { createQuickOrderContainment } from "./research/health/quick-order/containment";'],
  ['registerLegacyResearchOrderContainment(app);','registerLegacyResearchOrderContainment(app);\n// Disabled Quick Order terminates before parsing or retaining customer bodies.\napp.use(createQuickOrderContainment());']
 ]],
];
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const pairs=[];let patch='';
for(const [target,replacements] of proposals){
 const before=fs.readFileSync(path.join(root,target),'utf8').replaceAll('\r\n','\n');
 let after=before;
 for(const [from,to] of replacements){
  if(after.split(from).length!==2)throw Error(`Non-unique proposal anchor: ${target}`);
  after=after.replace(from,to);
 }
 const a=path.join(dir,'proposal-before.tmp'),b=path.join(dir,'proposal-after.tmp');
 fs.writeFileSync(a,before);fs.writeFileSync(b,after);
 const result=spawnSync('git',['diff','--no-index','--no-ext-diff','--',a,b],{encoding:'utf8'});
 fs.unlinkSync(a);fs.unlinkSync(b);
 if(result.status!==1)throw Error(`Diff generation failed: ${target}`);
 const raw=result.stdout;
 const hunks=raw.slice(raw.indexOf('@@'));
 patch+=`diff --git a/${target} b/${target}\n--- a/${target}\n+++ b/${target}\n${hunks}`;
 pairs.push({path:target,beforeSha256lf:hash(before),proposedAfterSha256lf:hash(after),applied:false});
}
fs.writeFileSync(path.join(dir,'MOUNT_PROPOSAL.patch'),patch);
fs.writeFileSync(path.join(dir,'evidence/mount-proposal-hashes.json'),JSON.stringify({scope:'Disabled route and privacy containment only. No real adapters or collection enabled.',pairs},null,2)+'\n');
console.log(JSON.stringify({files:pairs.length,patchSha256:hash(patch),applied:false}));
