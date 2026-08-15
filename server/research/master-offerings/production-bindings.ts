import type { MasterOfferingCommerceBindingReader } from "./product-control-adapter";

/**
 * The production binding state, which is currently: none.
 *
 * A binding joins a catalog offering variant to an exact Product Control
 * identity, and it is the FIRST link in the only path from a catalog row to a
 * displayed price (binding, then Product Control, then the authoritative
 * resolver, then one approved in-window row). Production holds zero reviewed
 * bindings today, so the truthful reader answers null for every variant and
 * every row renders "Price on request", which the packet that designed this
 * surface calls the correct and truthful output for exactly this state.
 *
 * When the general price data lands (Product Control products, variants, and
 * member-audience price rows, written through the mounted admin path), the
 * durable reviewed binding store replaces this module in the composition
 * root, and prices appear with no other change. Until then, a reader with no
 * store is not a stub pretending otherwise: it is the state of the business,
 * written down.
 */
export const masterOfferingNoProductionBindings: MasterOfferingCommerceBindingReader = {
  readBinding: () => null,
};
