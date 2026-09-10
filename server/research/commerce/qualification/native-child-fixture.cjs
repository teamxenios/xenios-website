// Local infrastructure test only. Disk counter demonstrates a real PID restart, not a managed database.
const {createServer}=require('node:http');const fs=require('node:fs');const crypto=require('node:crypto');
process.once('message',async m=>{if(process.env.FIXTURE_MODE==='exit'){process.exit(3);return;}if(process.env.FIXTURE_MODE==='hang'){setInterval(()=>{},100);return;}
 const counterPath=process.env.FIXTURE_COUNTER;const count=fs.existsSync(counterPath)?Number(fs.readFileSync(counterPath,'utf8'))+1:1;fs.writeFileSync(counterPath,String(count));
 const servers=[];const serve=p=>new Promise(r=>{const s=createServer((_q,res)=>res.end('{}'));s.listen(p,'127.0.0.1',()=>{servers.push(s);r(`http://127.0.0.1:${s.address().port}`)})});
 const appOrigin=await serve(m.appPort),controlOrigin=await serve(m.controlPort);const shut=()=>{for(const s of servers){s.closeAllConnections();s.close()}process.exit(0)};process.once('SIGTERM',shut);process.once('disconnect',shut);
 process.send({type:'qualification-ready',runId:m.runId,projectRef:m.projectRef,sourceSha:process.env.FIXTURE_MODE==='mismatch'?'b'.repeat(40):m.sourceSha,mode:'test',pid:process.pid,bootId:crypto.randomUUID(),appOrigin,controlOrigin});});
