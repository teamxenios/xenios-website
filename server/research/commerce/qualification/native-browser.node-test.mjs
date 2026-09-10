import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
// Adapted from the hash-verified native-finish package; executes integrated source, not package copies.
const {driveStripeNoChallenge}=await import('./qualification-browser.ts');
const {test}=require('node:test');const assert=require('node:assert/strict');const {createServer}=require('node:http');const {driveStripeChallenge,browserUrlAllowed}=await import('./qualification-browser.ts');
const start=s=>new Promise(r=>s.listen(0,'127.0.0.1',r));const stop=s=>new Promise(r=>{s.closeAllConnections();s.close(r)});
test('real Chromium completes frictionless authentication without challenge input',{timeout:15000,skip:process.env.XENIOS_BROWSER_NAVIGATION_TESTS!=='1'},async()=>{
  const app=createServer((_q,r)=>{r.setHeader('Content-Type','text/html');r.end('<script>window.Stripe=()=>({handleNextAction:async()=>({paymentIntent:{status:"requires_capture"}})})</script>');});
  await start(app);
  try {
    const result=await driveStripeNoChallenge({chromePath:process.env.XENIOS_TEST_CHROME_PATH,appOrigin:`http://127.0.0.1:${app.address().port}`,approvedOrigins:[],publishableKey:'pk_test_abcdefgh',clientSecret:'pi_Test123_secret_abcdef',timeoutMs:6000});
    assert.equal(result.challengeObserved,false);assert.equal(result.trustedInputEvents,0);
  } finally {await stop(app)}
});
test('frictionless scenario refuses a challenge before sending input',{timeout:15000,skip:process.env.XENIOS_BROWSER_NAVIGATION_TESTS!=='1'},async()=>{
  let clicked=false;
  const app=createServer((q,r)=>{r.setHeader('Content-Type','text/html');if(q.url==='/clicked'){clicked=true;r.end('ok');return;}r.end('<button id="test-source-authorize-3ds" onclick="fetch(\'/clicked\')">Challenge</button><script>window.Stripe=()=>({handleNextAction:()=>new Promise(()=>{})})</script>');});
  await start(app);
  try {
    await assert.rejects(driveStripeNoChallenge({chromePath:process.env.XENIOS_TEST_CHROME_PATH,appOrigin:`http://127.0.0.1:${app.address().port}`,approvedOrigins:[],publishableKey:'pk_test_abcdefgh',clientSecret:'pi_Test123_secret_abcdef',timeoutMs:6000}),e=>e.code==='unexpected_authentication_challenge');
    assert.equal(clicked,false);
  } finally {await stop(app)}
});
test('browser request allowlist uses exact origins',()=>{const a=new Set(['https://js.stripe.com','http://127.0.0.1:1234']);assert.equal(browserUrlAllowed('https://js.stripe.com/v3/',a),true);for(const s of ['https://js.stripe.com.evil.example','https://u:secret@js.stripe.com/v3','http://127.0.0.1:1235/','file:///tmp/secrets'])assert.equal(browserUrlAllowed(s,a),false);});
test('real Chromium enters a local synthetic iframe challenge with trusted input and blocked egress',{timeout:20000,skip:process.env.XENIOS_BROWSER_NAVIGATION_TESTS!=='1'},async()=>{
  let trusted=false,forbidden=0;const outside=createServer((_q,r)=>{forbidden++;r.end('not allowed')});await start(outside);const outsideOrigin=`http://127.0.0.1:${outside.address().port}`;
  const app=createServer((q,r)=>{r.setHeader('Content-Type','text/html');if(q.url==='/api/__qualification/auth'){r.end(`<script>window.Stripe=()=>({handleNextAction:()=>new Promise(resolve=>{window.finish=value=>{fetch('/trusted?value='+value).then(()=>resolve({paymentIntent:{status:'requires_capture'}}))};const frame=document.createElement('iframe');frame.src='/challenge';document.body.appendChild(frame);fetch('${outsideOrigin}/blocked').catch(()=>{})})});</script><body>Local fixture</body>`);}else if(q.url==='/challenge'){r.end(`<button id="test-source-authorize-3ds">Complete synthetic challenge</button><script>document.querySelector('button').onclick=e=>parent.finish(e.isTrusted)</script>`);}else if(q.url.startsWith('/trusted')){trusted=q.url.includes('true');r.end('ok');}else{r.end('');}});await start(app);const appOrigin=`http://127.0.0.1:${app.address().port}`;
  try{const result=await driveStripeChallenge({chromePath:(process.env.XENIOS_TEST_CHROME_PATH||'/usr/bin/chromium'),appOrigin,approvedOrigins:[],publishableKey:'pk_test_abcdefgh',clientSecret:'pi_Test123_secret_abcdef',timeoutMs:10000});assert.equal(result.challengeObserved,true);assert.ok(result.trustedInputEvents>=2);assert.equal(trusted,true);assert.equal(forbidden,0);assert.ok(result.blockedOrigins.includes(outsideOrigin));}finally{await stop(app);await stop(outside)}
});
test('automatic authentication cannot pretend to be a challenge',{timeout:15000,skip:process.env.XENIOS_BROWSER_NAVIGATION_TESTS!=='1'},async()=>{const s=createServer((_q,r)=>{r.setHeader('Content-Type','text/html');r.end(`<script>window.Stripe=()=>({handleNextAction:async()=>({paymentIntent:{status:'requires_capture'}})})</script>`)});await start(s);try{await assert.rejects(driveStripeChallenge({chromePath:(process.env.XENIOS_TEST_CHROME_PATH||'/usr/bin/chromium'),appOrigin:`http://127.0.0.1:${s.address().port}`,approvedOrigins:[],publishableKey:'pk_test_abcdefgh',clientSecret:'pi_Test123_secret_abcdef',timeoutMs:6000}),e=>e.code==='authentication_completed_without_observed_challenge');}finally{await stop(s)}});
