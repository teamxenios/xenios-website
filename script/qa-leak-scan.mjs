import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const findings = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !file.endsWith("package-lock.json"))
  .filter((file) => !file.startsWith("docs/research-legal/"))
  .filter((file) => !file.startsWith("docs/legal/"));

const secretPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub token", /\bgh[opsu]_[A-Za-z0-9]{30,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Stripe live secret", /\bsk_live_[A-Za-z0-9]{20,}\b/],
  ["Supabase service JWT", /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
];

for (const file of tracked) {
  const full = path.join(root, file);
  if (!fs.existsSync(full) || fs.statSync(full).size > 2_000_000) continue;
  const text = fs.readFileSync(full, "utf8");
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) findings.push({ scope: "tracked source", file, label });
  }
}

const bundleFiles = walk(path.join(root, "dist", "public")).filter((file) => /\.(js|css|html|json|map)$/.test(file));
const prohibitedBundleMarkers = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEARCH_SESSION_SECRET",
  "ADMIN_API_KEY",
  "ORDER_WEBHOOK_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "OPENAI_API_KEY",
];

for (const full of bundleFiles) {
  const text = fs.readFileSync(full, "utf8");
  const file = path.relative(root, full).replaceAll("\\", "/");
  for (const marker of prohibitedBundleMarkers) {
    if (text.includes(marker)) findings.push({ scope: "client bundle", file, label: marker });
  }
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) findings.push({ scope: "client bundle", file, label });
  }
}

if (!bundleFiles.length) {
  console.log("Bundle scan deferred: dist/public is absent. Source secret scan still ran.");
}

if (findings.length) {
  console.error("Leak scan failed:");
  for (const finding of findings) {
    console.error(`- ${finding.scope}: ${finding.label} in ${finding.file}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Leak scan passed (${tracked.length} tracked files, ${bundleFiles.length} bundle artifacts).`);
}

