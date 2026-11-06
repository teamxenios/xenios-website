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
  ["mov_71e448565b155e87b979", "mo_595ec28612674477e5aa"],
  ["mov_9cc6d7d3967d7507480b", "mo_f66623171e193fc81edb"],
  ["mov_523c894b29954645c00a", "mo_463212f23e8e3e39c57b"],
  ["mov_04f750af7277d98b7ad9", "mo_0907a4d651019afed8ed"],
  ["mov_6509a8f595cfc3fc36bc", "mo_ca085a7994a6db594748"],
  ["mov_e0ce4fde8a3393202bdc", "mo_f9bf2c4e55dbbb5e7a03"],
  ["mov_d25066629d9cbdbad552", "mo_216b3a5f02fb7724cd51"],
  ["mov_77a80adce9e9cb1b93a0", "mo_fa2070d7fd794ad0c245"],
  ["mov_77837ac2575c8df8ac73", "mo_7f4fc3961bd7c1e6b6bf"],
  ["mov_60e645f13e186042b62b", "mo_4bf44c0afe1ae392ddf0"],
  ["mov_26ba2e0fb6498f8e96ac", "mo_25463089835b0939dc4b"],
  ["mov_017febfdb0edf96366f4", "mo_9bd279e3ef84393cf793"],
  ["mov_29d962312f3386b5dd3f", "mo_321599837d987cc36181"],
  ["mov_7808f3ed26c4fa0f19f6", "mo_bf5e52e34a71bce9974e"],
  ["mov_e86aa92d94c61d407578", "mo_90d6189c4ecf3875647e"],
  ["mov_0881f51f4947326bf1e0", "mo_f9cf15e9c10861844ce4"],
  ["mov_469cd274fcf41edf3d8e", "mo_cf224f8d2efb906334c0"],
  ["mov_0d82ac64c7e39678212c", "mo_f729b05046ef91543822"],
  ["mov_8615d2aea357b8241ba3", "mo_226c15232adfd35b3288"],
  ["mov_bb52e1ff1819c70d9db1", "mo_17fe8edfd59d6a97260b"],
  ["mov_c46129d04e61dd2a9722", "mo_c79fda8d9b5122d37137"],
  ["mov_02ca369a8834ebeb0b3b", "mo_e28684442b78867c14ae"],
  ["mov_c6f57f9b117d418065ff", "mo_330de196b6297a7096d2"],
  ["mov_20d811a3df0894211cbc", "mo_8f14a0f8f4f86e07fda8"],
  ["mov_bc725d0ad2a12e1ee57c", "mo_918fe6760c731934168d"],
  ["mov_3ff3d97173e8a1f7645b", "mo_36fbcc90a698a8e7ada6"],
  ["mov_0f9bee8bdfc89ec9c2d3", "mo_a1d452a070c24e5f0033"],
  ["mov_7b331364b57f9fdd335a", "mo_4e47d44fd3982b0b5e61"],
  ["mov_2d03422d39648068a0e4", "mo_0784f8ad4fc471f8053e"],
  ["mov_e218a4fead30388a55ff", "mo_adf1037eceb9904e7d07"],
  ["mov_b5c50d1bb9d8ad998062", "mo_4223bdd3e6880240fc4a"],
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
