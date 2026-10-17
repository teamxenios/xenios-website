// Local dependency observation ONLY. Real exact8efa production client;
// synthetic API responses, no database/server application or submission.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [source,tools,out]=process.argv.slice(2);
if(!source||!tools||!out)throw Error('EXACT_PATH_INPUTS_REQUIRED');
const core=path.resolve(tools,'node_modules/playwright');
const exe=path.resolve(tools,'browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell');
const helper=path.resolve(import.meta.dirname,'../../docs/health-launch/ql-build-20261012/doc104-baseline-reconciliation-20261013/mixed-catalog-request-intent-source-proposal/hosted-staging-config-r1/anonymous-browser-r2/route-boundary.mjs');
const {guardedRoute,trackedRoute,sanitizedOrigin}=await import(pathToFileURL(helper).href);
const dist=path.resolve(source,'dist/public');
const proof={appSha:'8efa9a9ef4e94773c446e7fa2a17cf00c6592d85',kind:'LOCAL_STATIC_DEPENDENCY_OBSERVATION_SYNTHETIC_API_NOT_QUALIFICATION',
  startedAt:new Date().toISOString(),resource:{availableMiB:os.freemem()/1048576,requiredMiB:2048},
  requests:[],firstFailure:null,externalOrigins:[],syntheticApiOnly:true,serverApplicationStarted:false,
  status:'NOT_STARTED',browserStarted:false,applicationModified:false,closure:{}};
let server,browser,context,timer,authenticated=false;
const tasks=new Set();
const fail=(code,info={})=>{proof.firstFailure??={code,...(info.url?{origin:sanitizedOrigin(info.url)}:{})};};
try {
  if(process.version!=='v20.19.0')throw Error('PINNED_NODE');
  if(proof.resource.availableMiB<2048)throw Error('BROWSER_MEMORY_FLOOR');
  const sha=execFileSync('git',['-c','core.longpaths=true','rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
  if(sha!==proof.appSha)throw Error('SOURCE_DRIFT');
  if(execFileSync('git',['-c','core.longpaths=true','status','--porcelain'],{cwd:source,encoding:'utf8'}).trim())throw Error('SOURCE_DIRTY');
  const pkg=JSON.parse(await fs.readFile(path.join(core,'package.json'),'utf8'));
  if(pkg.version!=='1.61.1')throw Error('PLAYWRIGHT_VERSION');
  proof.playwrightVersion=pkg.version;
  proof.browserSha256=createHash('sha256').update(await fs.readFile(exe)).digest('hex');
  if(proof.browserSha256!=='670ba079b75107746ba41abad131180a31a7c7219aa1bd4061fb471f4535d541')throw Error('BROWSER_HASH');
  proof.runnerSha=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(import.meta.dirname,'../..'),encoding:'utf8'}).trim();
  if(proof.runnerSha!==process.env.GITHUB_SHA)throw Error('RUNNER_SOURCE_DRIFT');
  proof.indexSha256=createHash('sha256').update(await fs.readFile(path.join(dist,'index.html'))).digest('hex');
  server=http.createServer(async(req,res)=>{
    try {
      if(!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
      const u=new URL(req.url,'http://127.0.0.1'),relative=decodeURIComponent(u.pathname);
      let file=path.resolve(dist,'.'+relative);
      if(!file.startsWith(dist+path.sep))throw Error('STATIC_PATH');
      if(relative==='/research/early-access/order-request')file=path.join(dist,'index.html');
      const bytes=await fs.readFile(file);
      const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'}[path.extname(file)]??'application/octet-stream';
      res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(bytes);
    } catch {res.writeHead(404);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;proof.origin=origin;
  const {chromium}=await import(pathToFileURL(path.join(core,'index.mjs')).href);
  browser=await chromium.launch({headless:true,executablePath:exe,
    proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1'}});
  proof.browserStarted=true;proof.browserVersion=browser.version();
  if(browser.version()!=='149.0.7827.55')throw Error('BROWSER_VERSION');
  context=await browser.newContext({serviceWorkers:'block'});
  timer=setTimeout(()=>{fail('LOCAL_DEADLINE');void browser.close().catch(()=>{});},30000);
  await context.route('**/*',r=>trackedRoute(guardedRoute(r,{
    targetOrigin:origin,isFailed:()=>proof.firstFailure!==null,onFailure:(code,info)=>{
      fail(code,info);
      if(info?.url)proof.externalOrigins.push(sanitizedOrigin(info.url));
    },onAllowed:async(route,request,u)=>{
      if(proof.requests.length>=150)throw Error('REQUEST_LIMIT');
      proof.requests.push({method:request.method(),path:u.pathname});
      if(!u.pathname.startsWith('/api/')) {await route.continue();return;}
      // Every API is fulfilled here, never forwarded. No real session or data.
      const pair={kind:'early_access_terms',version:'v1'};
      let body={ok:true},status=200;
      if(u.pathname.endsWith('/early-access/session'))body={authenticated,openAccess:true};
      else if(u.pathname.endsWith('/early-access/unlock')) {authenticated=true;body={ok:true,expiresAt:new Date(Date.now()+600000).toISOString()};}
      else if(u.pathname.endsWith('/early-access/agreements'))body={ok:true,accepted:true,required:[pair]};
      else if(u.pathname.includes('/policies'))body={policies:{'research-use':{title:'Synthetic local policy',agreement:pair,
        sections:[{heading:'Offline only',paragraphs:['Synthetic API fixture, not legal acceptance.']}]}}};
      else if(u.pathname.endsWith('/request-intents/config'))body={enabled:true,requiredAgreements:[pair],
        formAcknowledgments:[{id:'local-only',scope:'always',kind:'local-only',version:'v1',copy:'Synthetic local diagnostic only'}]};
      else if(u.pathname.endsWith('/request-intents/catalog'))body={items:[],total:0,page:1,pageSize:100};
      else if(request.method()!=='GET') {status=403;body={error:'LOCAL_MUTATION_FORBIDDEN'};}
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    }
  }),tasks,fail));
  const page=await context.newPage();
  page.on('pageerror',()=>fail('LOCAL_PAGE_ERROR'));
  try {await page.goto(origin+'/research/early-access/order-request',{waitUntil:'networkidle',timeout:15000});}
  catch {if(!proof.firstFailure)fail('LOCAL_NAVIGATION_FAILED');}
  await page.waitForTimeout(1500);
  proof.quickOrderHeading=await page.getByRole('heading',{name:'Quick Order',exact:true}).count();
  proof.status=proof.firstFailure?'FAILED_WITH_FIRST_CAUSE':'NO_OFF_ORIGIN_REPRODUCED_IN_LOCAL_STUBBED_BOOTSTRAP';
} catch(e) {
  fail(/^[A-Z0-9_]+$/.test(e.message)?e.message:'LOCAL_DIAGNOSTIC_ERROR');
  proof.status='BLOCKED_OR_FAILED';
} finally {
  clearTimeout(timer);
  try {await context?.close();proof.closure.contextClosed=true;}catch {proof.closure.contextClosed=false;}
  try {await browser?.close();proof.closure.browserClosed=true;}catch {proof.closure.browserClosed=false;}
  await Promise.allSettled([...tasks]);
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  proof.closure.localServerClosed=server?!server.listening:true;
  proof.closure.handlers=tasks.size;proof.closure.independentProcessCensus=false;
  proof.endedAt=new Date().toISOString();
  await fs.writeFile(out,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(proof));
  if(proof.firstFailure)process.exitCode=1;
}
