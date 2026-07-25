// A tiny composition seam between the founding-activation service (which knows
// how to evaluate the legal agreement gate) and the durable outbox worker
// (which already owns the restart-safe 60-second poll). Keeping the callback
// here avoids a circular dependency between those two modules.

export type AgreementPackageReconciler = () => Promise<void>;

let reconciler: AgreementPackageReconciler | null = null;

export function registerAgreementPackageReconciler(next: AgreementPackageReconciler | null): void {
  reconciler = next;
}

export async function runAgreementPackageReconciler(): Promise<void> {
  if (reconciler) await reconciler();
}
