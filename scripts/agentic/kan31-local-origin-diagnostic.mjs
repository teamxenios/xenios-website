// REAL driver and pinned bundle. Loopback synthetic APIs, NOT persistence qualification.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {execFileSync,spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [source,tools,out]=process.argv.slice(2);
if(!source||!tools||!out)throw Error('EXACT_PATH_INPUTS_REQUIRED');
const sha=x=>createHash('sha256').update(x).digest('hex');
const repo=path.resolve(import.meta.dirname,'../..');
const proposal=path.join(repo,'docs/health-launch/ql-build-20261012/doc104-baseline-reconciliation-20261013/mixed-catalog-request-intent-source-proposal/hosted-staging-config-r1/anonymous-browser-r2');
const dist=path.resolve(source,'dist/public');
const appSha='8efa9a9ef4e94773c446e7fa2a17cf00c6592d85',appTree='0c92fdc66b122c5128d3904936c85ba9c912a5cc';
const origin='https://xenios-research-staging.onrender.com';
const report={appSha,appTree,kind:'REAL_DRIVER_LOCAL_BUNDLE_SYNTHETIC_APIS_NOT_QUALIFICATION',
  startedAt:new Date().toISOString(),resource:{availableMiB:os.freemem()/1048576,requiredMiB:2048},
  syntheticApiOnly:true,realApplicationServer:false,stagingContacted:false,status:'NOT_STARTED',
  closure:{independentProcessCensus:false}};
let server,scratch;
const states=new Map();
try {
  if(process.version!=='v20.19.0')throw Error('PINNED_NODE');
  if(report.resource.availableMiB<2048)throw Error('BROWSER_MEMORY_FLOOR');
  if(execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim()!==appSha)throw Error('SOURCE_DRIFT');
  if(execFileSync('git',['status','--porcelain'],{cwd:source,encoding:'utf8'}).trim())throw Error('SOURCE_DIRTY');
  report.runnerSha=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
  if(report.runnerSha!==process.env.GITHUB_SHA)throw Error('RUNNER_SOURCE_DRIFT');
  report.indexSha256=sha(await fs.readFile(path.join(dist,'index.html')));
  const toolchain={acceptanceReference:'OFFLINE_ACCEPTED_TOOLS_ONLY_NOT_RUN_AUTHORITY',playwrightVersion:'1.61.1',
    browserVersion:'149.0.7827.55',browserRevision:'1228',playwrightEntry:'node_modules/playwright/index.mjs',
    playwrightEntrySha256:'a0f5715ea22354f922791a9c53dc012d5d5c067ff9cc4cd35ffb7cd272071a9f',
    playwrightPackageJson:'node_modules/playwright/package.json',
    browserPath:'browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell',
    browserSha256:'670ba079b75107746ba41abad131180a31a7c7219aa1bd4061fb471f4535d541',
    inventorySha256:'7d7a507d0f2280e5efbca9c40f76b733b8c5a5bf8ba32c7b799e28bc1e52be54'};
  const entry=path.resolve(tools,toolchain.playwrightEntry),exe=path.resolve(tools,toolchain.browserPath);
  if(sha(await fs.readFile(entry))!==toolchain.playwrightEntrySha256
    ||sha(await fs.readFile(exe))!==toolchain.browserSha256)throw Error('TOOL_HASH');
  report.toolchain=toolchain;
  server=http.createServer(async(req,res)=>{
    try {
      const u=new URL(req.url,'http://127.0.0.1');
      if(u.pathname.startsWith('/api/')) {
        const id=req.headers['x-offline-context-id'];
        if(!/^[123]$/.test(id??''))throw Error('OFFLINE_CONTEXT_REQUIRED');
        if(!states.has(id))states.set(id,{authenticated:false,accepted:false});
        const state=states.get(id),pair={kind:'early_access_terms',version:'v1'};
        let body={ok:true},status=200,headers={'content-type':'application/json','cache-control':'no-store'};
        if(u.pathname.endsWith('/early-access/session'))body={authenticated:state.authenticated,openAccess:true};
        else if(u.pathname.endsWith('/early-access/unlock')&&req.method==='POST') {
          state.authenticated=true;body={ok:true,expiresAt:new Date(Date.now()+600000).toISOString()};
          headers['set-cookie']='__Host-XeniosPrivateEarlyAccess=offline-context-'+id+'; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=600';
        } else if(u.pathname.endsWith('/early-access/agreements'))body={ok:true,accepted:state.accepted,required:[pair],agreement:pair};
        else if(u.pathname.endsWith('/early-access/agreements/accept')&&req.method==='POST') {
          state.accepted=true;body={ok:true,accepted:true,agreement:pair};
        } else if(u.pathname.endsWith('/policies'))body={policies:{'research-use':{title:'Synthetic offline policy',agreement:pair,
          sections:[{heading:'Offline only',paragraphs:['Fixture only. No legal acceptance is recorded.']}]}}};
        else if(u.pathname.endsWith('/request-intents/config'))body={enabled:true,requiredAgreements:[pair],
          formAcknowledgments:[{id:'local-only',scope:'always',kind:'local-only',version:'v1',copy:'Offline diagnostic only'}]};
        else if(u.pathname.endsWith('/request-intents/catalog'))body={items:[],total:0,
          page:Number(u.searchParams.get('page')??1),pageSize:Number(u.searchParams.get('pageSize')??100)};
        else if(req.method!=='GET') {status=403;body={error:'LOCAL_MUTATION_FORBIDDEN'};}
        res.writeHead(status,headers);res.end(JSON.stringify(body));return;
      }
      if(!['GET','HEAD'].includes(req.method))throw Error('STATIC_METHOD');
      let file=path.resolve(dist,'.'+decodeURIComponent(u.pathname));
      if(!file.startsWith(dist+path.sep))throw Error('STATIC_PATH');
      if(u.pathname==='/research/early-access/order-request')file=path.join(dist,'index.html');
      const bytes=await fs.readFile(file);
      if(u.pathname.startsWith('/assets/'))await new Promise(r=>setTimeout(r,50));
      const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2',
        '.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'}[path.extname(file)]??'application/octet-stream';
      res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(bytes);
    } catch {res.writeHead(404);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const transport='http://127.0.0.1:'+server.address().port;
  scratch=await fs.mkdtemp(path.join(os.tmpdir(),'kan31-real-driver-loopback-'));
  // Only transport is adapted. The actual driver/FIFO/assertions/cleanup are unchanged.
  const adapter=[
    'import {chromium} from '+JSON.stringify(pathToFileURL(entry).href)+';',
    'const launch=chromium.launch.bind(chromium);',
    'chromium.launch=async options=>{',
    "const browser=await launch({...options,proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1'}});",
    'const newContext=browser.newContext.bind(browser);let id=0;',
    'browser.newContext=async options=>{',
    'const context=await newContext(options),contextId=String(++id),route=context.route.bind(context);',
    'context.route=async(pattern,handler)=>route(pattern,real=>{',
    'const request=real.request();',
    'return handler({request:()=>request,abort:(...args)=>real.abort(...args),',
    "continue:()=>{throw Error('OFFLINE_CONTINUE_FORBIDDEN');},fulfill:options=>real.fulfill(options),",
    'fetch:async options=>{const u=new URL(request.url());',
    'if(u.origin!=='+JSON.stringify(origin)+")throw Error('OFFLINE_EGRESS_REFUSED');",
    'return real.fetch({...options,url:'+JSON.stringify(transport)+"+u.pathname+u.search,headers:{...await request.allHeaders(),'x-offline-context-id':contextId}});",
    '}});});return context;};return browser;};'
  ].join('\n');
  const adapterPath=path.join(scratch,'loopback-adapter.mjs');
  await fs.writeFile(adapterPath,adapter);
  const now=Date.now(),provider={appSha,appTree,origin,serviceId:'srv-d9h4f4m7r5hc73ctjng0',
    deployId:'OFFLINE_ONLY_NOT_DEPLOYED',status:'live',providerOnlyBasisAccepted:true,
    authorizationReference:'OFFLINE_SYNTHETIC_NOT_STAGING_AUTHORITY',publicStagingWindowReference:'NO_PUBLIC_WINDOW',
    observedAt:new Date(now).toISOString()};
  const providerRaw=JSON.stringify(provider),address={line1:'1 Synthetic Way',city:'Test City',region:'CA',postalCode:'90001',countryCode:'US'};
  const manifest={appSha,appTree,workflowSourceCommit:report.runnerSha,origin,
    supabaseProject:'tetynodzrtmdbuzgboro',renderService:provider.serviceId,deployId:provider.deployId,
    servedIdentityBasis:'provider-only',providerEvidenceMaxAgeMs:300000,providerProofSha256:sha(providerRaw),
    executionAuthorization:'OFFLINE_SYNTHETIC_NOT_STAGING_AUTHORITY',executableAcceptance:'OFFLINE_REHEARSAL_ONLY',
    expiresAt:new Date(now+120000).toISOString(),fixtureRecipe:'first-requestable-research-2-clinical-3-v1',
    publicBootstrapRequired:true,publicModeWindow:{mode:'time-limited-staging-open-access',startsAt:new Date(now-1000).toISOString(),
      endsAt:new Date(now+120000).toISOString(),maxUnlockPosts:2,maxAgreementPosts:2,
      requiredLegalPairs:[{kind:'early_access_terms',version:'v1'}]},databaseSuccessorReview:'NO_SQL_EXECUTED',
    preStaffSnapshotRequired:true,toolchain,
    limits:{maxRunMs:45000,maxRequests:400,maxPosts:40,maxInflight:8,maxResponseBytes:4194304,maxTotalResponseBytes:134217728,requestTimeoutMs:10000},
    cases:['normal_doubleclick','lost_response_retry','reload_recovery'].map((label,i)=>({label,ownerRole:i===2?'b':'a',
      contact:{fullLegalName:'Synthetic Mixed Qualification',email:['normal@example.invalid','retry@example.invalid','reload@example.invalid'][i],
        mobilePhone:'+12025550123',ageConfirmed:true,shippingAddress:address,billingSameAsShipping:true,billingAddress:address}}))};
  const raw=JSON.stringify(manifest),manifestPath=path.join(scratch,'manifest.json'),providerPath=path.join(scratch,'provider.json');
  await fs.writeFile(manifestPath,raw);await fs.writeFile(providerPath,providerRaw);
  const evidenceDir=path.join(scratch,'evidence');
  const result=await new Promise(resolve=>{
    const child=spawn(process.execPath,['--import',pathToFileURL(adapterPath).href,path.join(proposal,'hosted-browser.UNAPPLIED.mjs'),
      manifestPath,providerPath,evidenceDir,tools],{env:{...process.env,XENIOS_FROZEN_MANIFEST_SHA256:sha(raw),
        XENIOS_VERIFIED_NPM_VERSION:'10.8.2',XENIOS_VERIFIED_TOOL_INVENTORY:toolchain.inventorySha256},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},60000);
    child.stdout.on('data',b=>{if(stdout.length<1048576)stdout+=b;});
    child.stderr.on('data',b=>{if(stderr.length<1048576)stderr+=b;});
    child.on('error',()=>{clearTimeout(timer);resolve({error:true});});
    child.on('close',(exit,signal)=>{clearTimeout(timer);resolve({exit,signal,timedOut,stderrEmpty:stderr.length===0});});
  });
  report.child=result;
  const actual=JSON.parse(await fs.readFile(path.join(evidenceDir,'browser-evidence.json'),'utf8'));
  await fs.copyFile(path.join(evidenceDir,'browser-evidence.json'),path.join(path.dirname(out),'real-driver-browser-evidence.json'));
  report.driverFirstFailure=actual.firstFailure;report.forwarding=actual.forwarding;report.driverCleanup=actual.cleanup;
  report.assetResponses=actual.accounting.filter(r=>r.path?.startsWith('/assets/')&&r.status===200&&r.outcome==='DELIVERED').length;
  report.sessionChecks=actual.sessionChecks.length;
  if(result.exit!==1||result.timedOut||!result.stderrEmpty
    ||actual.firstFailure?.code!=='ACTUAL_RESEARCH_AND_CLINICAL_REQUIRED'
    ||report.assetResponses<24||actual.forwarding?.peakActive>8||actual.forwarding?.peakPending<2
    ||actual.cleanup.activeRequests!==0||actual.cleanup.handlers!==0||actual.cleanup.pendingRequests!==0
    ||!actual.cleanup.contextsClosed||!actual.cleanup.browserCloseResolved)throw Error('REAL_DRIVER_REHEARSAL_FAILED');
  report.status='REAL_DRIVER_BUNDLE_BOOTSTRAP_FIFO_PROVED_EXPECTED_EMPTY_CATALOG_STOP';
} catch(e) {
  report.status='FAILED_OR_BLOCKED';
  report.failure=/^[A-Z0-9_]+$/.test(e.message)?e.message:'LOCAL_REHEARSAL_ERROR';
  process.exitCode=1;
} finally {
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  report.closure.localServerClosed=server?!server.listening:true;
  if(scratch)await fs.rm(scratch,{recursive:true,force:true});
  report.endedAt=new Date().toISOString();
  await fs.writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(report));
}
