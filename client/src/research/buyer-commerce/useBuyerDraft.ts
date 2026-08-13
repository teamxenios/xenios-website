import { useMemo, useState } from "react";

export interface BuyerDraftLine {
  offeringId: string;
  variantId: string;
  sku: string;
  label: string;
  quantity: number;
  priceCents?: number;
}

export function buyerVariantKey(
  line: Pick<BuyerDraftLine, "offeringId" | "variantId">,
): string {
  return `${line.offeringId}\u0000${line.variantId}`;
}

export function normalizedBuyerQuantity(quantity: number): number {
  return Number.isSafeInteger(quantity) ? Math.max(1, Math.min(50, quantity)) : 1;
}

export function upsertBuyerDraftLine(
  lines: readonly BuyerDraftLine[],
  line: BuyerDraftLine,
): BuyerDraftLine[] {
  const normalized = { ...line, quantity: normalizedBuyerQuantity(line.quantity) };
  const key = buyerVariantKey(line);
  const index = lines.findIndex((current) => buyerVariantKey(current) === key);
  if (index < 0) return [...lines, normalized];
  return lines.map((current, currentIndex) => (currentIndex === index ? normalized : current));
}

export function useBuyerDraft() {
  const [lines, setLines] = useState<BuyerDraftLine[]>([]);
  const upsert = (line: BuyerDraftLine) =>
    setLines((current) => upsertBuyerDraftLine(current, line));
  const remove = (line: Pick<BuyerDraftLine, "offeringId" | "variantId">) =>
    setLines((current) => current.filter((currentLine) => buyerVariantKey(currentLine) !== buyerVariantKey(line)));
  const clear = () => setLines([]);
  const requestedUnits = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines],
  );
  return { lines, upsert, remove, clear, requestedUnits };
}
