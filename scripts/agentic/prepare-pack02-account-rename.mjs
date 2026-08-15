#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const argv=process.argv.slice(2);
const get=(name)=>{const i=argv.indexOf(name);return i>=0?argv[i+1]:undefined;};
const input=path.resolve(get("--input")??"supabase/pack02-candidates/20260812_research_account_organizations.sql");
const output=path.resolve(get("--output")??"supabase/pack02-candidates/20260812_research_account_organizations.renamed.sql");
const write=argv.includes("--write");
const source=fs.readFileSync(input,"utf8");
const oldName="public.research_organizations";
const newName="public.research_account_organizations";
const occurrences=source.split(oldName).length-1;
if(occurrences<8) throw new Error(`Refusing: expected at least 8 account-table references, found ${occurrences}`);
if(source.includes(newName)) throw new Error("Refusing: candidate already contains the renamed table");
const transformed=source.replaceAll(oldName,newName)
  .replaceAll("constraint research_organizations_","constraint research_account_organizations_")
  .replaceAll("index research_organizations_","index research_account_organizations_");
if(transformed.includes(oldName)) throw new Error("Refusing: old account table reference survived");
if(!transformed.includes(`create table if not exists ${newName}`)) throw new Error("Refusing: renamed create table missing");
const report={input,output,occurrences,oldName,newName,write};
if(write){fs.writeFileSync(output,transformed,"utf8");fs.writeFileSync(`${output}.report.json`,JSON.stringify(report,null,2)+"\n","utf8");}
else process.stdout.write(transformed);
console.error(JSON.stringify(report,null,2));
