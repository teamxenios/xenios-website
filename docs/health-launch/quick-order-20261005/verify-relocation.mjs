// Static inventory and proposed-byte verification only. This does not run the
// protection CLI, tests, typecheck, build, browser, database or actual App.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadManifest, buildZones, classifyPath } from '../../../scripts/acceptance/verify-core-site-protection.mjs';
const dir='docs/health-launch/quick-order-20261005',base='756a906877dbc174b7e228a259d2faa9c3af48ca';
const [label='']=process.argv.slice(2);if(!/^[a-z0-9-]*$/.test(label))throw Error('Invalid receipt label');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const text=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const manifest=loadManifest(),zones=buildZones(manifest),inventory=read(`${dir}/evidence/relocation-inventory.json`).inventory;
const classified=inventory.map(row=>({...row,oldClass:classifyPath(row.oldPath,zones),newClass:classifyPath(row.newPath,zones),oldAbsent:!fs.existsSync(row.oldPath),newHashMatches:hash(text(row.newPath))===row.afterSha256lf}));
const baselineFiles=['docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json','scripts/acceptance/verify-core-site-protection.mjs'];
const protectionUnchanged=baselineFiles.map(path=>({path,baseSha256lf:hash(execFileSync('git',['show',`${base}:${path}`],{encoding:'utf8'}).replaceAll('\r\n','\n')),currentSha256lf:hash(text(path))}));
const patch=text(`${dir}/MOUNT_PROPOSAL.patch`),pairs=read(`${dir}/evidence/mount-proposal-hashes.json`).pairs;
const originalPatchHash=hash(text(`${dir}/history/MOUNT_PROPOSAL_6481c2ad_HELD.patch`));
// Apply unified hunks to strings only, never to protected files.
function proposed(path){
 const section=patch.split('diff --git ').find(part=>part.startsWith(`a/${path} b/${path}\n`));
 if(!section)throw Error(`Missing proposal section: ${path}`);
 const lines=section.split('\n'),source=text(path).split('\n'),out=[];let cursor=0;
 for(let i=0;i<lines.length;i++){
  const header=/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/.exec(lines[i]);if(!header)continue;
  const start=Number(header[1])-1;out.push(...source.slice(cursor,start));cursor=start;
  for(i++;i<lines.length&&!lines[i].startsWith('@@');i++){
   const line=lines[i];if(line==='')continue;
   if(line[0]===' '||line[0]==='-'){if(source[cursor]!==line.slice(1))throw Error(`Stale hunk: ${path}:${cursor+1}`);cursor++;}
   if(line[0]===' '||line[0]==='+')out.push(line.slice(1));
  }
  i--;
 }
 out.push(...source.slice(cursor));return out.join('\n');
}
const proposals=pairs.map(pair=>{
 const after=proposed(pair.path),hard=manifest.fileHashes.files[pair.path]??null,seam=manifest.seamBaselineHashes?.files[pair.path]??null;
 return {...pair,classification:classifyPath(pair.path,zones),hardHashPin:hard,seamReportedBaseline:seam,currentBaselineMatches:hash(text(pair.path))===pair.beforeSha256lf,proposedHashMatches:hash(after)===pair.proposedAfterSha256lf,reportedSeamMismatch:seam!==null&&seam!==`sha256:${pair.beforeSha256lf}`};
});
const app=proposed('client/src/App.tsx'),server=proposed('server/index.ts'),care=proposed('shared/care/paths.ts');
const orderChecks={
 clientImport:app.includes('import("@/research/quick-order/QuickOrderPage")'),
 exactRouteBeforeHealth:app.indexOf('<Route path="/health/quick-order">')>=0&&app.indexOf('<Route path="/health/quick-order">')<app.indexOf('<Route path="/health"><Redirect to="/" /></Route>'),
 routeDisabled:app.includes('<QuickOrderPage sessionKey={null} />'),
 serverImport:server.includes('from "./research/health/quick-order/containment"'),
 afterNormalizer:server.indexOf('app.use(createQuickOrderContainment());')>server.indexOf('req.url = req.url.replace(/^\\/{2,}/, "/");'),
 afterLegacy:server.indexOf('app.use(createQuickOrderContainment());')>server.indexOf('registerLegacyResearchOrderContainment(app);'),
 beforeJsonParser:server.indexOf('app.use(createQuickOrderContainment());')<server.indexOf('  express.json({'),
 beforeRawBodyRetention:server.indexOf('app.use(createQuickOrderContainment());')<server.indexOf('      req.rawBody = buf;'),
 separateHealthIntake:care.includes('export function isHealthIntakePath(value: string): boolean {\n  return normalizeCarePath(value) === "/health/quick-order";\n}'),
 gatewayUnchanged:care.slice(care.indexOf('/** The exact public umbrella gateway'))===text('shared/care/paths.ts').slice(text('shared/care/paths.ts').indexOf('/** The exact public umbrella gateway')),
 trackingSuppressed:proposed('client/src/lib/tracking.ts').includes('|| isHealthIntakePath(pathname)'),
 attributionSuppressed:proposed('client/src/lib/attribution.ts').includes('isHealthIntakePath(pathname) ||'),
 privateDocument:proposed('server/research/seo/raw-http-document-policy.ts').includes('addPrivate("/health/quick-order");'),
};
const oldReferenceScan=spawnSync('rg',['-n','@/quick-order|server/health/quick-order|client/src/quick-order','client','server','shared'],{encoding:'utf8'});
const applyCheck=spawnSync('git',['apply','--check',`${dir}/MOUNT_PROPOSAL.patch`],{encoding:'utf8'});
const ok=classified.every(row=>row.oldAbsent&&row.newHashMatches&&row.newClass!=='violation')&&protectionUnchanged.every(row=>row.baseSha256lf===row.currentSha256lf)&&proposals.every(row=>row.currentBaselineMatches&&row.proposedHashMatches)&&Object.values(orderChecks).every(Boolean)&&oldReferenceScan.status===1&&applyCheck.status===0&&originalPatchHash==='6481c2ad2d4d2828e789cb2f2e24964705562cb782d70728b4152d78dc40a672';
const receipt={at:new Date().toISOString(),ok,scope:'Static predicate and in-memory proposed-byte checks; not a full gate or executed application proof.',comparisonBase:base,workingHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),inventory:classified,protectionUnchanged,proposals,orderChecks,patchSha256lf:hash(patch),historicalHeldPatchSha256lf:originalPatchHash,oldReferenceScan:{exit:oldReferenceScan.status,output:oldReferenceScan.stdout+oldReferenceScan.stderr},applyCheck:{exit:applyCheck.status,output:applyCheck.stdout+applyCheck.stderr}};
const target=`${dir}/evidence/relocation-static${label?`-${label}`:''}.json`;if(fs.existsSync(target))throw Error('Preserve prior static receipt');fs.writeFileSync(target,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({ok,oldViolations:classified.filter(r=>r.oldClass==='violation').length,newViolations:classified.filter(r=>r.newClass==='violation').length,newAllowed:classified.filter(r=>r.newClass==='allowed').length,reportedTests:classified.filter(r=>r.newClass==='test').length,orderChecks,patchSha256lf:hash(patch),applyCheckExit:applyCheck.status,oldReferenceScanExit:oldReferenceScan.status}));process.exitCode=ok?0:1;
