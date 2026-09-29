// Claude probes of the candidate's no-em-dash gate (review-only).
import { scanSourceText, scanBuildText, isExcludedSourcePath } from "file:///C:/xenios-wt/closeout-review/scripts/acceptance/verify-no-em-dash.mjs";

const D = "\u2014";
const cases = [
  ["literal in TSX JSX text", "client/src/x.tsx", `export const A = () => <p>Care ${D} Research</p>;`, true],
  ["literal in string", "server/research/x.ts", `export const m = "Hello ${D} world";`, true],
  ["template literal", "server/research/x.ts", "export const m = `Hi ${D} there`;", true],
  ["&mdash; in TSX string", "client/src/x.tsx", `export const m = "a &mdash; b";`, true],
  ["&#8212; in html", "client/public/x.html", `<p>a &#8212; b</p>`, true],
  ["&#x2014; in html", "client/public/x.html", `<p>a &#x2014; b</p>`, true],
  ["escaped \\u2014 in string", "shared/x.ts", `export const m = "a \\u2014 b";`, true],
  ["JSON value", "server/research/data/x.json", `{"label":"Capsule ${D} 100 mg"}`, true],
  ["aria-label attribute", "client/src/x.tsx", `export const A = () => <button aria-label="Close ${D} menu" />;`, true],
  ["line comment only", "server/research/x.ts", `// note ${D} internal\nexport const m = "ok";`, false],
  ["block comment only", "client/src/x.tsx", `/* note ${D} */ export const m = "ok";`, false],
  ["approved punctuation", "client/src/x.tsx", `export const m = "Care: research, and more (see FAQ).";`, false],
  ["test file excluded", "client/src/x.test.tsx", `export const m = "a ${D} b";`, false],
];
let failures = 0;
for (const [name, file, text, expectFail] of cases) {
  const hits = scanSourceText(file, text).length;
  const ok = expectFail ? hits > 0 : hits === 0;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: hits=${hits}`);
}
// Exclusion-name loophole: a real runtime folder named history/archive would be skipped.
for (const p of ["client/src/research/orders/history/Summary.tsx", "server/research/archive/copy.ts", "client/src/research/account/audit-evidence/x.tsx"]) {
  console.log(`INFO excluded=${isExcludedSourcePath(p)} ${p}`);
}
// Build: a customer string in a bundle must fail; the allowlisted third-party string must pass.
console.log(`${scanBuildText("dist/public/assets/a.js", `const t="Hello ${D} there";`).length > 0 ? "PASS" : "FAIL"} build customer string detected`);
console.log(`${scanBuildText("dist/public/assets/a.js", `x("proactive refresh failed, access token still valid ${D} preserving session")`).length === 0 ? "PASS" : "FAIL"} build allowlisted third-party string passes`);
console.log(failures ? `PROBES FAILED: ${failures}` : "ALL SOURCE PROBES PASS");
