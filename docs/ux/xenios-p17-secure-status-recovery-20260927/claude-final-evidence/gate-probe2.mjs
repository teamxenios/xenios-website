import { scanSourceText, scanBuildText } from "file:///C:/xenios-wt/closeout-review/scripts/acceptance/verify-no-em-dash.mjs";
const D="\u2014";
const t=[["src no-subst template","server/research/x.ts","export const m = `Hi "+D+" there`;"],
["src template with ${}","server/research/x.ts","export const m = (n)=>`Hi ${n} "+D+" there`;"],
["src JSX template attr","client/src/x.tsx","export const A=()=> <p title={`a "+D+" b`}>x</p>;"],
["build no-subst template","dist/index.cjs","var m=`Hi "+D+" there`;"],
["build template w/ subst","dist/index.cjs","var m=n=>`Hi ${n} "+D+" there`;"]];
for (const [name,f,x] of t){const fn=name.startsWith("build")?scanBuildText:scanSourceText;console.log(name, "hits="+fn(f,x).length);}
