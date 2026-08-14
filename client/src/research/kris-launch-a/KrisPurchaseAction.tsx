import { useLocation } from "wouter";
import {
  KRIS_PURCHASE_MODE_LABELS,
  type KrisCatalogItemView,
} from "@shared/research/kris-launch-a/contract";
import { queueKrisLegacyOrder } from "./legacyOrderHandoff";

export function KrisPurchaseAction({ item }: { item: KrisCatalogItemView }) {
  const [, navigate] = useLocation();

  if (item.purchaseMode === "direct_eligible" && item.canBuyNow) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        data-testid="kris-buy-now"
        onClick={() => {
          if (queueKrisLegacyOrder(item)) navigate("/research/early-access");
        }}
      >
        BUY NOW
      </button>
    );
  }

  return (
    <p
      className="body-s text-ink-2"
      data-testid={`kris-purchase-mode-${item.purchaseMode}`}
    >
      {item.purchaseMode === "direct_eligible"
        ? "Ordering is being connected for this item"
        : KRIS_PURCHASE_MODE_LABELS[item.purchaseMode]}
    </p>
  );
}
