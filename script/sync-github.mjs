// Best-effort one-way sync of `main` to GitHub.
// Fetches the GitHub token from the Replit connector at runtime so no secret is
// ever written to a tracked file or committed. The token is passed to git via a
// throwaway GIT_ASKPASS helper + an env var (owner-only /proc/<pid>/environ),
// never on the command line. Safe to run repeatedly (no-op when nothing changed)
// and never throws in a way that should block a commit or merge.

import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_URL = "https://x-access-token@github.com/teamxenios/xenios-website.git";
const BRANCH = "main";

async function getGithubToken() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;
  if (!hostname || !xReplitToken) {
    throw new Error("Replit connector environment not available");
  }
  const res = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=github`,
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } },
  );
  if (!res.ok) throw new Error(`connector fetch failed (${res.status})`);
  const data = await res.json();
  const token = data.items?.[0]?.settings?.access_token;
  if (!token) throw new Error("no GitHub access token in connection");
  return token;
}

function currentBranch() {
  const r = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  });
  return (r.stdout || "").trim();
}

async function main() {
  const branch = currentBranch();
  if (branch !== BRANCH) {
    console.log(`[sync-github] on '${branch}', not '${BRANCH}' — skipping push.`);
    return 0;
  }

  let token;
  try {
    token = await getGithubToken();
  } catch (err) {
    console.error("[sync-github] skipped:", err.message);
    return 0; // do not fail the caller
  }

  // Throwaway askpass helper: reads the token from the env (not from argv, not
  // from a tracked file). Directory is created 0700 and removed in finally.
  const dir = mkdtempSync(join(tmpdir(), "ghsync-"));
  const askpass = join(dir, "askpass.sh");
  try {
    writeFileSync(askpass, '#!/bin/sh\nprintf "%s" "$GIT_TOKEN"\n', { mode: 0o700 });

    const r = spawnSync("git", ["push", REPO_URL, `HEAD:${BRANCH}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_TOKEN: token,
        GIT_ASKPASS: askpass,
        GIT_TERMINAL_PROMPT: "0",
      },
    });

    const out = (r.stdout || "").trim();
    const err = (r.stderr || "").trim();
    if (out) console.log("[sync-github]", out);
    if (err) console.log("[sync-github]", err);

    if (r.status === 0) {
      console.log("[sync-github] GitHub is up to date with local main.");
      return 0;
    }
    console.error("[sync-github] push failed (will retry on next change).");
    return 0; // never block the commit/merge on a transient push failure
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}

process.exit(await main());
