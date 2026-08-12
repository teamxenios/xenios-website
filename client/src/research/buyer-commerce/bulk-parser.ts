export interface BuyerBulkCandidate {
  sku: string;
  quantity: number;
}

/** Accepts one exact SKU per line as `SKU,quantity`, tab, or whitespace. */
export function parseBuyerBulkOrder(text: string): {
  rows: BuyerBulkCandidate[];
  errors: string[];
} {
  const errors: string[] = [];
  const quantities = new Map<string, { sku: string; quantity: number }>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/[,\t ]+/).filter(Boolean);
    const [skuRaw, quantityRaw = "1"] = parts;
    const quantity = Number(quantityRaw);
    if (
      parts.length > 2 ||
      !skuRaw ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 50
    ) {
      errors.push(`Line ${index + 1}: use SKU,quantity with quantity 1-50.`);
      return;
    }
    const key = skuRaw.toLowerCase();
    const prior = quantities.get(key);
    const aggregate = (prior?.quantity ?? 0) + quantity;
    if (aggregate > 50) {
      errors.push(`Line ${index + 1}: ${skuRaw} totals more than 50 units.`);
      return;
    }
    quantities.set(key, { sku: prior?.sku ?? skuRaw, quantity: aggregate });
  });
  return { rows: Array.from(quantities.values()), errors };
}
