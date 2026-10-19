// Source-only tool-bundle verifier. No download/install/provider calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import {hash,need} from './tool-helpers.mjs';
try {
  const root=path.resolve(process.argv[2]);
  const raw=await fs.readFile(path.join(root,'run-manifest.json'),'utf8');
  need(hash(raw)===process.env.XENIOS_FROZEN_MANIFEST_SHA256,'MANIFEST_HASH');
  const manifest=JSON.parse(raw), t=manifest.toolchain;
  const inventoryRaw=await fs.readFile(path.join(root,'tool-inventory.json'),'utf8');
  need(hash(inventoryRaw)===t.inventorySha256,'INVENTORY_HASH');
  const inventory=JSON.parse(inventoryRaw);
  need(Array.isArray(inventory) && inventory.length>0 && inventory.length<=100000,'INVENTORY_SIZE');
  const base=path.join(root,'tools'), seen=new Set();
  for(const item of inventory) {
    need(typeof item.path==='string' && item.path.length<1024
      && !item.path.includes('\\') && !item.path.split('/').includes('..')
      && !path.isAbsolute(item.path) && /^[a-f0-9]{64}$/.test(item.sha256),'INVENTORY_PATH');
    need(!seen.has(item.path),'DUPLICATE_PATH');seen.add(item.path);
    const p=path.resolve(base,item.path);
    need(p.startsWith(base+path.sep),'PATH_ESCAPE');
    const s=await fs.lstat(p);
    need(s.isFile() && !s.isSymbolicLink() && s.size===item.bytes,'FILE_IDENTITY');
    need((s.mode&0o777)===item.mode,'TOOL_MODE');
    need(hash(await fs.readFile(p))===item.sha256,'TOOL_BYTES');
  }
  const actual=[];
  async function walk(p,rel='') {
    for(const e of await fs.readdir(p,{withFileTypes:true})) {
      need(!e.isSymbolicLink(),'SYMLINK_REFUSED');
      const r=rel?rel+'/'+e.name:e.name;
      if(e.isDirectory()) await walk(path.join(p,e.name),r);
      else {need(e.isFile(),'SPECIAL_FILE_REFUSED');actual.push(r);}
    }
  }
  await walk(base);
  need(actual.length===seen.size && actual.every(p=>seen.has(p)),'EXACT_TOOL_SET');
  const packageJson=JSON.parse(await fs.readFile(path.join(base,t.playwrightPackageJson),'utf8'));
  need(packageJson.name==='playwright' && packageJson.version===t.playwrightVersion,'PLAYWRIGHT_PIN');
  console.log(JSON.stringify({status:'TOOL_INVENTORY_VERIFIED',files:seen.size}));
} catch {
  console.log('TOOL_INVENTORY_REFUSED');process.exitCode=1;
}

