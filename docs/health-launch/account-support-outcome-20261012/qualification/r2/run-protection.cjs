const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root='C:/Users/sboad/.codex/worktrees/support-qualification-20261012/xenios-website';
const scratch='C:/Users/sboad/.codex/tmp/support-protection-r2-20261012';
const node='C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe';
const base='79414143d4355d5d3d14cd5fe6e5a536dc68d99d',sha='f4358b521fc89551e31ce40bb040a5ffbacd8050';
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(process.version!=='v20.19.0'||process.execPath.toLowerCase()!==path.resolve(node).toLowerCase())throw Error('PinnedNode required');
for(const [p,h] of Object.entries({[node]:'6e3a39787e667d50487f7335c85636c2823a53e636d73c2c841d45da4e57906c',[root+'/scripts/acceptance/verify-core-site-protection.mjs']:'019b2dac87dbc8d2ec37cb4ccf881628c512bcaeda95defc922dbf119bb09b07',[root+'/docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json']:'4fb73d7cfac6fcf653a657f771e534a33319e13616f845ea7d34ef1a6afcb4c1'}))if(digest(p)!==h)throw Error('Pin mismatch');
for(const name of ['run.log','receipt.json'])if(fs.existsSync(path.join(scratch,name)))throw Error('No overwrite/retry');
const env={SYSTEMROOT:'C:\\Windows',WINDIR:'C:\\Windows',PATH:'C:\\Users\\sboad\\.codex\\toolchains\\node-v20.19.0-win-x64;C:\\Program Files\\Git\\cmd;C:\\Windows\\System32;C:\\Windows',PATHEXT:'.COM;.EXE;.BAT;.CMD',HOME:scratch,USERPROFILE:scratch,TEMP:scratch,TMP:scratch,NODE_OPTIONS:'--max-old-space-size=256',NO_COLOR:'1'};
const git=(...args)=>cp.execFileSync('C:/Program Files/Git/cmd/git.exe',args,{cwd:root,env,encoding:'utf8',timeout:5000}).trim();
if(git('rev-parse','HEAD')!==sha||git('status','--porcelain=v2','--untracked-files=all'))throw Error('Frozen clean support required');
const args=['scripts/acceptance/verify-core-site-protection.mjs',base,sha];
const receipt={action:'SUPPORT_EXACT_PROTECTION_CLI_20261012',candidate:sha,tree:git('rev-parse','HEAD^{tree}'),base,command:[node,...args],cwd:root,node:process.version,npm:'NOT_INVOKED',startedUtc:new Date().toISOString(),timeoutMs:60000,attempts:1,retries:0,scope:'Existing builtins-only protection CLI; reads own candidate manifest/protected files and Git diff, no app imports/install/network/DB/server.',exitCode:null,timedOut:false};
let output='';
try{output=cp.execFileSync(node,args,{cwd:root,env,encoding:'utf8',timeout:60000,maxBuffer:1048576,windowsHide:true});receipt.exitCode=0;}
catch(e){output=String(e.stdout||'')+String(e.stderr||'');receipt.exitCode=e.status;receipt.signal=e.signal;receipt.errorCode=e.code||null;receipt.timedOut=e.code==='ETIMEDOUT';}
receipt.endedUtc=new Date().toISOString();receipt.postHead=git('rev-parse','HEAD');receipt.postStatus=git('status','--porcelain=v2','--untracked-files=all');
fs.writeFileSync(path.join(scratch,'run.log'),output,{flag:'wx'});
receipt.logSha256=digest(path.join(scratch,'run.log'));
fs.writeFileSync(path.join(scratch,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
process.stdout.write(output+'\n'+JSON.stringify(receipt,null,2)+'\n');process.exitCode=receipt.timedOut?124:receipt.exitCode??1;
