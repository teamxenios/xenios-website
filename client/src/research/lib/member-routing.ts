import type { MemberInfo } from "../core";
import { MEMBER_ROUTES } from "./routes";

const MEMBER_ROOT = "/research/member";
const ACTIVATION_ROOT = "/research/activate";
const STATIC_MEMBER_PATHS = new Set(
  Object.values(MEMBER_ROUTES).filter((path) => !path.includes(":")),
);
const DYNAMIC_MEMBER_PATHS = [
  /^\/research\/member\/goals\/[a-z0-9][a-z0-9._-]*$/,
  /^\/research\/member\/products\/[a-z0-9][a-z0-9._-]*$/,
  /^\/research\/member\/guides\/[a-z0-9][a-z0-9._-]*$/,
  /^\/research\/member\/orders\/[a-z0-9][a-z0-9._-]*$/,
];

function isRegisteredMemberPath(pathname: string): boolean {
  return STATIC_MEMBER_PATHS.has(pathname as (typeof MEMBER_ROUTES)[keyof typeof MEMBER_ROUTES]) ||
    DYNAMIC_MEMBER_PATHS.some((pattern) => pattern.test(pathname));
}

export function safeResearchReturnTo(value: string | null | undefined): string | null {
  if (!value || value !== value.trim()) return null;
  if (value.includes("\\") || value.includes("#") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const rawPath = value.split("?", 1)[0];
  // Member routes do not require encoded path octets. Rejecting every encoded
  // path byte closes encoded and double-encoded traversal/separator variants.
  if (/%[0-9a-f]{2}/i.test(rawPath)) return null;
  if (!(value === "/research" || value.startsWith("/research/"))) return null;

  try {
    const base = new URL("https://xenios.invalid");
    const parsed = new URL(value, base);
    const pathname = parsed.pathname.toLowerCase();
    if (parsed.origin !== base.origin) return null;
    if (parsed.pathname !== pathname) return null;
    if (
      pathname !== "/research" &&
      pathname !== ACTIVATION_ROOT &&
      !isRegisteredMemberPath(pathname)
    ) return null;
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
