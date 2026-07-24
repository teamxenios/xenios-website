import type { MemberInfo } from "../core";

const MEMBER_ROOT = "/research/member";
const ACTIVATION_ROOT = "/research/activate";

export function safeResearchReturnTo(value: string | null | undefined): string | null {
  if (!value || value !== value.trim()) return null;
  if (value.includes("\\") || value.includes("#") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  if (/%2f|%5c/i.test(value)) return null;
  if (!(value === "/research" || value.startsWith("/research/"))) return null;

  try {
    const base = new URL("https://xenios.invalid");
    const parsed = new URL(value, base);
    const pathname = parsed.pathname.toLowerCase();
    if (parsed.origin !== base.origin) return null;
    if (!(pathname === "/research" || pathname.startsWith("/research/"))) return null;
    if (pathname === "/research/admin" || pathname.startsWith("/research/admin/")) return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

export function memberDestination(member: MemberInfo, requestedReturnTo?: string | null): string {
  const safeReturnTo = safeResearchReturnTo(requestedReturnTo);
  if (member.status === "active") {
    return safeReturnTo === MEMBER_ROOT || safeReturnTo?.startsWith(`${MEMBER_ROOT}/`)
      ? safeReturnTo
      : MEMBER_ROOT;
  }
  return ACTIVATION_ROOT;
}
