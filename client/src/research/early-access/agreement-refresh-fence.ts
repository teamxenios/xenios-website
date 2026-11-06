/**
 * Per-mounted-route callback generation. This is NOT an acceptance record,
 * identity, authorization decision or policy version. It stores no customer
 * data and does not perform I/O. Only a fresh server-backed agreement view may
 * confirm acceptance; callbacks retained by older views must be ignored.
 */
export interface AgreementRefreshFence {
  current(): number;
  invalidate(): number;
  isCurrent(revision: number): boolean;
}

export function createAgreementRefreshFence(): AgreementRefreshFence {
  let revision = 0;
  return Object.freeze({
    current: () => revision,
    invalidate: () => ++revision,
    isCurrent: (candidate: number) => Number.isSafeInteger(candidate)
      && candidate >= 0 && candidate === revision,
  });
}
