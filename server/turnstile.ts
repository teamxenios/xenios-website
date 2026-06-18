// Cloudflare Turnstile server-side verification.
// If TURNSTILE_SECRET_KEY is not set, verification is skipped (the honeypot and
// rate-limiter remain active) so the forms keep working before keys are added.
export async function verifyTurnstile(
  token: string | undefined | null,
  ip?: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams();
    body.append("secret", secret);
    body.append("response", token);
    if (ip) body.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch (err) {
    console.error("[turnstile] verify error:", err);
    return false;
  }
}
