// Read-only inventory; does not grant ownership or produce an acceptance.
import { execFileSync } from "node:child_process";
import { trustedOwnershipPolicy, integrationOwnershipFindings, integrationOwnershipFindingCounts } from "../../../scripts/acceptance/verify-release-manifest";
const root = process.cwd();
const base = "79414143d4355d5d3d14cd5fe6e5a536dc68d99d";
const head = execFileSync("git", ["rev-parse", "HEAD"], {encoding:"utf8"}).trim();
const files = execFileSync("git", ["diff", "--name-only", base, head], {encoding:"utf8"}).trim().split("\n");
const trusted = trustedOwnershipPolicy(root, base, head);
if (!trusted.policy || trusted.issues.length) throw Error(JSON.stringify(trusted.issues));
const findings = integrationOwnershipFindings(files, trusted.policy.rules, "integration");
console.log(JSON.stringify({base,head,files,policySha256:trusted.policy.sha256,counts:integrationOwnershipFindingCounts(findings),findings},null,2));
