// Existing lane only: lease extension and pre-move inventory, no source moves.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { overlaps } from '../../../scripts/agentic/path-overlap.mjs';
const root=process.cwd(),id='codex-health-quick-order-20261005',taskId='HEALTH-QUICK-ORDER-20261005';
const leaseId='17093695-69b5-4cc0-8b29-aedb82bf6409',at=new Date().toISOString();
const newPaths=['client/src/research/quick-order/**','server/research/health/quick-order/**'];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const observations=[],conflicts=[];
for(const worktree of ['389a','b22f','3221','2227','5b21','c502']){
 const file=`C:/Users/sboad/.codex/worktrees/${worktree}/xenios-website/.xenios/CODE_OWNERSHIP.json`;
 if(!fs.existsSync(file)){observations.push({worktree,available:false});continue;}
 const state=read(file);
 const found=state.leases.filter(lease=>lease.state==='active'&&lease.session!==id&&newPaths.some(a=>lease.paths.some(b=>overlaps(a,b))));
 observations.push({worktree,available:true,sha256lf:hash(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n')),conflicts:found});
 conflicts.push(...found);
}
if(conflicts.length)throw Error(`Destination lease conflict: ${JSON.stringify(conflicts)}`);
const board=read('.xenios/ACTIVE_TASKS.json'),task=board.tasks.find(t=>t.id===taskId);
const ownership=read('.xenios/CODE_OWNERSHIP.json'),lease=ownership.leases.find(l=>l.id===leaseId);
if(!task||task.owner!==id||!lease||lease.session!==id||lease.state!=='active')throw Error('Existing lane lease missing');
const mapping=[['client/src/quick-order/','client/src/research/quick-order/'],['server/health/quick-order/','server/research/health/quick-order/']];
const files=execFileSync('git',['ls-files','--','client/src/quick-order','server/health/quick-order','shared/health/quick-order'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
if(files.length!==22||files.filter(p=>p.startsWith('client/')).length!==7||files.filter(p=>p.startsWith('server/')).length!==15)throw Error('Unexpected relocation inventory');
const inventory=files.map(oldPath=>{
 const pair=mapping.find(([old])=>oldPath.startsWith(old));if(!pair)throw Error('Unexpected source');
 const newPath=pair[1]+oldPath.slice(pair[0].length);
 for(const relative of [oldPath,newPath])if(!path.resolve(root,relative).startsWith(root+path.sep))throw Error('Outside checkout');
 if(fs.existsSync(newPath))throw Error(`Destination exists: ${newPath}`);
 return {oldPath,newPath,beforeSha256lf:hash(fs.readFileSync(oldPath,'utf8').replaceAll('\r\n','\n'))};
});
const evidence='docs/health-launch/quick-order-20261005/evidence/relocation-before.json';
if(fs.existsSync(evidence))throw Error('Preserve existing relocation receipt');
task.paths=[...new Set([...task.paths,...newPaths])];task.state='claimed';
task.scopeNote='Same builder relocation repair under original implementation authority and coordinator dispatch8aa3f83: move existing22 files into Research zones, necessary path updates, regenerate proposal only. Old paths retained for removal. No protected/schema/manifest or hosted edits.';
lease.paths=[...task.paths];lease.heartbeatAt=at;lease.note='Active same-builder relocation only; destination collisions checked.';
const ownPath=`.xenios/sessions/${id}.json`,own=read(ownPath);Object.assign(own,{state:'active',heartbeatAt:at,note:task.scopeNote});
const registry=read('.xenios/SESSION_REGISTRY.json'),registered=registry.sessions.find(s=>s.id===id);if(!registered)throw Error('Registration missing');Object.assign(registered,own);
write(evidence,{at,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source:'4abd2c5cd4bd039309b32b97b117a67fc6a4d292',authorityDispatch:'8aa3f8398815f81200eb43ecb942e141dc4441da',leaseId,paths:task.paths,ownershipObservations:observations,inventory});
write('.xenios/ACTIVE_TASKS.json',board);write('.xenios/CODE_OWNERSHIP.json',ownership);write(ownPath,own);write('.xenios/SESSION_REGISTRY.json',registry);
console.log(JSON.stringify({leaseId,paths:task.paths,conflicts:0,sourceFiles:inventory.length,sharedFiles:0,at}));
