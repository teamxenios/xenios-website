// Pure text scan for secrets / PII markers in evidence outputs (JSON, MD, TXT,
// captured page text, file names). Screenshots are binary and cannot be text
// scanned; the scanner lists them for the mandatory manual PII/PHI review and
// relies on the sibling `*.text.txt` page-text dump captured with each image.

export const PATTERNS = [
  { id: "EMAIL", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, redact: true },
  { id: "US_PHONE", re: /(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g, redact: true },
  { id: "SSN", re: /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g, redact: true },
  { id: "STRIPE_LIVE_KEY", re: /\b(?:sk|rk|pk)_live_[A-Za-z0-9]{8,}/g, redact: true },
  { id: "PRIVATE_KEY_BLOCK", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, redact: false },
  { id: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, redact: true },
  { id: "SUPABASE_SECRET", re: /\bsb_secret_[A-Za-z0-9_]{6,}/g, redact: true },
  { id: "BEARER_TOKEN", re: /\bBearer\s+[A-Za-z0-9._-]{20,}/g, redact: true },
  {
    id: "STATUS_TOKEN",
    re: /(?:statusToken["']?\s*[:=]\s*["']?|x-xenios-order-status-token["']?\s*[:=]\s*["']?|[?&]token=)[A-Za-z0-9_-]{43}(?=["'&\s}]|$)/gi,
    redact: true,
  },
  { id: "AWS_ACCESS_KEY", re: /\bAKIA[0-9A-Z]{16}\b/g, redact: true },
  { id: "ORDER_REFERENCE", re: /\bXRR-\d{8}-[A-F0-9]{10}\b/g, redact: true },
];

/** Values that are fixtures by construction and never real data. */
export const DEFAULT_ALLOWLIST = [
  /@example\.(?:com|org|net)$/i,
  // Exact local-preview personas used by the synthetic account evidence
  // harness. Keep this narrower than the reserved `.invalid` TLD so a new or
  // mistyped address still fails closed until it is explicitly reviewed.
  /^fixture[12]@preview\.invalid$/i,
  // Exact synthetic contact fixture used by the assisted-order UI harness.
  // Other 555 values remain findings because the scanner cannot infer intent.
  /^\+1 555 010 2000$/,
  // Reserved, deterministic non-customer reference used only to prove that a
  // valid-shaped forged URL stays neutral. Every other XRR reference remains
  // a finding and the successful synthetic journey is redacted before write.
  /^XRR-20000101-0000000000$/,
  /^sb_secret_preview_placeholder$/,
  /^noreply@/i,
  // Published business contact addresses rendered on the public site
  // (support/contact pages, footer). Not personal data; a personal mailbox at
  // the same domain would still be a finding under the reviewer's manual pass.
  /^(?:team|research|support|hello|press|careers|security|privacy)@xeniostechnology\.com$/i,
];

export function scanText(text, { allowlist = DEFAULT_ALLOWLIST, source = "" } = {}) {
  const findings = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(text))) {
      const value = m[0];
      if (allowlist.some((a) => a.test(value))) continue;
      const line = text.slice(0, m.index).split("\n").length;
      findings.push({ id: p.id, source, line, redacted: p.redact ? redact(value) : value });
      if (findings.length > 200) return findings;
    }
  }
  return findings;
}

export function redact(value) {
  const s = String(value);
  if (s.length <= 6) return "*".repeat(s.length);
  return `${s.slice(0, 2)}${"*".repeat(Math.min(s.length - 4, 12))}${s.slice(-2)}`;
}

/** Filenames must never carry a person name, email, order ref, or token. */
export function scanFileName(name) {
  return scanText(name, { source: name }).map((f) => ({ ...f, kind: "FILENAME" }));
}

export function summariseFindings(findings) {
  const byId = {};
  for (const f of findings) byId[f.id] = (byId[f.id] ?? 0) + 1;
  return { total: findings.length, byId, result: findings.length === 0 ? "CLEAN" : "FINDINGS" };
}
