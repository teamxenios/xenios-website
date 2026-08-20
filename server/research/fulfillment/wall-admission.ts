import { EARLY_ACCESS_ORDER_NUMBER } from "../early-access/routes/order-number";

/**
 * The research wall's admission for the ONE fulfillment customer door.
 *
 * This lives in its own module so `server/research/index.ts` can import the
 * pattern without importing the fulfillment route table, its express
 * registrar, or the service — the wall should depend on a shape, not on a
 * subsystem.
 *
 * Expressed against the path AFTER the `/api/research` mount prefix, matching
 * how the wall's other parameterized entries are written. The order-reference
 * segment is taken from the generator's own anchored regex, so this door
 * cannot drift from the shape the server actually mints.
 *
 * Anchored on both ends and never a prefix: a lookalike segment, an extra
 * segment, and a wrong method all fail the match, so a future path added under
 * this namespace stays walled until it is listed on purpose.
 *
 * ADMISSION IS NOT AUTHORIZATION. The handler still resolves the member
 * server-side and answers 404 for an order that is not theirs, exactly as it
 * does for one that does not exist, so it cannot become an existence oracle.
 */
export const FULFILLMENT_CUSTOMER_STATUS_ADMISSION = new RegExp(
  `^/fulfillment/orders/(?:${EARLY_ACCESS_ORDER_NUMBER.source.replace(/^\^|\$$/g, "")})/status$`,
);

/** The only method the door answers. */
export const FULFILLMENT_CUSTOMER_STATUS_METHOD = "GET" as const;
