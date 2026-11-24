// One credential-free fixed official GET. No install, archive execution or browser.
import assert from 'node:assert/strict';
import {request} from 'node:https';
import {createHash} from 'node:crypto';
import {openSync,closeSync,writeSync,readSync,fstatSync,realpathSync,readFileSync,writeFileSync,existsSync,constants} from 'node:fs';
import {join,dirname,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PACKAGE,PROFILE_SHA256,verifyPackageReceipt} from './verified-chrome158-profile.mjs';
export function validatePackageResponse({status,encoding,length,location}){
 assert(status===200&&!encoding&&!location&&length===String(PACKAGE.bytes),'EXACT_CHROME158_HTTP_RESPONSE');return true;
}
export function verifyOpenPackage(fd){
 const before=fstatSync(fd);assert(before.isFile()&&before.size===PACKAGE.bytes,'CHROME158_PACKAGE_FILE');
 const h=createHash('sha256'),chunk=Buffer.alloc(65536);let bytes=0,n;
 while((n=readSync(fd,chunk,0,chunk.length,null))>0){bytes+=n;assert(bytes<=PACKAGE.bytes,'CHROME158_PACKAGE_BOUND');h.update(chunk.subarray(0,n));}
 const after=fstatSync(fd);for(const key of ['dev','ino','size','mtimeMs','ctimeMs','uid','gid','mode'])assert.equal(after[key],before[key],'CHROME158_PACKAGE_CHANGED');
 const value={bytes,sha256:h.digest('hex')};verifyPackageReceipt(value);return value;
}
export async function acquireChrome158(root){
 assert(process.platform==='linux'&&process.getuid()!==0&&process.env.GITHUB_ACTIONS==='true','ORDINARY_ACTIONS_CHROME158_INTAKE');
 root=realpathSync(root);const temp=realpathSync(process.env.RUNNER_TEMP);
 assert(dirname(root)===temp&&/^xenios-hosted-scenes-inputs-[0-9]+-1$/.test(basename(root)),'OWNED_CHROME158_INPUT_ROOT');
 const path=join(root,'selected-chrome158.deb'),receipt=join(root,'chrome158-package-intake.json');
 assert(!existsSync(path)&&!existsSync(receipt),'NO_CHROME158_RETRY');
 const record={kind:'SINGLE_ROOT_SELECTED_CHROME158_GET',state:'STARTED',package:PACKAGE,profileSha256:PROFILE_SHA256,
  requests:1,redirects:false,credentials:false,installed:false,browserExecuted:false,startedAt:new Date().toISOString()};
 writeFileSync(receipt,JSON.stringify(record)+'\n',{flag:'wx'});
 let fd;
 try{
  fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  const h=createHash('sha256');let bytes=0;
  await new Promise((resolve,reject)=>{
   const req=request(PACKAGE.url,{method:'GET',headers:{Accept:'application/x-debian-package','Accept-Encoding':'identity'},agent:false},async res=>{
    try{
     validatePackageResponse({status:res.statusCode,encoding:res.headers['content-encoding'],length:res.headers['content-length'],location:res.headers.location});
     for await(const chunk of res){bytes+=chunk.length;assert(bytes<=PACKAGE.bytes,'CHROME158_DOWNLOAD_BOUND');h.update(chunk);
      let offset=0;while(offset<chunk.length)offset+=writeSync(fd,chunk,offset,chunk.length-offset);}
     verifyPackageReceipt({bytes,sha256:h.digest('hex')});resolve();
    }catch(error){res.destroy();reject(error);}
   });
   const timer=setTimeout(()=>req.destroy(Error('CHROME158_DOWNLOAD_DEADLINE')),90000);
   req.once('close',()=>clearTimeout(timer));req.once('error',reject);req.end();
  });
  closeSync(fd);fd=undefined;
  const readFd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{record.actual=verifyOpenPackage(readFd);}finally{closeSync(readFd);}
  record.state='EXACT_ROOT_SELECTED_SIGNED_HASH_BOUND_PACKAGE_VERIFIED_NOT_INSTALLED';
  assert(process.env.GITHUB_OUTPUT&&realpathSync(process.env.GITHUB_OUTPUT)===resolve(process.env.GITHUB_OUTPUT),'ACTIONS_OUTPUT');
  writeFileSync(process.env.GITHUB_OUTPUT,'package='+path+'\n',{flag:'a'});
 }catch(error){record.state='FAILED_NO_RETRY_NO_INSTALL';record.failure=/^[A-Z][A-Z0-9_]{1,100}$/.test(String(error.message))?String(error.message):'CHROME158_INTAKE_FAILED';throw Error(record.failure);}
 finally{if(fd!==undefined)closeSync(fd);record.finishedAt=new Date().toISOString();writeFileSync(receipt,JSON.stringify(record,null,2)+'\n');}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert(process.argv.length===3,'EXACT_CHROME158_INTAKE_ARGUMENT');await acquireChrome158(process.argv[2]);
}
