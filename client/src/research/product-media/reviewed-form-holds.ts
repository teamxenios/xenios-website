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
  ["mov_548802074a4f9ca45f5d", "mo_13c038b9250a2c8ac901"],
  ["mov_43ff04d9edfcdb5543a4", "mo_53622a0c32300df8ec03"],
  ["mov_457168650622c3647dc9", "mo_178c8a4230f88f157d5d"],
  ["mov_c7c5768303175886f6d1", "mo_fbf99d262617562b9dbb"],
  ["mov_30965a433abef7359a7b", "mo_3b716f351a069264bd3d"],
  ["mov_7502e2415b8757cad0eb", "mo_04d91e1cb01f09d3496e"],
  ["mov_8df703ff84f1bb8e1662", "mo_b75af573f3209d0710b1"],
  ["mov_4bcfb9614bef8b2c671e", "mo_a40fbe6a1890ff7176ed"],
  ["mov_ecd380609ace639d27a6", "mo_a8ea579b9329428591bd"],
  ["mov_644f912141d81a0199b0", "mo_d40ce6b09815282e14fa"],
  ["mov_d97f1f887a86b0c31947", "mo_8cea67b7890cebf8eb52"],
  ["mov_3e4c0914851a77ba8763", "mo_c87f1a7cdcd50253c3e8"],
  ["mov_11b73649761a6d35f28c", "mo_2e8194100fed7f7ca6ee"],
  ["mov_971080f20e26e8775e2b", "mo_422f4a4ca7e34ce66416"],
  ["mov_95104bb0edee8e97a3a6", "mo_839d9f0cb2ab74e094ee"],
  ["mov_420ac197458ecbcddb9a", "mo_8023384ab099bc55fa93"],
  ["mov_082a1d9c8a0d21e4a5c9", "mo_ec5dad7fec0e0750fdbc"],
  ["mov_9421188f57af62413a4c", "mo_9c3a4dd1b38f6b9ebc54"],
  ["mov_c4e5006693c890563310", "mo_c0b32b7549d7539af51e"],
  ["mov_556cf3eb15555573aa54", "mo_f8e8d69d2068c9bb2de1"],
  ["mov_dd89c37657eb69bce04f", "mo_e7bb199ac249b82eb17b"],
  ["mov_50c16caf05daa93ef289", "mo_d3a60ea0a358aef218f8"],
  ["mov_1981dac64e329b0bf2f8", "mo_0693d8b85b10f7c34f2e"],
  ["mov_5d10608450270b22967f", "mo_b33c802f4f7735fe986d"],
  ["mov_3c9394000d1302336110", "mo_9651dedf0c4086bc6e3d"],
  ["mov_e813930dcd46c36e98e2", "mo_ca6143466abf3895672c"],
  ["mov_0d00b80820b69cc39796", "mo_c464ca523cda95adb8a6"],
  ["mov_f7b635c1cc2be94922a0", "mo_4bbd59b26b04e4265758"],
  ["mov_9331f42ce573fb3f72e5", "mo_023a54a623e28e84ffd5"],
  ["mov_6c559c89db938c58e815", "mo_be72c9fb4d708d8a3eee"],
  ["mov_30d35dcbc0bc8d59ff5b", "mo_d5072d9cc26b1f898b6d"],
  ["mov_88fd1531d586cdebb896", "mo_b49627a2296975935e26"],
  ["mov_2183aa9edb06f34ef3af", "mo_c600e7eb1c9f5fd03c80"],
  ["mov_753d3f94385adf791d1e", "mo_7ba89975fb62ceb33b7b"],
  ["mov_8293d0baa21eb4d561f8", "mo_75bc8d1ad93b04865e6c"],
  ["mov_a2d32f69681dca2b17fb", "mo_4668304296fb55b51280"],
  ["mov_fe292b5f03527ec13e5e", "mo_b2ebb969d48a20f9e680"],
  ["mov_c58b682a44514760a74f", "mo_34fa0d12f1effd156e61"],
  ["mov_8e11e063f79d56a3a946", "mo_143d09ffd9b13780f2d7"],
  ["mov_257fd9d66f6284e3570e", "mo_2923115827ca8fe37d2c"],
  ["mov_9e34d0c1acde46249621", "mo_a6f7f071ed946577ce56"],
  ["mov_120b19d12e869b0070ff", "mo_aace3aded470921f6af2"],
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
  // The hold map is the only authority. A row is in it because its own source
  // does not state a form, so the catalog's subcategory is not shown for it,
  // whatever form that subcategory names. A row whose source does state its
  // form is not in the map and keeps its subcategory.
  if (product.variants.some((variant) => isResearchFormUnconfirmed(variant.id, product.id))) {
    return null;
  }
  return product.subcategory;
}
