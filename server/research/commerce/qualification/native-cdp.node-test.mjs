import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
// Adapted from the hash-verified native-finish package; executes integrated source, not package copies.
const {test}=require('node:test');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const {mkdtemp,rm}=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {CdpPipe}=await import('./qualification-browser.ts');
test('real Chromium pipe dispatches trusted input on an about:blank synthetic document',{timeout:15000},async()=>{
 const d=await mkdtemp(path.join(os.tmpdir(),'qa-cdp-local-'));let c,pipe;
 try{c=spawn(process.env.XENIOS_TEST_CHROME_PATH||'/usr/bin/chromium',['--headless=new','--remote-debugging-pipe',`--user-data-dir=${d}`,'--disable-dev-shm-usage','--disable-background-networking','--no-first-run','about:blank'],{stdio:['ignore','ignore','ignore','pipe','pipe']});pipe=new CdpPipe(c.stdio[3],c.stdio[4]);c.once('exit',()=>pipe.close());
 const target=await pipe.send('Target.createTarget',{url:'about:blank'});const {sessionId}=await pipe.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});await pipe.send('Page.enable',{},sessionId);await pipe.send('Runtime.enable',{},sessionId);
 const {frameTree}=await pipe.send('Page.getFrameTree',{},sessionId);
 // No URL navigation, network request or policy change: this is just synthetic DOM content.
 await pipe.send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:'<button id="complete">Complete</button><script>window.trusted=null;document.querySelector("button").onclick=e=>window.trusted=e.isTrusted;</script>'},sessionId);
 await pipe.send('Page.bringToFront',{},sessionId);
 await pipe.send('Runtime.evaluate',{expression:'document.querySelector("button").focus()'},sessionId);
 await new Promise(r=>setTimeout(r,100));
 await pipe.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
 await pipe.send('Input.dispatchKeyEvent',{type:'char',text:'\r',unmodifiedText:'\r',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
 await pipe.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
 await new Promise(r=>setTimeout(r,100));const r=await pipe.send('Runtime.evaluate',{expression:'window.trusted',returnByValue:true},sessionId);assert.equal(r.result.value,true);
 }finally{if(pipe){await pipe.send('Browser.close',{},undefined,1000).catch(()=>{});pipe.close()}if(c&&c.exitCode===null){await new Promise(r=>{const t=setTimeout(()=>{c.kill('SIGKILL');r()},2000);c.once('exit',()=>{clearTimeout(t);r()});c.kill('SIGTERM')})}await rm(d,{recursive:true,force:true,maxRetries:3,retryDelay:100})}
});
