import { useMemo, useState } from "react";

export interface BuyerDraftLine {
  offeringId: string;
  variantId: string;
  sku: string;
  label: string;
  quantity: number;
  priceCents?: number;
}

export function normalizedBuyerQuantity(quantity: number): number {
  return Number.isSafeInteger(quantity) ? Math.max(1, Math.min(50, quantity)) : 1;
}

export function upsertBuyerDraftLine(
  lines: readonly BuyerDraftLine[],
  line: BuyerDraftLine,
): BuyerDraftLine[] {
  const normalized = { ...line, quantity: normalizedBuyerQuantity(line.quantity) };
  const index = lines.findIndex((current) => current.variantId === line.variantId);
  if (index < 0) return [...lines, normalized];
  return lines.map((current, currentIndex) => (currentIndex === index ? normalized : current));
}

export function useBuyerDraft() {
  const [lines, setLines] = useState<BuyerDraftLine[]>([]);
  const upsert = (line: BuyerDraftLine) =>
    setLines((current) => upsertBuyerDraftLine(current, line));
  const remove = (variantId: string) =>
    setLines((current) => current.filter((line) => line.variantId !== variantId));
  const clear = () => setLines([]);
  const requestedUnits = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines],
  );
  return { lines, upsert, remove, clear, requestedUnits };
}
