// Selected-source form remains open for these reviewed artwork variants.
const unconfirmedOfferingByVariant = new Map<string, string>([
  ["mov_9262033fe69a14a50f1c", "mo_afb0add32da0de7426f5"],
  ["mov_718e52d07396abd5b2dc", "mo_8cca713c2b203a712494"],
  ["mov_9774e642bf4c6b799a8c", "mo_65340dd542e68a0af5ab"],
  ["mov_a29c1130a8c45aff1f26", "mo_e948b9ac0d531ef744ae"],
  ["mov_e21bffb0a8ad83a8137f", "mo_849cdbb1463f8382f1f6"],
  ["mov_b36b64d987325dca8df4", "mo_5e145fbee8e39536b580"],
  ["mov_a4b4118c4d23b1546c8b", "mo_ffeecca340b02f400868"],
  ["mov_4d4f3fc085df5aaf9ae8", "mo_6d5f244f45892249b132"],
  ["mov_fb757d24b8c1ae0e5efe", "mo_b1b15717ae2e89a19981"],
  ["mov_538e701ea3907d766c38", "mo_4df776b9fb9b2d4b7302"],
  ["mov_19de1d73a1a3844c0190", "mo_4a4dd3014ea4cd85cb6e"],
  ["mov_3e5e9840aea10ca2137e", "mo_987ced2746afaa80e326"],
  ["mov_a75d9a7c5bfa0dec5ece", "mo_2fd34c733360f34e7a63"],
]);

export function isResearchFormUnconfirmed(variantId: string, offeringId?: string): boolean {
  const expectedOfferingId = unconfirmedOfferingByVariant.get(variantId);
  return expectedOfferingId !== undefined
    && (offeringId === undefined || offeringId === expectedOfferingId);
}

export function researchListingSubcategory(product: {
  id?: string;
  subcategory: string | null;
  variants: readonly { id: string }[];
}): string | null {
  if (product.subcategory === "Lyophilized Vial"
    && product.variants.some((variant) => isResearchFormUnconfirmed(variant.id, product.id))) {
    return null;
  }
  return product.subcategory;
}
