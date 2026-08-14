/**
 * The purchase-mode matrix now lives in shared/research/kris-launch-a, because
 * the browser needs the SAME closed function the server uses: the client pins
 * every wire row back through this matrix so a drifted envelope can never
 * upgrade a provider, classification-pending or price-pending row to Buy Now.
 *
 * This file stays as the server's import path so every existing call site,
 * and the matrix test that runs the function over all 420 artifact rows,
 * keeps reading from the module that has always owned the decision.
 */
export {
  krisModePermitsLegacyOrder,
  krisPurchaseMode,
} from "@shared/research/kris-launch-a/purchase-mode";
