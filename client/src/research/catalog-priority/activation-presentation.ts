import type { ProductActivationStatus } from "@shared/research/product-activation/contract";
import type { BadgeTone } from "../ui/kit";

export type ActivationPresentation = Readonly<{
  label: string;
  tone: BadgeTone;
  actionLabel: string | null;
  note: string;
  actionable: boolean;
}>;

const CLOSED_PRESENTATION: Readonly<Record<ProductActivationStatus, ActivationPresentation>> = {
  live: {
    label: "Live",
    tone: "success",
    actionLabel: "View product",
    note: "Current catalog access still follows the server-resolved ordering pathway.",
    actionable: true,
  },
  request_only: {
    label: "Request only",
    tone: "info",
    actionLabel: "Request availability",
    note: "An availability request is not an order or a promise of supply.",
    actionable: true,
  },
  provider_required: {
    label: "Provider review required",
    tone: "warning",
    actionLabel: "View Care requirements",
    note: "Membership does not guarantee a provider decision or fulfillment.",
    actionable: true,
  },
  verbally_confirmed_pending_documentation: {
    label: "Documentation pending",
    tone: "pending",
    actionLabel: "Join availability list",
    note: "This item is not active or orderable while documentation remains incomplete.",
    actionable: true,
  },
  pending_pharmacy_activation: {
    label: "Pharmacy activation pending",
    tone: "pending",
    actionLabel: "Join availability list",
    note: "Exact pharmacy and activation requirements are still being completed.",
    actionable: true,
  },
  held: {
    label: "On hold",
    tone: "warning",
    actionLabel: null,
    note: "This item is not currently available.",
    actionable: false,
  },
  unavailable: {
    label: "Unavailable",
    tone: "neutral",
    actionLabel: null,
    note: "This item is not currently available.",
    actionable: false,
  },
};

export function activationPresentation(status: ProductActivationStatus): ActivationPresentation {
  return CLOSED_PRESENTATION[status] ?? CLOSED_PRESENTATION.unavailable;
}

