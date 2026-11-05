/** Display labels only. Catalog IDs, filter values and DTOs remain canonical. */
export function catalogPresentationLabel(key: string, fallback: string): string {
  return key === "clinical_formulations_503a" || key === "503a-clinical-formulations"
    ? "Clinical formulations"
    : fallback;
}
