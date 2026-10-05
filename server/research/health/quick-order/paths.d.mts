export const QUICK_ORDER_PREFIX: '/api/health/quick-order';
export type QuickOrderTarget =
  | { kind: 'unrelated' }
  | { kind: 'owned-malformed' }
  | { kind: 'owned-valid'; url: URL };
export function classifyQuickOrderTarget(
  req: { originalUrl?: string; url?: string },
  prefix?: string,
): QuickOrderTarget;
