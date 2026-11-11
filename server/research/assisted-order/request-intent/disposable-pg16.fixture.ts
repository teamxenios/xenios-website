/** Local optional test transport. Creates its own PG16 cluster; never accepts an existing DB URL. Docker remains canonical CI. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import pg from "pg";

async function freePort():Promise<number>{
 const s=createServer();await new Promise<void>((ok,no)=>{s.once("error",no);s.listen(0,"127.0.0.1",ok);});
 const p=(s.address() as AddressInfo).port;await new Promise<void>((ok,no)=>s.close(e=>e?no(e):ok()));return p;
}
export async function ownedPg16(bin:string,password:string) {
 if(process.env.CI||!isAbsolute(bin))throw Error("Owned-binary rehearsal requires a local absolute PG16 bin; CI uses Docker.");
 const exe=(name:string)=>join(bin,name+(process.platform==="win32"?".exe":""));
 const run=(name:string,args:string[])=>execFileSync(exe(name),args,{encoding:"utf8",timeout:45000,windowsHide:true,stdio:["ignore","pipe","pipe"]});
 if(!/^postgres \(PostgreSQL\) 16\./.test(run("postgres",["--version"])))throw Error("PostgreSQL 16 binaries required.");
 const root=mkdtempSync(join(tmpdir(),"xenios-pg16-"));chmodSync(root,0o700);
 const data=join(root,"data"),log=join(root,"postgres.log"),cred=join(root,"init.pw");let running=false,removed=false;
 const close=()=>{if(removed)return;if(running){run("pg_ctl",["-D",data,"-m","fast","-w","stop"]);running=false;}rmSync(root,{recursive:true,force:true});removed=true;};
 try{
   writeFileSync(cred,password+"\n",{mode:0o600,flag:"wx"});
   run("initdb",["-D",data,"-U","postgres","--pwfile="+cred,"--auth-host=scram-sha-256","--auth-local=scram-sha-256","--no-locale","--encoding=UTF8"]);rmSync(cred);
   const port=await freePort();
   run("pg_ctl",["-D",data,"-w","-l",log,"-o","-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p "+port,"start"]);running=true;
   const c=new pg.Client({host:"127.0.0.1",port,database:"postgres",user:"postgres",password,ssl:false,connectionTimeoutMillis:3000});
   try{await c.connect();const x=await c.query("SELECT current_setting('data_directory') AS dir, current_setting('server_version_num')::int AS version");if(x.rows[0].dir!==data||x.rows[0].version<160000||x.rows[0].version>=170000)throw Error("Unexpected local test server");await c.query("CREATE DATABASE request_intent_disposable");}
   finally{await c.end()}
   return {port,close};
 }catch(e){close();throw e}
}
