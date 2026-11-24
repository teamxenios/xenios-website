// Qualification-only proposal. Root selects/composes/dispatches; no app route,
// managed database, credentials, installation or automatic retry is accepted.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const tests=['server/research/catalog-publication.pg.test.ts','server/research/catalog-publication-concurrent-replay.pg.test.ts'];
const images=['postgres:17.6','postgres:17.11'];
const known={
 'supabase/candidates/catalog_publication.sql':'2fc9a355b8b7bcfd67229570ae631f6002c3aa58bb2bb88c80f555e22215fe32',
 'server/research/catalog-publication.pg.test.ts':'80fe9f07cd64008d2a96c5d7cfe12d5544682a0eab6ad92475cbe258d955ad1f',
 'server/research/assisted-order/request-intent/durable-journey.pg.fixture.ts':'3889dfbf502614e95f4fd00c6d265d9049a41766fa1cff82e0fd124305db80b4',
 'supabase/verification/research-pricing-lineage-disposable-bootstrap.sql':'bab1f2a56f773d22254c48cf75db9a1f794ed1ac92acd54afdeea86045ab6ceb',
 'supabase/migrations/20260726143000_research_product_control_center.sql':'b1589eb24405d4700206d25541b647479afee34c2cd05422da70df2179876203',
 'supabase/migrations/20260726214500_research_product_control_center_privilege_hardening.sql':'2fb96f105fcfb1d6f77bf6e9bcf191b48decbc9206f2045b32cf7595d31551db',
};
const need=(v,code)=>{if(!v)throw Error(code);};
const sha=b=>createHash('sha256').update(b).digest('hex');
// The existing fixture owns container creation/removal and its literal loopback
// endpoint. Force that fixture to the local Linux daemon, never a remote context.
const env=Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TZ','GITHUB_ACTIONS','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_JOB','GITHUB_SHA','GITHUB_REPOSITORY','RUNNER_TEMP'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]));
Object.assign(env,{CI:'true',XENIOS_RUN_PG16_VERIFIER:'1',DOCKER_HOST:'unix:///var/run/docker.sock'});
const run=(bin,args,timeout=15000)=>{
 const r=spawnSync(bin,args,{cwd:process.cwd(),env,encoding:'utf8',timeout,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});
 need(!r.error&&r.status===0,'QUALIFICATION_PREFLIGHT_COMMAND_FAILED:'+bin+':'+args[0]);return r.stdout.trim();
};
function containers(){return run('docker',['ps','--all','--filter','name=^/xenios-request-intent-','--format','{{.ID}} {{.Names}}']);}
function inputs(){
 const rows=[];
 for(const [file,digest]of Object.entries(known)){const raw=fs.readFileSync(file);need(sha(raw)===digest,'QUALIFICATION_INPUT_CHANGED:'+file);rows.push({path:file,bytes:raw.length,sha256:digest});}
 const manifest=JSON.parse(fs.readFileSync('scripts/acceptance/catalog-publication-pg-inputs.json','utf8'));
 need(manifest.schemaVersion===1&&Array.isArray(manifest.added)&&manifest.added.length===1,'QUALIFICATION_SUPPLEMENT_MANIFEST');
 const row=manifest.added[0];need(row.path===tests[1]&&/^[a-f0-9]{64}$/.test(row.sha256)&&Number.isSafeInteger(row.bytes),'QUALIFICATION_SUPPLEMENT_IDENTITY');
 const raw=fs.readFileSync(row.path);need(raw.length===row.bytes&&sha(raw)===row.sha256,'QUALIFICATION_SUPPLEMENT_CHANGED');rows.push(row);
 return rows;
}
function main(){
 need(process.argv.length===2,'QUALIFICATION_NO_ARGS_OR_DATABASE_URL');
 need(process.platform==='linux'&&process.arch==='x64'&&process.versions.node==='20.19.0','QUALIFICATION_RUNTIME');
 need(process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'&&/^\d+$/.test(process.env.GITHUB_RUN_ID??'')&&/^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT??'')&&process.env.GITHUB_JOB,'HOSTED_DISPOSABLE_PROFILE_REQUIRED');
 need(os.freemem()>=1024*1024*1024,'QUALIFICATION_LOW_RAM');
 const disk=fs.statfsSync(process.cwd());need(disk.bavail*disk.bsize>=1024*1024*1024,'QUALIFICATION_LOW_DISK');
 const checked=inputs();
 need(containers()==='','QUALIFICATION_EXISTING_OWNED_FIXTURE_REFUSE');
 const inventory=images.map(image=>{const v=JSON.parse(run('docker',['image','inspect',image,'--format','{{json .}}']));need(/^sha256:[a-f0-9]{64}$/.test(v.Id)&&v.Os==='linux'&&v.Architecture==='amd64','QUALIFICATION_LOCAL_IMAGE_IDENTITY');return {image,id:v.Id,digests:v.RepoDigests??[]};});
 const git={head:run('git',['rev-parse','HEAD']),tree:run('git',['show','-s','--format=%T','HEAD']),parents:run('git',['show','-s','--format=%P','HEAD']).split(' ')};
 need(/^[a-f0-9]{40}$/.test(git.head)&&/^[a-f0-9]{40}$/.test(git.tree),'QUALIFICATION_GIT_IDENTITY');
 const command=[path.join('node_modules','vitest','vitest.mjs'),'run',...tests,'--maxWorkers=1','--no-file-parallelism','--allowOnly=false','--retry=0'];
 console.log('PUBLICATION_NATIVE_INPUTS',JSON.stringify({git,checked,inventory,node:process.version,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,job:process.env.GITHUB_JOB,command,expectedNativeTests:4,managedDatabase:false}));
 const r=spawnSync(process.execPath,command,{cwd:process.cwd(),env,timeout:360000,killSignal:'SIGTERM',stdio:['ignore','inherit','inherit']});
 const left=containers();
 console.log('PUBLICATION_NATIVE_COMPLETION',JSON.stringify({exit:r.status,signal:r.signal,errorCode:r.error?.code??null,remainingOwnedContainers:left?left.split('\n'):[],noRetry:true}));
 need(!r.error&&r.status===0&&!r.signal,'PUBLICATION_NATIVE_TESTS_FAILED_OR_UNCONFIRMED');
 need(left==='','PUBLICATION_NATIVE_OWNED_CLEANUP_UNCONFIRMED');
}
try{main();}catch(e){console.error(String(e?.message??e));process.exitCode=1;}
