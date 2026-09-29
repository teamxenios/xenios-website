/**
 * Format source-reconciliation labels for operator presentation without
 * changing the immutable evidence record or its wire representation.
 */
export function formatReconciliationPresentationLabel(value: string): string {
  return value.replace(/\s*—\s*/gu, ", ").replace(/\s{2,}/gu, " ").trim();
}
