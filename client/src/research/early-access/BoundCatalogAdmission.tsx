import type { ReactNode } from "react";
import { CatalogAdmissionGate, type CatalogAdmissionApi } from "./PreCatalogContact";

/** Reconfirm the current owner's contact admission when a backgrounded page returns. */
export function BoundCatalogAdmission({ api, children }: { api: CatalogAdmissionApi; children: ReactNode }) {
  return <CatalogAdmissionGate api={api} recheckOnRestore>{children}</CatalogAdmissionGate>;
}
