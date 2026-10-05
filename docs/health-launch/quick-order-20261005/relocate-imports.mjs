// Resolve each relative reference against the original location before changing
// it. File movement itself is done with checked native PowerShell Move-Item.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const dir='docs/health-launch/quick-order-20261005';
const before=JSON.parse(fs.readFileSync(`${dir}/evidence/relocation-before.json`,'utf8'));
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const mapped=new Map(before.inventory.map(row=>[path.resolve(row.oldPath),path.resolve(row.newPath)]));
function moveTarget(target){
 for(const row of before.inventory){
  const old=path.resolve(row.oldPath),ext=path.extname(old);
  if(target===old)return path.resolve(row.newPath);
  if(target===old.slice(0,-ext.length))return path.resolve(row.newPath).slice(0,-ext.length);
 }
 return target;
}
function existsModule(target){return ['', '.ts','.tsx','.mjs','.js','.d.mts'].some(ext=>fs.existsSync(target+ext));}
const inventory=[];
for(const row of before.inventory){
 if(fs.existsSync(row.oldPath))throw Error(`Old source unexpectedly remains: ${row.oldPath}`);
 const source=fs.readFileSync(row.newPath,'utf8').replaceAll('\r\n','\n');
 if(digest(source)!==row.beforeSha256lf)throw Error(`Unexpected pre-edit bytes: ${row.newPath}`);
 const replacements=[];
 const after=source.replace(/(["'])(\.\.?\/[^"'\r\n]+)\1/g,(full,quote,spec)=>{
  const oldTarget=path.resolve(path.dirname(row.oldPath),spec);
  const newTarget=moveTarget(oldTarget);
  if(!existsModule(newTarget))throw Error(`Reference does not resolve: ${row.oldPath} -> ${spec}`);
  let relative=path.relative(path.dirname(path.resolve(row.newPath)),newTarget).replaceAll('\\','/');
  if(!relative.startsWith('.'))relative='./'+relative;
  if(relative!==spec)replacements.push({from:spec,to:relative,resolvedTarget:path.relative(process.cwd(),newTarget).replaceAll('\\','/')});
  return quote+relative+quote;
 });
 if(after!==source)fs.writeFileSync(row.newPath,after);
 inventory.push({...row,afterSha256lf:digest(after),byteIdenticalLf:after===source,replacements});
}
fs.writeFileSync(`${dir}/evidence/relocation-inventory.json`,JSON.stringify({at:new Date().toISOString(),fromSource:before.source,inventory},null,2)+'\n');
console.log(JSON.stringify({files:inventory.length,byteIdenticalLf:inventory.filter(row=>row.byteIdenticalLf).length,pathOnlyChanges:inventory.filter(row=>!row.byteIdenticalLf).map(row=>({path:row.newPath,replacements:row.replacements}))}));
