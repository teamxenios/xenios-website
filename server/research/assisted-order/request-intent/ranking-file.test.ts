import {mkdtemp, writeFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {expect,it} from "vitest";
import {readCatalogRankingSource as load} from "./ranking-source";
it("reloads a private artifact without a code deploy and suppresses missing, malformed and oversized sources",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"catalog-fixture-"));const file=join(dir,"rankings.json");const old=process.env.EARLY_ACCESS_PRIVATE_RANKINGS_FILE;
 try{
  process.env.EARLY_ACCESS_PRIVATE_RANKINGS_FILE=file;expect(await load()).toBeNull();
  await writeFile(file,'{');expect(await load()).toBeNull();
  await writeFile(file,JSON.stringify({schema:1}));expect(await load()).toEqual({schema:1});
  await writeFile(file,JSON.stringify({schema:2}));expect(await load()).toEqual({schema:2});
  await writeFile(file,Buffer.alloc(1024*1024+1));expect(await load()).toBeNull();
 }finally{if(old===undefined)delete process.env.EARLY_ACCESS_PRIVATE_RANKINGS_FILE;else process.env.EARLY_ACCESS_PRIVATE_RANKINGS_FILE=old;await rm(dir,{recursive:true,force:true});}
});
