// PRIVATE AUTHORED_UNRUN. One fresh/instrumented physical primitive, never a publisher entry point.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const SELF=fileURLToPath(import.meta.url),REPO=fileURLToPath(new URL('../../../',import.meta.url));
const PREFIX='scripts/qualification/corpus-physical-focus-owned/';
const INPUTS=[PREFIX+'capture-physical-focus.mjs',PREFIX+'physical-focus.schema.json',PREFIX+'capture-physical-focus.node-test.mjs'];
const WORKFLOW='.github/workflows/corpus-physical-resolution-owned.yml';
const BRANCH='refs/heads/codex/ea-corpus-physical-resolution-owned-20261121';
const BASE='15f470bb708d27630c175b36c3fd2de721553e9e',BASE_TREE='a4f4959c543f09536ebcb9e02595317904ec9d6d';
const SCHEMA_SHA='6c6ed16995fdd3552bb5680f2e7605932aecbc57a628f6176c831e7dd84734de';
const PUBLISHER_SHA='8e6d0527fe14b5717fd4ee11c2d6bc670ad0708275a2bbae170398bcc65889c5';
const PRIMITIVE_SHA='0c7bbe165125e3a1b0a257c491aa0f5e36d3441dfd5d07fbdf42e5ae976c2b6d';
const OID=/^[a-f0-9]{40}$/,HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const ENV_KEYS=['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','PATHEXT','ComSpec','TEMP','TMP','TMPDIR','LANG','LC_ALL'];
const STAGES=['ENTRY','RUNTIME_BEFORE','RUNTIME_AFTER','RUNTIME_THROW','READ_BEFORE','READ_AFTER','JSON_BEFORE','RESOLVE_BEFORE','RESOLVE_AFTER','RESOLVE_THROW','COMMAND_META_AFTER','INVOKE_BEFORE','INVOKE_AFTER','INVOKE_THROW','JSON_AFTER','PATH_BEFORE','PATH_AFTER','DRIVE_BEFORE','DRIVE_AFTER','ATTR_BEFORE','ATTR_AFTER','PARENT_BEFORE','PARENT_AFTER','WRITE_BEFORE','DONE','LIMIT'];
const META_KEYS=['PS_VERSION','PS_EDITION','CLR_VERSION','EXE_NAME','EXE_CLASS','EXE_VERSION','EXE_PATH_SHA256','NATIVE_PID','START_TICKS','INPUT_WEBNAME','INPUT_CODEPAGE','OUTPUT_WEBNAME','OUTPUT_CODEPAGE','PIPELINE_WEBNAME','PIPELINE_CODEPAGE','AUTOLOAD_MODE','MODULE_PATH_PRESENT','MODULE_PATH_ENTRIES','COMMAND_NAME','COMMAND_MODULE','COMMAND_VERSION','COMMAND_TYPE','ERROR_TYPE','ERROR_HRESULT'];
export const CONTROL_NAMES=[
 'instrumentation inverse restores the exact frozen primitive and leaves its predicates intact',
 'closed stage parser retains only known tags and opaque bounded ordinals',
 'arbitrary secret-like stderr is counted without being retained',
 'malformed or excessive stage records cannot masquerade as complete diagnostics',
 'native transport projection omits accessors and arbitrary error payloads',
 'hosted worker environment uses only the original closed recipe',
 'preexisting foreign output remains untouched after exclusive creation refusal',
 'cloned or replaced output ownership cannot authorize report writes'
];
const OWNED=new WeakSet(),OUTPUT_NAMES=new Set(['source-guard.json','pure-control-events.json','sample-result.json','qualification-report.json']);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fail(code){throw Object.assign(new Error(code),{code});}
function need(value,code){if(!value)fail(code);}
function exactKeys(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');}
function data(object,key){try{const d=object&&typeof object==='object'?Object.getOwnPropertyDescriptor(object,key):null;return d&&Object.hasOwn(d,'value')?{present:true,value:d.value}:{present:false};}catch{return {present:false};}}
function safeCode(value){return typeof value==='string'&&new Set(['ETIMEDOUT','ENOENT','EACCES','EPERM','EINVAL','EPIPE','ENOBUFS','ERR_CHILD_PROCESS_STDIO_MAXBUFFER','FOCUS_GIT_REFUSED','FOCUS_DEADLINE','FOCUS_REFUSED']).has(value)?value:null;}
function safeSignal(value){return ['SIGTERM','SIGKILL','SIGINT'].includes(value)?value:null;}
function budget(ms){const end=performance.now()+ms;return {check(reserve=0){need(performance.now()+reserve<end,'FOCUS_DEADLINE');}};}
function physical(file){let current=file,n=0;for(;;){need(++n<=64,'FOCUS_REFUSED');const s=fs.lstatSync(current);need(!s.isSymbolicLink(),'FOCUS_REFUSED');need(fs.realpathSync.native(current).toLowerCase()===path.resolve(current).toLowerCase(),'FOCUS_REFUSED');const next=path.dirname(current);if(next===current)break;current=next;}return file;}
function readBounded(file,limit=1048576){const s=fs.lstatSync(file);need(s.isFile()&&!s.isSymbolicLink()&&s.size<=limit,'FOCUS_REFUSED');const raw=fs.readFileSync(file);need(raw.length===s.size,'FOCUS_REFUSED');return raw;}

export function makeEnvironment(input,fixtureRoot){
 const out={};for(const key of ENV_KEYS)if(typeof input[key]==='string')out[key]=input[key];
 return Object.assign(out,{NODE_OPTIONS:'',NODE_PATH:'',GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0',GIT_ALLOW_PROTOCOL:'file',RUNNER_TEMP:fixtureRoot,XR_PUBLICATION_SOURCE:BASE});
}
export function extractPrimitive(raw){
 need(Buffer.isBuffer(raw)&&sha(raw)===PUBLISHER_SHA,'FOCUS_REFUSED');
 const match=/const REPARSE_SCRIPT = (\[[\s\S]*?\])\.join\(';\'\);/.exec(raw.toString('utf8'));
 need(match,'FOCUS_REFUSED');const parts=JSON.parse(match[1]);
 need(parts.length===11&&parts.every(x=>typeof x==='string'&&Buffer.byteLength(x)<=4096),'FOCUS_REFUSED');
 need(sha(Buffer.from(parts.join(';')))===PRIMITIVE_SHA,'FOCUS_REFUSED');return parts;
}
export function instrumentPrimitive(parts){
 need(Array.isArray(parts)&&parts.length===11&&sha(Buffer.from(parts.join(';')))===PRIMITIVE_SHA,'FOCUS_REFUSED');
 const after=[...parts];
 const emitter="$script:XRStageCount=0;$script:XRStageLimited=$false;$xrPath=-1;$xrDepth=-1;function XRStage([string]$tag,[int]$p=-1,[int]$d=-1){if($script:XRStageLimited){return};if($script:XRStageCount -ge 256 -or $p -gt 5 -or $d -gt 64){$script:XRStageLimited=$true;try{[Console]::Error.WriteLine('XR_PHYSICAL_STAGE LIMIT -1 -1')}catch{};return};[void]($script:XRStageCount++);try{[Console]::Error.WriteLine('XR_PHYSICAL_STAGE '+$tag+' '+$p+' '+$d)}catch{}}";
 // No Utility-module cmdlet is used to collect this closed runtime metadata.
 const runtimeParts = [
  "function XRMeta([string]$k,[string]$v){if($v.Length -gt 256){return};try{[Console]::Error.WriteLine('XR_PHYSICAL_META '+$k+' '+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($v)))}catch{}}",
  "XRStage 'RUNTIME_BEFORE'",
  "try{$xrProcess=[Diagnostics.Process]::GetCurrentProcess();$xrExe=$xrProcess.MainModule.FileName;$xrFileVersion=$xrProcess.MainModule.FileVersionInfo",
  "XRMeta 'PS_VERSION' ($PSVersionTable.PSVersion.ToString());XRMeta 'PS_EDITION' ([string]$PSVersionTable.PSEdition);XRMeta 'CLR_VERSION' ([Environment]::Version.ToString())",
  "XRMeta 'EXE_NAME' ([IO.Path]::GetFileName($xrExe).ToLowerInvariant());$xrExeExpected=[IO.Path]::Combine([Environment]::SystemDirectory,'WindowsPowerShell','v1.0','powershell.exe');$xrExeClass='OTHER_LOCATION';if([string]::Equals($xrExe,$xrExeExpected,[StringComparison]::OrdinalIgnoreCase)){$xrExeClass='SYSTEM32_WINDOWS_POWERSHELL'};XRMeta 'EXE_CLASS' $xrExeClass",
  "XRMeta 'EXE_VERSION' ([string]::Join('.',@($xrFileVersion.FileMajorPart,$xrFileVersion.FileMinorPart,$xrFileVersion.FileBuildPart,$xrFileVersion.FilePrivatePart)));$xrHasher=[Security.Cryptography.SHA256]::Create();try{$xrPathHash=$xrHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($xrExe));$xrHex='';foreach($xrByte in $xrPathHash){$xrHex+=$xrByte.ToString('x2')};XRMeta 'EXE_PATH_SHA256' $xrHex}finally{$xrHasher.Dispose()}",
  "XRMeta 'NATIVE_PID' ($xrProcess.Id.ToString([Globalization.CultureInfo]::InvariantCulture));XRMeta 'START_TICKS' ($xrProcess.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture))",
  "XRMeta 'INPUT_WEBNAME' ([Console]::InputEncoding.WebName);XRMeta 'INPUT_CODEPAGE' ([string][Console]::InputEncoding.CodePage);XRMeta 'OUTPUT_WEBNAME' ([Console]::OutputEncoding.WebName);XRMeta 'OUTPUT_CODEPAGE' ([string][Console]::OutputEncoding.CodePage)",
  "if($null -eq $OutputEncoding){XRMeta 'PIPELINE_WEBNAME' 'UNSET';XRMeta 'PIPELINE_CODEPAGE' 'UNSET'}else{XRMeta 'PIPELINE_WEBNAME' $OutputEncoding.WebName;XRMeta 'PIPELINE_CODEPAGE' ([string]$OutputEncoding.CodePage)}",
  "$xrAutoload='DEFAULT_UNSET';if($null -ne $PSModuleAutoLoadingPreference){$xrAutoload=[string]$PSModuleAutoLoadingPreference};XRMeta 'AUTOLOAD_MODE' $xrAutoload;$xrModulePath=[Environment]::GetEnvironmentVariable('PSModulePath');if([string]::IsNullOrEmpty($xrModulePath)){XRMeta 'MODULE_PATH_PRESENT' '0';XRMeta 'MODULE_PATH_ENTRIES' '0'}else{XRMeta 'MODULE_PATH_PRESENT' '1';XRMeta 'MODULE_PATH_ENTRIES' ([string]$xrModulePath.Split(';').Length)}",
  "XRStage 'RUNTIME_AFTER'}catch{XRMeta 'ERROR_TYPE' ($_.Exception.GetType().FullName);XRMeta 'ERROR_HRESULT' ([string]$_.Exception.HResult);XRStage 'RUNTIME_THROW';throw}"
 ];
 after[0]+=';'+emitter+";XRStage 'ENTRY';"+runtimeParts.join(';');
 // Resolve ONCE, then invoke that CommandInfo ONCE. No warmup or second
 // named conversion is run; this intentionally exposes two outer boundaries.
 after[1]="XRStage 'READ_BEFORE';$xrRaw=[Console]::In.ReadToEnd();XRStage 'READ_AFTER';XRStage 'JSON_BEFORE';$xrPhase='RESOLVE_THROW';XRStage 'RESOLVE_BEFORE';try{$xrCommands=@(Get-Command -Name ConvertFrom-Json -CommandType Cmdlet -ErrorAction Stop);if($xrCommands.Count -ne 1){throw 'command_count'};$xrCommand=$xrCommands[0];XRStage 'RESOLVE_AFTER';XRMeta 'COMMAND_NAME' $xrCommand.Name;XRMeta 'COMMAND_MODULE' $xrCommand.ModuleName;XRMeta 'COMMAND_VERSION' ($xrCommand.Version.ToString());XRMeta 'COMMAND_TYPE' $xrCommand.ImplementingType.FullName;XRStage 'COMMAND_META_AFTER';$xrPhase='INVOKE_THROW';XRStage 'INVOKE_BEFORE';$items=@(($xrRaw | & $xrCommand));XRStage 'INVOKE_AFTER'}catch{XRMeta 'ERROR_TYPE' ($_.Exception.GetType().FullName);XRMeta 'ERROR_HRESULT' ([string]$_.Exception.HResult);XRStage $xrPhase;throw};XRStage 'JSON_AFTER'";
 after[5]=after[5].replace('foreach($item in $items){$q=',"foreach($item in $items){[void]($xrPath++);$xrDepth=0;XRStage 'PATH_BEFORE' $xrPath $xrDepth;$q=")
  .replace(';while($q){',";XRStage 'PATH_AFTER' $xrPath $xrDepth;while($q){");
 after[6]=after[6].replace('{$drive=',"{XRStage 'DRIVE_BEFORE' $xrPath $xrDepth;$drive=")
  .replace("{throw 'filesystem'}}","{throw 'filesystem'};XRStage 'DRIVE_AFTER' $xrPath $xrDepth}");
 after[7]="$xrFresh=-not $seen.Contains($q);if($xrFresh){XRStage 'ATTR_BEFORE' $xrPath $xrDepth};"+after[7];
 after[8]+=";if($xrFresh){XRStage 'ATTR_AFTER' $xrPath $xrDepth}";
 after[9]="if($xrFresh){XRStage 'PARENT_BEFORE' $xrPath $xrDepth};"+after[9]
  .replace(';if($n -eq $q)',";if($xrFresh){XRStage 'PARENT_AFTER' $xrPath $xrDepth};if($n -eq $q)")
  .replace('$q=$n}}','$q=$n;[void]($xrDepth++)}}');
 after[10]="XRStage 'WRITE_BEFORE';"+after[10]+";XRStage 'DONE'";
 const edits=[];let beforeStart=0,afterStart=0;
 for(let i=0;i<parts.length;i++){if(parts[i]!==after[i])edits.push({beforeStart,afterStart,before:parts[i],after:after[i]});beforeStart+=parts[i].length+1;afterStart+=after[i].length+1;}
 const script=after.join(';');need(edits.length===8&&restorePrimitive(script,edits)===parts.join(';'),'FOCUS_REFUSED');
 return {script,edits,originalSha256:PRIMITIVE_SHA,instrumentedSha256:sha(Buffer.from(script)),inverseVerified:true};
}
export function restorePrimitive(script,edits){
 let value=script;for(const edit of [...edits].reverse()){need(value.slice(edit.afterStart,edit.afterStart+edit.after.length)===edit.after,'FOCUS_REFUSED');value=value.slice(0,edit.afterStart)+edit.before+value.slice(edit.afterStart+edit.after.length);}return value;
}
export function parseStages(raw){
 need(Buffer.isBuffer(raw)&&raw.length<=64000,'FOCUS_REFUSED');
 const records=[],problems=new Set();let otherLines=0,prefixedLines=0;
 const singleton=['ENTRY','RUNTIME_BEFORE','RUNTIME_AFTER','READ_BEFORE','READ_AFTER','JSON_BEFORE','RESOLVE_BEFORE','RESOLVE_AFTER','COMMAND_META_AFTER','INVOKE_BEFORE','INVOKE_AFTER','JSON_AFTER','WRITE_BEFORE','DONE'];
 for(const line of raw.toString('utf8').split(/\r?\n/)){
  if(line==='')continue;if(!line.startsWith('XR_PHYSICAL_STAGE ')){otherLines++;continue;}
  if(++prefixedLines>257){problems.add('STAGE_COUNT_BOUND');continue;}
  const m=/^XR_PHYSICAL_STAGE ([A-Z_]+) (-1|[0-5]) (-1|[0-9]{1,2})$/.exec(line);
  if(!m||!STAGES.includes(m[1])){problems.add('INVALID_CLOSED_STAGE');continue;}
  const [tag,p,d]=[m[1],Number(m[2]),Number(m[3])],global=singleton.includes(tag)||tag==='LIMIT'||tag.endsWith('_THROW');
  if((global&&(p!==-1||d!==-1))||(!global&&(p<0||d<0||d>64))){problems.add('INVALID_ORDINAL');continue;}
  records.push({tag,pathOrdinal:p,ancestorDepth:d});
 }
 let last=-1;for(const tag of singleton){const positions=records.flatMap((x,i)=>x.tag===tag?[i]:[]);if(positions.length>1)problems.add('DUPLICATE_SINGLE_STAGE');if(positions.length){if(positions[0]<last)problems.add('INVALID_STAGE_ORDER');last=positions[0];}}
 if(records.length&&records[0].tag!=='ENTRY')problems.add('MISSING_ENTRY');
 const truncated=records.some(x=>x.tag==='LIMIT');
 return {availability:'OBSERVED_BUFFER',records,lastStage:records.at(-1)?.tag??null,prefixedLines,otherLines,truncated,valid:problems.size===0,problems:[...problems].sort()};
}
function validMetaValue(key,value){
 if(typeof value!=='string'||Buffer.byteLength(value)>256)return false;
 if(['PS_VERSION','CLR_VERSION','EXE_VERSION','COMMAND_VERSION'].includes(key))return /^[0-9]{1,6}(?:\.[0-9]{1,6}){1,4}$/.test(value);
 if(key==='PS_EDITION')return ['Desktop','Core'].includes(value);
 if(key==='EXE_NAME')return ['powershell.exe','pwsh.exe'].includes(value);
 if(key==='EXE_CLASS')return ['SYSTEM32_WINDOWS_POWERSHELL','OTHER_LOCATION'].includes(value);
 if(key==='EXE_PATH_SHA256')return HASH.test(value);
 if(key==='NATIVE_PID')return /^[1-9][0-9]{0,9}$/.test(value)&&Number(value)<=2147483647;
 if(key==='START_TICKS')return /^[0-9]{17,19}$/.test(value)&&BigInt(value)<=3155378975999999999n;
 if(key.endsWith('_WEBNAME'))return ['utf-8','utf-16','utf-16BE','utf-16be','utf-32','utf-32BE','us-ascii','windows-1252','ibm437','ibm850','UNSET'].includes(value);
 if(key.endsWith('_CODEPAGE'))return value==='UNSET'||/^(?:0|[1-9][0-9]{0,4})$/.test(value)&&Number(value)<=65535;
 if(key==='AUTOLOAD_MODE')return ['DEFAULT_UNSET','All','ModuleQualified','None'].includes(value);
 if(key==='MODULE_PATH_PRESENT')return ['0','1'].includes(value);
 if(key==='MODULE_PATH_ENTRIES')return /^(?:0|[1-9][0-9]{0,2})$/.test(value)&&Number(value)<=256;
 if(key==='COMMAND_NAME')return value==='ConvertFrom-Json';
 if(key==='COMMAND_MODULE')return value==='Microsoft.PowerShell.Utility';
 if(key==='COMMAND_TYPE')return value==='Microsoft.PowerShell.Commands.ConvertFromJsonCommand';
 if(key==='ERROR_TYPE')return ['System.Management.Automation.CommandNotFoundException','System.Management.Automation.RuntimeException','System.Management.Automation.CmdletInvocationException','System.Management.Automation.PSArgumentException','System.ArgumentException','System.InvalidOperationException','System.FormatException'].includes(value);
 if(key==='ERROR_HRESULT')return /^-?(?:0|[1-9][0-9]{0,9})$/.test(value)&&Number(value)>=-2147483648&&Number(value)<=2147483647;
 return false;
}
function metadataFacts(rows,pid){
 const at=key=>rows[META_KEYS.indexOf(key)],self=at('NATIVE_PID');
 const identityMatched=self.state==='OBSERVED'&&pid!==null?Number(self.value)===pid:null;
 return {nativePidFromResult:pid,selfPidMatchesResult:identityMatched,
  selfStartTicks:identityMatched===true&&at('START_TICKS').state==='OBSERVED'?at('START_TICKS').value:null,
  completeRuntime:rows.slice(0,18).every(r=>r.state==='OBSERVED'),completeCommand:rows.slice(18,22).every(r=>r.state==='OBSERVED'),
  errorMetadataObserved:rows.slice(22).some(r=>r.state==='OBSERVED'),nativeKernelHandleObserved:false,wholeDescendantExitVerified:false};
}
export function parseNativeDiagnostics(raw,nativePid){
 need(Buffer.isBuffer(raw)&&raw.length<=64000,'FOCUS_REFUSED');
 const pid=Number.isSafeInteger(nativePid)&&nativePid>0&&nativePid<=2147483647?nativePid:null,seen=new Map(),problems=new Set();
 let metadataLines=0,unknownLines=0,duplicateLines=0,otherNonStageLines=0;
 for(const line of raw.toString('utf8').split(/\r?\n/)){
  if(line==='')continue;if(!line.startsWith('XR_PHYSICAL_META ')){if(!line.startsWith('XR_PHYSICAL_STAGE '))otherNonStageLines++;continue;}
  if(++metadataLines>128){problems.add('METADATA_BOUND');continue;}
  const m=/^XR_PHYSICAL_META ([A-Z0-9_]+) ([A-Za-z0-9+/]{0,344}={0,2})$/.exec(line);
  if(!m||!META_KEYS.includes(m[1])){unknownLines++;problems.add('UNKNOWN_OR_INVALID_METADATA');continue;}
  if(seen.has(m[1])){duplicateLines++;problems.add('DUPLICATE_METADATA');continue;}
  let value=null;try{const b=Buffer.from(m[2],'base64');need(b.length<=256&&b.toString('base64')===m[2],'FOCUS_REFUSED');value=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b);need(validMetaValue(m[1],value),'FOCUS_REFUSED');}catch{problems.add('INVALID_METADATA_VALUE');}
  seen.set(m[1],{key:m[1],state:value!==null&&validMetaValue(m[1],value)?'OBSERVED':'INVALID_OMITTED',value:value!==null&&validMetaValue(m[1],value)?value:null});
 }
 const rows=META_KEYS.map(key=>seen.get(key)??{key,state:'NOT_OBSERVED',value:null}),facts=metadataFacts(rows,pid);
 if(facts.selfPidMatchesResult===false)problems.add('NATIVE_PID_MISMATCH');
 return {kind:'CLOSED_NATIVE_RUNTIME_OBSERVATIONS',rows,metadataLines,unknownLines,duplicateLines,otherNonStageLines,problems:[...problems].sort(),...facts};
}
function metadataShape(value){
 if(!exactKeys(value,['kind','rows','metadataLines','unknownLines','duplicateLines','otherNonStageLines','problems','nativePidFromResult','selfPidMatchesResult','selfStartTicks','completeRuntime','completeCommand','errorMetadataObserved','nativeKernelHandleObserved','wholeDescendantExitVerified'])||value.kind!=='CLOSED_NATIVE_RUNTIME_OBSERVATIONS'||!Array.isArray(value.rows)||value.rows.length!==META_KEYS.length)return false;
 for(let i=0;i<META_KEYS.length;i++){const r=value.rows[i];if(!exactKeys(r,['key','state','value'])||r.key!==META_KEYS[i]||!['OBSERVED','NOT_OBSERVED','INVALID_OMITTED'].includes(r.state)||(r.state==='OBSERVED'?!validMetaValue(r.key,r.value):r.value!==null))return false;}
 for(const k of ['metadataLines','unknownLines','duplicateLines','otherNonStageLines'])if(!Number.isSafeInteger(value[k])||value[k]<0||value[k]>64000)return false;
 if(!Array.isArray(value.problems)||value.problems.length>5||new Set(value.problems).size!==value.problems.length||value.problems.some(x=>!['METADATA_BOUND','UNKNOWN_OR_INVALID_METADATA','DUPLICATE_METADATA','INVALID_METADATA_VALUE','NATIVE_PID_MISMATCH'].includes(x)))return false;
 const pid=value.nativePidFromResult;if(!(pid===null||Number.isSafeInteger(pid)&&pid>0&&pid<=2147483647))return false;
 const facts=metadataFacts(value.rows,pid);for(const [k,v]of Object.entries(facts))if(value[k]!==v)return false;
 if(value.metadataLines<value.rows.filter(r=>r.state!=='NOT_OBSERVED').length+value.unknownLines+value.duplicateLines)return false;
 if(value.problems.includes('METADATA_BOUND')!==(value.metadataLines>128)||value.problems.includes('UNKNOWN_OR_INVALID_METADATA')!==(value.unknownLines>0)||value.problems.includes('DUPLICATE_METADATA')!==(value.duplicateLines>0)||value.problems.includes('INVALID_METADATA_VALUE')!==value.rows.some(r=>r.state==='INVALID_OMITTED')||value.problems.includes('NATIVE_PID_MISMATCH')!==(facts.selfPidMatchesResult===false))return false;
 return true;
}
export function projectNative(error,stdout,stderr,success){
 const status=data(error,'status'),v=status.value,integer=Number.isSafeInteger(v)&&v>=-2147483648&&v<=4294967295;
 const raw=Buffer.isBuffer(stdout)?stdout:null,err=Buffer.isBuffer(stderr)?stderr:null;
 let predicate=null,parseErrorName=null,checked=null;
 if(success){if(!raw){parseErrorName='STDOUT_UNAVAILABLE';predicate=false;}else{try{const value=JSON.parse(raw.toString('utf8'));checked=Number.isSafeInteger(value.checked)&&value.checked>=0&&value.checked<=10000?value.checked:null;predicate=value.schemaVersion===1&&value.noReparse===true&&value.checked===6;}catch{parseErrorName='SyntaxError';predicate=false;}}}
 return {status:success?0:integer?v:null,statusState:success?'API_SUCCESS_RETURN':!status.present?'NOT_RETAINED':v===null?'OBSERVED_NULL':integer?'OBSERVED_INTEGER':'INVALID_OMITTED',
  signal:success?null:safeSignal(data(error,'signal').value),errorCode:success?null:safeCode(data(error,'code').value),
  stdoutAvailable:raw!==null,stdoutBytes:raw?.length??null,stdoutSha256:raw?sha(raw):null,
  stderrAvailable:err!==null,stderrBytes:err?.length??null,stderrSha256:err?sha(err):null,
  executionSucceeded:success,originalPredicateAccepted:predicate,originalPredicateReached:success,parseErrorName,checked,
  nativeHelperPid:null,nativeHelperBirth:null,wholeDescendantExitVerified:false};
}

export function createOwnedOutput(parent,run){
 need(/^[0-9]{1,20}$/.test(run),'FOCUS_REFUSED');parent=physical(fs.realpathSync.native(parent));
 const parentStat=fs.lstatSync(parent,{bigint:true}),root=path.join(parent,'corpus-publication-owned-'+run+'-1-win32');
 fs.mkdirSync(root);const s=fs.lstatSync(root,{bigint:true});need(s.isDirectory()&&!s.isSymbolicLink()&&fs.realpathSync.native(root)===root,'FOCUS_REFUSED');
 const owner=Object.freeze({root,parent,dev:String(s.dev),ino:String(s.ino),parentDev:String(parentStat.dev),parentIno:String(parentStat.ino),nonce:crypto.randomUUID()});OWNED.add(owner);
 const fd=fs.openSync(path.join(root,'.focus-owner.json'),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({schemaVersion:1,kind:'owned-physical-focus-only',nonce:owner.nonce,parentPid:process.pid})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return owner;
}
export function ownsOutput(owner){
 if(!owner||!OWNED.has(owner))return false;try{const a=fs.lstatSync(owner.root,{bigint:true}),p=fs.lstatSync(owner.parent,{bigint:true});return a.isDirectory()&&!a.isSymbolicLink()&&p.isDirectory()&&!p.isSymbolicLink()&&String(a.dev)===owner.dev&&String(a.ino)===owner.ino&&String(p.dev)===owner.parentDev&&String(p.ino)===owner.parentIno&&fs.realpathSync.native(owner.root)===owner.root&&fs.realpathSync.native(owner.parent)===owner.parent;}catch{return false;}
}
export function writeOwnedJSON(owner,name,value){
 need(ownsOutput(owner)&&OUTPUT_NAMES.has(name),'FOCUS_REFUSED');const raw=Buffer.from(JSON.stringify(value,null,2)+'\n');need(raw.length<=262144,'FOCUS_REFUSED');
 const fd=fs.openSync(path.join(owner.root,name),'wx',0o600);try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function publishOutput(owner){need(ownsOutput(owner),'FOCUS_REFUSED');const p=process.env.GITHUB_OUTPUT,s=fs.lstatSync(p);need(s.isFile()&&!s.isSymbolicLink()&&s.size<=1048576&&!/[\r\n]/.test(owner.root),'FOCUS_REFUSED');fs.appendFileSync(p,'artifact_owned=true\nartifact_dir='+owner.root+'\n');}
function readSchema(){const raw=readBounded(path.join(path.dirname(SELF),'physical-focus.schema.json'),32768);need(sha(raw)===SCHEMA_SHA,'FOCUS_REFUSED');const schema=JSON.parse(raw);need(schema.schemaVersion===1&&schema.subject.source===BASE&&schema.subject.tree===BASE_TREE&&JSON.stringify(schema.controlNames)===JSON.stringify(CONTROL_NAMES),'FOCUS_REFUSED');return schema;}
let gitCalls=0;
function git(repo,args,b,fixture=false){
 b.check(5000);need(++gitCalls<=100,'FOCUS_REFUSED');const allowed=['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','PATHEXT','TEMP','TMP'];const env={};for(const k of allowed)if(typeof process.env[k]==='string')env[k]=process.env[k];Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'NUL',GIT_OPTIONAL_LOCKS:'0',GIT_NO_REPLACE_OBJECTS:'1',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'});
 const extras=fixture?['-c','core.hooksPath='+path.join(repo,'empty-hooks'),'-c','init.templateDir=']:[];
 const r=spawnSync('git',['--no-optional-locks','--no-replace-objects','--no-lazy-fetch','-C',repo,...extras,...args],{env,shell:false,windowsHide:true,timeout:5000,killSignal:'SIGKILL',maxBuffer:2097152,stdio:['ignore','pipe','pipe']});
 need(!r.error&&r.status===0&&r.signal===null&&Buffer.isBuffer(r.stdout)&&Buffer.isBuffer(r.stderr)&&(fixture||r.stderr.length===0),'FOCUS_GIT_REFUSED');return r.stdout;
}
function text(repo,args,b,fixture=false){return git(repo,args,b,fixture).toString('utf8').trim();}
function context(){
 need(process.versions.node==='20.19.0'&&process.platform==='win32'&&process.arch==='x64','FOCUS_REFUSED');
 need(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='teamxenios/xenios-website'&&process.env.GITHUB_EVENT_NAME==='push'&&process.env.GITHUB_REF===BRANCH&&process.env.GITHUB_RUN_ATTEMPT==='1'&&process.env.XR_RUNNER_ENVIRONMENT==='github-hosted'&&process.env.XR_RUNNER_LABEL==='windows-2022'&&process.env.RUNNER_OS==='Windows','FOCUS_REFUSED');
 const source=process.env.XR_PHYSICAL_FOCUS_SOURCE,tree=process.env.XR_PHYSICAL_FOCUS_TREE,runner=process.env.GITHUB_SHA,run=process.env.GITHUB_RUN_ID;
 need(OID.test(source??'')&&OID.test(tree??'')&&OID.test(runner??'')&&/^[0-9]{1,20}$/.test(run??'')&&HASH.test(process.env.XR_PHYSICAL_FOCUS_CONTROLLER_SHA256??''),'FOCUS_REFUSED');return {source,tree,runner,run};
}
function sourceGuard(c,schema,b){
 const workspace=fs.realpathSync.native(process.env.GITHUB_WORKSPACE),sourceRepo=fs.realpathSync.native(path.join(workspace,'focus-source')),eventRepo=fs.realpathSync.native(path.join(workspace,'focus-event'));
 need(fs.realpathSync.native(REPO)===sourceRepo&&fs.realpathSync.native(SELF)===path.join(sourceRepo,...(PREFIX+'capture-physical-focus.mjs').split('/')),'FOCUS_REFUSED');
 const event=JSON.parse(readBounded(process.env.GITHUB_EVENT_PATH));need(event.created===true&&event.forced===false&&event.deleted===false&&event.before==='0'.repeat(40)&&event.after===c.runner&&event.ref===BRANCH&&event.repository?.full_name==='teamxenios/xenios-website','FOCUS_REFUSED');
 need(text(sourceRepo,['rev-parse','HEAD'],b)===c.source&&text(eventRepo,['rev-parse','HEAD'],b)===c.runner&&text(eventRepo,['show','-s','--format=%P',c.runner],b)===c.source&&text(sourceRepo,['show','-s','--format=%P',c.source],b)===BASE,'FOCUS_REFUSED');
 need(text(sourceRepo,['rev-parse',c.source+'^{tree}'],b)===c.tree&&text(eventRepo,['rev-parse',BASE+'^{tree}'],b)===BASE_TREE,'FOCUS_REFUSED');
 const delta=(from,to)=>text(eventRepo,['diff','--no-renames','--name-status',from,to],b).split('\n').sort();
 need(JSON.stringify(delta(BASE,c.source))===JSON.stringify(INPUTS.map(p=>'A\t'+p).sort())&&JSON.stringify(delta(c.source,c.runner))===JSON.stringify(['A\t'+WORKFLOW]),'FOCUS_REFUSED');
 const pins=[...schema.subject.pins,{path:INPUTS[0],sha256:process.env.XR_PHYSICAL_FOCUS_CONTROLLER_SHA256},{path:INPUTS[1],sha256:SCHEMA_SHA},{path:INPUTS[2],sha256:schema.controlTest.sha256}],observed=[];
 for(const pin of pins){const entry=text(eventRepo,['ls-tree',c.source,'--',pin.path],b),m=/^100644 blob ([a-f0-9]{40})\t(.+)$/.exec(entry);need(m&&m[2]===pin.path,'FOCUS_REFUSED');const raw=git(eventRepo,['cat-file','blob',m[1]],b);need(sha(raw)===pin.sha256&&readBounded(path.join(sourceRepo,...pin.path.split('/'))).equals(raw),'FOCUS_REFUSED');if(pin.blob)need(pin.blob===m[1]&&pin.bytes===raw.length,'FOCUS_REFUSED');observed.push({path:pin.path,mode:'100644',blob:m[1],bytes:raw.length,sha256:sha(raw)});}
 const workflowRaw=git(eventRepo,['show',c.runner+':'+WORKFLOW],b),gitVersion=text(eventRepo,['--version'],b);need(/^git version [A-Za-z0-9.+-]{1,80}$/.test(gitVersion),'FOCUS_REFUSED');
 return {kind:'OWNED_PHYSICAL_FOCUS_SOURCE_PROOF',source:c.source,sourceTree:c.tree,runner:c.runner,runnerTree:text(eventRepo,['rev-parse',c.runner+'^{tree}'],b),sourceParent:BASE,baseTree:BASE_TREE,workflowPath:WORKFLOW,workflowSha256:sha(workflowRaw),pins:observed,run:c.run,attempt:1,node:process.versions.node,platform:process.platform,gitVersion,scope:'ONE_FRESH_INSTRUMENTED_FIXTURE_NOT_PUBLISHER_OR_LIVE_AUTHORITY'};
}
function writeNew(file,raw){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function setupFixture(schema,base,b){
 const root=fs.realpathSync.native(fs.mkdtempSync(path.join(base,'xenios-publication-owned-'))),nonce=crypto.randomUUID();
 const main=path.join(root,'main'),linked=path.join(root,'linked'),legacy=path.join(root,'legacy'),future=path.join(root,'future');
 writeNew(path.join(root,'fixture-owner.json'),Buffer.from(JSON.stringify({kind:'owned-publication-fixture-only',root,nonce},null,2)+'\n'));writeNew(path.join(root,'writer-window.txt'),Buffer.from('open'));fs.mkdirSync(main);fs.mkdirSync(legacy);
 git(main,['init','--initial-branch=owned-main'],b,true);writeNew(path.join(main,'synthetic-only.json'),Buffer.from(JSON.stringify({nonce},null,2)+'\n'));git(main,['add','synthetic-only.json'],b,true);
 git(main,['-c','user.name=Owned Synthetic Fixture','-c','user.email=fixture@example.invalid','commit','--no-gpg-sign','-m','Owned fixture only'],b,true);git(main,['worktree','add','-b','owned-linked',linked],b,true);
 const common=fs.realpathSync.native(text(main,['rev-parse','--path-format=absolute','--git-common-dir'],b,true));need(common===fs.realpathSync.native(text(linked,['rev-parse','--path-format=absolute','--git-common-dir'],b,true)),'FOCUS_REFUSED');
 for(const d of ['notes','sessions','empty-history'])fs.mkdirSync(path.join(legacy,d));
 for(const file of schema.fixture.legacyFiles){need(/^[A-Za-z0-9_./-]+$/.test(file.path)&&!file.path.includes('..'),'FOCUS_REFUSED');const raw=Buffer.from(file.base64,'base64');need(sha(raw)===file.sha256&&raw.length<=5242880,'FOCUS_REFUSED');writeNew(path.join(legacy,...file.path.split('/')),raw);}
 const paths=[main,common,legacy,root,future,path.join(common,'xenios-coordination')];need(new Set(paths).size===6&&!fs.existsSync(future)&&!fs.existsSync(paths[5]),'FOCUS_REFUSED');
 return {paths,shape:{realGitLinkedWorktree:true,commonDirectoryMatched:true,distinctRoles:6,legacyFiles:schema.fixture.legacyFiles.length,legacyDirectories:3,futureAndBindingDirectoryAbsent:true,exactHistoricalInputBytes:false,fullPublisherOrOwnerWarmupReplayed:false}};
}
async function worker(){
 need(process.versions.node==='20.19.0'&&process.platform==='win32'&&typeof process.send==='function','FOCUS_REFUSED');
 const c=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Object.assign(new Error('FOCUS_REFUSED'),{code:'FOCUS_REFUSED'})),5000);process.once('message',value=>{clearTimeout(timer);resolve(value);});});
 need(exactKeys(c,['kind','nonce','run','source','tree','parentPid','rootDev','rootIno','fixtureDev','fixtureIno','controllerSha256'])&&c.kind==='OWNED_PHYSICAL_FOCUS_CONTROL'&&UUID.test(c.nonce??'')&&c.parentPid===process.ppid&&OID.test(c.source??'')&&OID.test(c.tree??'')&&HASH.test(c.controllerSha256??''),'FOCUS_REFUSED');
 const base=physical(fs.realpathSync.native(process.env.RUNNER_TEMP)),root=path.dirname(base);need(path.basename(base)==='owned-fixtures'&&path.basename(root)==='corpus-publication-owned-'+c.run+'-1-win32'&&fs.realpathSync.native(process.cwd())===fs.realpathSync.native(REPO),'FOCUS_REFUSED');
 const rs=fs.lstatSync(root,{bigint:true}),bs=fs.lstatSync(base,{bigint:true}),marker=JSON.parse(readBounded(path.join(root,'.focus-owner.json'),4096));
 need(String(rs.dev)===c.rootDev&&String(rs.ino)===c.rootIno&&String(bs.dev)===c.fixtureDev&&String(bs.ino)===c.fixtureIno&&marker.nonce===c.nonce&&marker.parentPid===process.ppid&&sha(readBounded(SELF))===c.controllerSha256,'FOCUS_REFUSED');
 const schema=readSchema(),b=budget(70000);let phase='fixture_setup',sample=null,attempts=0;
 try{
  const fixture=setupFixture(schema,base,b),input=Buffer.from(JSON.stringify([...new Set(fixture.paths)],null,2)+'\n');
  const staged=instrumentPrimitive(extractPrimitive(readBounded(path.join(REPO,'scripts','agentic','corpus-adoption-publication.mjs'))));need(staged.instrumentedSha256===schema.instrumentedSha256,'FOCUS_REFUSED');
  phase='native_primitive';b.check(8000);let out=null,err=null,error=null,success=false,nativePid=null;const started=new Date().toISOString();
  // Pinned Node20.19 execFileSync delegates to spawnSync. The diagnostic
  // exposes that result directly, preserving command/options/input/8s while
  // retaining PID and stderr on success. This is a disclosed API difference.
  try{attempts++;const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',staged.script],{windowsHide:true,timeout:8000,maxBuffer:64000,input,stdio:['pipe','pipe','pipe']});nativePid=data(r,'pid').value;const a=data(r,'stdout').value,z=data(r,'stderr').value;if(Buffer.isBuffer(a))out=a;if(Buffer.isBuffer(z))err=z;error={status:data(r,'status').value,signal:data(r,'signal').value,code:data(data(r,'error').value,'code').value};success=!data(r,'error').value&&error.status===0&&error.signal===null;}
  catch(e){error={status:null,signal:null,code:data(e,'code').value};}
  const ended=new Date().toISOString(),transport=projectNative(error,out,err,success);
  const stages=Buffer.isBuffer(err)?err.length<=64000?parseStages(err):{availability:'BUFFER_OVER_BOUND',records:[],lastStage:null,valid:false,truncated:true,problems:['STAGE_BUFFER_BOUND'],otherLines:null,prefixedLines:null}:{availability:'NOT_RETAINED_ON_RESULT',records:[],lastStage:null,valid:null,truncated:null,problems:[],otherLines:null,prefixedLines:null};
  const nativeDiagnostics=parseNativeDiagnostics(Buffer.isBuffer(err)&&err.length<=64000?err:Buffer.alloc(0),nativePid);
  transport.nativeHelperPid=nativeDiagnostics.selfPidMatchesResult===true?nativeDiagnostics.nativePidFromResult:null;transport.nativeHelperBirth=nativeDiagnostics.selfStartTicks;
  sample={kind:'OWNED_PHYSICAL_FOCUS_SAMPLE',sampleAttempts:1,fixture:fixture.shape,inputCount:6,inputBytes:input.length,inputSha256:sha(input),originalPrimitiveSha256:staged.originalSha256,instrumentedPrimitiveSha256:staged.instrumentedSha256,inverseVerified:true,deadlineMs:8000,maxBuffer:64000,api:'spawnSync',startedAt:started,endedAt:ended,transport,stages,nativeDiagnostics,scope:'FRESH_INSTRUMENTED_ONLY_NO_ORIGINAL_FAILURE_CAUSE_OR_ADOPTION_CLAIM'};
 }catch(e){sample={kind:'OWNED_PHYSICAL_FOCUS_SETUP_HOLD',sampleAttempts:attempts,phase,code:safeCode(data(e,'code').value)??'FOCUS_REFUSED',nativeHelperCustody:'UNVERIFIED'};}
 const wire=JSON.stringify(sample);need(Buffer.byteLength(wire)<=32768,'FOCUS_REFUSED');process.send({kind:'sample',nonce:c.nonce,result:sample});process.disconnect();
}

function sampleShape(value,schema){
 if(!value||typeof value!=='object'||Buffer.byteLength(JSON.stringify(value))>32768)return false;
 if(value.kind==='OWNED_PHYSICAL_FOCUS_SETUP_HOLD')return exactKeys(value,['kind','sampleAttempts','phase','code','nativeHelperCustody'])&&[0,1].includes(value.sampleAttempts)&&['fixture_setup','native_primitive'].includes(value.phase)&&safeCode(value.code)===value.code&&value.nativeHelperCustody==='UNVERIFIED';
 if(!exactKeys(value,['kind','sampleAttempts','fixture','inputCount','inputBytes','inputSha256','originalPrimitiveSha256','instrumentedPrimitiveSha256','inverseVerified','deadlineMs','maxBuffer','api','startedAt','endedAt','transport','stages','nativeDiagnostics','scope']))return false;
 if(value.kind!=='OWNED_PHYSICAL_FOCUS_SAMPLE'||value.sampleAttempts!==1||value.inputCount!==6||!Number.isSafeInteger(value.inputBytes)||value.inputBytes<1||value.inputBytes>5242880||!HASH.test(value.inputSha256)||value.originalPrimitiveSha256!==PRIMITIVE_SHA||value.instrumentedPrimitiveSha256!==schema.instrumentedSha256||value.inverseVerified!==true||value.deadlineMs!==8000||value.maxBuffer!==64000||value.api!=='spawnSync'||value.scope!=='FRESH_INSTRUMENTED_ONLY_NO_ORIGINAL_FAILURE_CAUSE_OR_ADOPTION_CLAIM'||!metadataShape(value.nativeDiagnostics))return false;
 const stamp=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
 if(!stamp(value.startedAt)||!stamp(value.endedAt)||Date.parse(value.endedAt)<Date.parse(value.startedAt))return false;
 const f=value.fixture;if(!exactKeys(f,['realGitLinkedWorktree','commonDirectoryMatched','distinctRoles','legacyFiles','legacyDirectories','futureAndBindingDirectoryAbsent','exactHistoricalInputBytes','fullPublisherOrOwnerWarmupReplayed'])||f.realGitLinkedWorktree!==true||f.commonDirectoryMatched!==true||f.distinctRoles!==6||f.legacyFiles!==8||f.legacyDirectories!==3||f.futureAndBindingDirectoryAbsent!==true||f.exactHistoricalInputBytes!==false||f.fullPublisherOrOwnerWarmupReplayed!==false)return false;
 const t=value.transport;if(!exactKeys(t,['status','statusState','signal','errorCode','stdoutAvailable','stdoutBytes','stdoutSha256','stderrAvailable','stderrBytes','stderrSha256','executionSucceeded','originalPredicateAccepted','originalPredicateReached','parseErrorName','checked','nativeHelperPid','nativeHelperBirth','wholeDescendantExitVerified']))return false;
 if(!(t.status===null||Number.isSafeInteger(t.status)&&t.status>=-2147483648&&t.status<=4294967295)||!['API_SUCCESS_RETURN','NOT_RETAINED','OBSERVED_NULL','OBSERVED_INTEGER','INVALID_OMITTED'].includes(t.statusState)||!(t.signal===null||safeSignal(t.signal)===t.signal)||!(t.errorCode===null||safeCode(t.errorCode)===t.errorCode)||![true,false].includes(t.executionSucceeded)||![true,false,null].includes(t.originalPredicateAccepted)||![true,false].includes(t.originalPredicateReached)||![null,'SyntaxError','STDOUT_UNAVAILABLE'].includes(t.parseErrorName)||!(t.checked===null||Number.isSafeInteger(t.checked)&&t.checked>=0&&t.checked<=10000)||t.wholeDescendantExitVerified!==false)return false;
 const nd=value.nativeDiagnostics;if(t.nativeHelperPid!==(nd.selfPidMatchesResult===true?nd.nativePidFromResult:null)||t.nativeHelperBirth!==nd.selfStartTicks)return false;
 if(t.executionSucceeded&&(t.status!==0||t.statusState!=='API_SUCCESS_RETURN'||t.signal!==null||t.errorCode!==null||t.originalPredicateReached!==true||![true,false].includes(t.originalPredicateAccepted)))return false;
 if(!t.executionSucceeded&&(t.statusState==='API_SUCCESS_RETURN'||t.originalPredicateReached!==false||t.originalPredicateAccepted!==null||t.parseErrorName!==null||t.checked!==null))return false;
 for(const prefix of ['stdout','stderr']){if(![true,false].includes(t[prefix+'Available']))return false;if(t[prefix+'Available']){if(!Number.isSafeInteger(t[prefix+'Bytes'])||t[prefix+'Bytes']<0||t[prefix+'Bytes']>131072||!HASH.test(t[prefix+'Sha256']))return false;}else if(t[prefix+'Bytes']!==null||t[prefix+'Sha256']!==null)return false;}
 const s=value.stages;if(!exactKeys(s,['availability','records','lastStage','prefixedLines','otherLines','truncated','valid','problems'])||!Array.isArray(s.records)||s.records.length>257||!Array.isArray(s.problems)||s.problems.length>8)return false;
 if(s.availability==='NOT_RETAINED_ON_RESULT')return !t.stderrAvailable&&s.records.length===0&&s.lastStage===null&&s.prefixedLines===null&&s.otherLines===null&&s.truncated===null&&s.valid===null&&s.problems.length===0;
 if(s.availability==='BUFFER_OVER_BOUND')return t.stderrAvailable&&t.stderrBytes>64000&&s.records.length===0&&s.lastStage===null&&s.valid===false&&s.truncated===true&&s.problems.join('|')==='STAGE_BUFFER_BOUND'&&s.otherLines===null&&s.prefixedLines===null;
 if(s.availability!=='OBSERVED_BUFFER'||!t.stderrAvailable||![true,false].includes(s.truncated)||![true,false].includes(s.valid))return false;
 const allowedProblems=['STAGE_COUNT_BOUND','INVALID_CLOSED_STAGE','INVALID_ORDINAL','DUPLICATE_SINGLE_STAGE','INVALID_STAGE_ORDER','MISSING_ENTRY','STAGE_BUFFER_BOUND'];
 if(s.problems.some(p=>!allowedProblems.includes(p))||s.valid!==(s.problems.length===0)||!Number.isSafeInteger(s.prefixedLines)||s.prefixedLines<0||s.prefixedLines>64000||!Number.isSafeInteger(s.otherLines)||s.otherLines<0||s.otherLines>64000)return false;
 for(const row of s.records)if(!exactKeys(row,['tag','pathOrdinal','ancestorDepth'])||!STAGES.includes(row.tag)||!Number.isSafeInteger(row.pathOrdinal)||row.pathOrdinal< -1||row.pathOrdinal>5||!Number.isSafeInteger(row.ancestorDepth)||row.ancestorDepth< -1||row.ancestorDepth>64)return false;
 return s.lastStage===(s.records.at(-1)?.tag??null);
}
async function runOwnedWorker(owner,c,schema,b){
 need(ownsOutput(owner),'FOCUS_REFUSED');b.check(95000);const fixtureRoot=path.join(owner.root,'owned-fixtures');fs.mkdirSync(fixtureRoot);const s=fs.lstatSync(fixtureRoot,{bigint:true});
 const startedAt=new Date().toISOString(),child=spawn(process.execPath,[SELF,'--owned-focus-worker'],{cwd:REPO,env:makeEnvironment(process.env,fixtureRoot),shell:false,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
 let result=null,protocolError=false,bytes=0,messages=0,killRequested=false,closed=false,exitCode=null,signal=null,spawnError=null;
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>65536){protocolError=true;killRequested=true;child.kill('SIGKILL');}});
 child.on('message',value=>{try{messages++;if(messages!==1||!exactKeys(value,['kind','nonce','result'])||value.kind!=='sample'||value.nonce!==owner.nonce||!sampleShape(value.result,schema)){protocolError=true;killRequested=true;child.kill('SIGKILL');}else result=value.result;}catch{protocolError=true;killRequested=true;child.kill('SIGKILL');}});
 const done=new Promise(resolve=>{child.once('error',e=>{spawnError=safeCode(data(e,'code').value)??'FOCUS_REFUSED';});child.once('close',(code,sig)=>{closed=true;exitCode=code;signal=sig;resolve();});});
 const timer=setTimeout(()=>{killRequested=true;child.kill('SIGKILL');},90000);
 child.once('spawn',()=>{try{child.send({kind:'OWNED_PHYSICAL_FOCUS_CONTROL',nonce:owner.nonce,run:c.run,source:c.source,tree:c.tree,parentPid:process.pid,rootDev:owner.dev,rootIno:owner.ino,fixtureDev:String(s.dev),fixtureIno:String(s.ino),controllerSha256:process.env.XR_PHYSICAL_FOCUS_CONTROLLER_SHA256},error=>{if(error){protocolError=true;killRequested=true;child.kill('SIGKILL');}});}catch{protocolError=true;killRequested=true;child.kill('SIGKILL');}});
 let graceTimer;await Promise.race([done,new Promise(resolve=>{graceTimer=setTimeout(resolve,95000);})]);clearTimeout(timer);clearTimeout(graceTimer);
 if(!closed){try{if(child.connected)child.disconnect();child.stdout.destroy();child.stderr.destroy();child.unref();}catch{}}
 return {result,process:{pid:Number.isSafeInteger(child.pid)?child.pid:null,startedAt,endedAt:new Date().toISOString(),closed,exitCode,signal,spawnError,killRequested,unexpectedStdioBytes:bytes,messages,protocolError,nativeDescendantExitVerified:false},good:closed&&exitCode===0&&signal===null&&!spawnError&&!killRequested&&!protocolError&&bytes===0&&messages===1};
}

export default async function* nativeReporter(source){
 const wanted=new Set(CONTROL_NAMES),rows=new Map(),summary=new Map(),problems=new Set();let events=0,stdio=0;
 for await(const event of source){if(++events>1000)fail('FOCUS_REFUSED');const d=event.data??{};
  if(event.type==='test:stdout'||event.type==='test:stderr'){stdio++;continue;}
  if(event.type==='test:diagnostic'){const m=/^(tests|pass|fail|cancelled|skipped|todo) ([0-9]+)$/.exec(d.message??'');if(m){if(summary.has(m[1]))problems.add('DUPLICATE_SUMMARY');summary.set(m[1],Number(m[2]));}continue;}
  if(event.type!=='test:pass'&&event.type!=='test:fail')continue;
  if(!wanted.has(d.name)||rows.has(d.name)||d.nesting!==0){problems.add('INVALID_TERMINAL');continue;}
  const outcome=d.skip!==undefined&&d.skip!==false?'skipped':d.todo!==undefined&&d.todo!==false?'todo':event.type==='test:pass'?'passed':'failed';rows.set(d.name,{name:d.name,nesting:d.nesting,outcome});
 }
 const counts={tests:summary.get('tests')??null,pass:summary.get('pass')??null,fail:summary.get('fail')??null,cancelled:summary.get('cancelled')??null,skipped:summary.get('skipped')??null,todo:summary.get('todo')??null};
 if(stdio||rows.size!==8||CONTROL_NAMES.some(n=>rows.get(n)?.outcome!=='passed')||counts.tests!==8||counts.pass!==8||['fail','cancelled','skipped','todo'].some(k=>counts[k]!==0))problems.add('INCOMPLETE_OR_NONPASS');
 yield JSON.stringify({kind:'OWNED_PHYSICAL_FOCUS_NATIVE_CONTROLS',node:process.versions.node,events,stdio,counts,rows:CONTROL_NAMES.map(name=>rows.get(name)??{name,nesting:0,outcome:'NOT_OBSERVED'}),problems:[...problems].sort(),complete:problems.size===0})+'\n';
}
export function projectControlOutput(raw){
 const refused=()=>({accepted:false,code:'CONTROL_OUTPUT_REFUSED',observed:null});
 try{
  if(!Buffer.isBuffer(raw)||raw.length<2||raw.length>65536)return refused();
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw));
  if(!exactKeys(value,['kind','node','events','stdio','counts','rows','problems','complete'])||value.kind!=='OWNED_PHYSICAL_FOCUS_NATIVE_CONTROLS'||value.node!=='20.19.0'||!Number.isSafeInteger(value.events)||value.events<14||value.events>1000||value.stdio!==0||value.complete!==true||!Array.isArray(value.problems)||value.problems.length!==0)return refused();
  const c=value.counts;
  if(!exactKeys(c,['tests','pass','fail','cancelled','skipped','todo'])||c.tests!==8||c.pass!==8||['fail','cancelled','skipped','todo'].some(k=>c[k]!==0))return refused();
  if(!Array.isArray(value.rows)||value.rows.length!==8||value.rows.some((row,i)=>!exactKeys(row,['name','nesting','outcome'])||row.name!==CONTROL_NAMES[i]||row.nesting!==0||row.outcome!=='passed'))return refused();
  // Only fresh fixed keys/scalars cross the retention boundary. Exact wire
  // equality also refuses duplicate JSON keys and alternate/padded payloads.
  const observed={kind:value.kind,node:value.node,events:value.events,stdio:value.stdio,
   counts:{tests:c.tests,pass:c.pass,fail:c.fail,cancelled:c.cancelled,skipped:c.skipped,todo:c.todo},
   rows:value.rows.map(row=>({name:row.name,nesting:row.nesting,outcome:row.outcome})),problems:[],complete:value.complete};
  if(!raw.equals(Buffer.from(JSON.stringify(observed)+'\n')))return refused();
  return {accepted:true,code:'CONTROL_OUTPUT_ACCEPTED',observed};
 }catch{return refused();}
}
function controls(owner,b){
 b.check(25000);const startedAt=new Date().toISOString(),r=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-timeout=15000','--test-reporter',pathToFileURL(SELF).href,path.join(path.dirname(SELF),'capture-physical-focus.node-test.mjs')],{cwd:REPO,env:makeEnvironment(process.env,process.env.RUNNER_TEMP),shell:false,windowsHide:true,timeout:20000,killSignal:'SIGKILL',maxBuffer:65536,stdio:['ignore','pipe','pipe']});
 const projected=projectControlOutput(r.stdout),processGood=!r.error&&r.status===0&&r.signal===null&&Buffer.isBuffer(r.stderr)&&r.stderr.length===0;
 const sampleAuthorized=processGood&&projected.accepted;
 const validStatus=Number.isSafeInteger(r.status)&&r.status>=-2147483648&&r.status<=4294967295;
 const report={kind:'OWNED_PHYSICAL_FOCUS_CONTROL_EXECUTION',startedAt,endedAt:new Date().toISOString(),pid:Number.isSafeInteger(r.pid)&&r.pid>0?r.pid:null,status:validStatus?r.status:null,signal:safeSignal(r.signal),errorCode:safeCode(data(r.error,'code').value),stdoutBytes:Buffer.isBuffer(r.stdout)?r.stdout.length:null,stdoutSha256:Buffer.isBuffer(r.stdout)?sha(r.stdout):null,stderrBytes:Buffer.isBuffer(r.stderr)?r.stderr.length:null,stderrSha256:Buffer.isBuffer(r.stderr)?sha(r.stderr):null,outputAccepted:projected.accepted,outputCode:projected.code,sampleAuthorized,observed:projected.observed};
 writeOwnedJSON(owner,'pure-control-events.json',report);
 need(sampleAuthorized,'FOCUS_REFUSED');return report;
}
async function main(){
 const b=budget(180000);let owner=null,phase='context',proof=null,controlResult=null,sample=null;
 try{const c=context(),schema=readSchema();phase='source_guard';proof=sourceGuard(c,schema,b);owner=createOwnedOutput(process.env.RUNNER_TEMP,c.run);writeOwnedJSON(owner,'source-guard.json',proof);
  phase='pure_controls';controlResult=controls(owner,b);phase='one_owned_sample';sample=await runOwnedWorker(owner,c,schema,b);
  if(sample.result)writeOwnedJSON(owner,'sample-result.json',sample.result);
  const result=sample.result,traceGood=result?.stages?.availability==='OBSERVED_BUFFER'&&result.stages.valid===true&&!result.stages.truncated&&result.stages.lastStage==='DONE';
  const nd=result?.nativeDiagnostics,metadataGood=nd?.completeRuntime===true&&nd.completeCommand===true&&nd.problems.length===0&&nd.selfPidMatchesResult===true&&nd.selfStartTicks!==null&&!nd.errorMetadataObserved;
  const passed=sample.good&&result?.kind==='OWNED_PHYSICAL_FOCUS_SAMPLE'&&result.sampleAttempts===1&&result.transport?.executionSucceeded===true&&result.transport.status===0&&result.transport.errorCode===null&&result.transport.signal===null&&result.transport.originalPredicateAccepted===true&&traceGood&&metadataGood;
  writeOwnedJSON(owner,'qualification-report.json',{kind:'OWNED_PHYSICAL_FOCUS_RESULT',state:passed?'RESOLVED_COMMAND_SINGLE_INVOKE_PREDICATE_PASS_FRESH_DIAGNOSTIC_ONLY':'NATIVE_FAILURE_OR_HOLD_NO_RETRY',source:proof,controlResult,sample,claims:{publisherQualified:false,historicalFailureExplained:false,nativeHelperIdentityVerified:false,wholeDescendantExitVerified:false,liveRootApproval:false,allWriterBarrier:false,installation:false},cleanup:'Fixture/output retained. Node owned worker handle and spawnSync child result/selfPID are separately reported. Kernel handle and native descendants remain UNVERIFIED. No recursive cleanup or retry.'});publishOutput(owner);process.exitCode=passed?0:1;
 }catch(e){if(owner&&ownsOutput(owner)){try{writeOwnedJSON(owner,'qualification-report.json',{kind:'OWNED_PHYSICAL_FOCUS_RESULT',state:'HOLD_BEFORE_OR_DURING_SAMPLE',phase,code:safeCode(data(e,'code').value)??'FOCUS_REFUSED',source:proof,controlResult,sample,claims:{publisherQualified:false,nativeHelperIdentityVerified:false,wholeDescendantExitVerified:false,liveAdoption:false}});publishOutput(owner);}catch{}}process.stderr.write('OWNED_PHYSICAL_FOCUS_HOLD\n');process.exitCode=1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(SELF)){
 if(process.argv.length===3&&process.argv[2]==='--owned-focus-worker'){worker().catch(()=>{if(process.connected)process.disconnect();process.exitCode=1;});}
 else if(process.argv.length===2){main().catch(()=>{process.stderr.write('OWNED_PHYSICAL_FOCUS_HOLD\n');process.exitCode=1;});}
 else{process.stderr.write('OWNED_PHYSICAL_FOCUS_REFUSED\n');process.exitCode=1;}
}
