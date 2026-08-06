import {
  defaultVisualState,
  normalizeContainer,
  templateForVariant,
  type PeptideMediaPlanEntry,
  type PeptideSourceAction,
} from "./contracts";

// Media-production evidence only. This is not a commerce, price, inventory, lot,
// documentation, or Product Control authority. The rows contain only the public-safe
// identity fields required to prevent a cross-strength or cross-presentation image.
export const PEPTIDE_MEDIA_SOURCE_WORKBOOK_SHA256 =
  "df317a28374c9e194f3379a2b276c8533016dc84aa906af9d48b49db46bf53d5";

const MEDIA_ROWS = `
PEP-001\tBPC-157 + TB-500 Research Blend\tR360-BPC157_TB500-15MG_15MG-VIAL\t15 mg / 15 mg\tVial\tHELD_PENDING_GATES
PEP-002\tBPC-157 + TB-500 + GHK-Cu Research Blend\tR360-BPC157_TB500_GHKCU-10MG_10MG_50MG-VIAL\t10 mg / 10 mg / 50 mg\tVial\tHELD_PENDING_GATES
PEP-003\tKLOW Research Blend\tR360-TB500_BPC157_GHKCU_KPV-5MG_5MG_10MG_5MG-VIAL\t5 mg / 5 mg / 10 mg / 5 mg\tVial\tHELD_PENDING_GATES
PEP-004\tThymosin Alpha-1 + KPV + LL-37 Research Blend\tR360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL\t5 mg / 5 mg / 5 mg\tVial\tHELD_PENDING_GATES
PEP-005\tCJC-1295 + Ipamorelin Research Blend\tR360-CJC1295_IPAMORELIN-5MG_5MG-VIAL\t5 mg / 5 mg\tVial\tHELD_PENDING_GATES
PEP-005\tCJC-1295 + Ipamorelin Research Blend\tR360-CJC1295_IPAMORELIN-20MG-VIAL\t20 mg\tVial\tREQUEST_ACCESS
PEP-006\tPT-141 Research Material\tR360-PT141-10MG-VIAL\t10 mg\tVial\tHELD_PENDING_GATES
PEP-007\tTesamorelin Research Material\tR360-TESAMORELIN-10MG-VIAL\t10 mg\tVial\tHELD_PENDING_GATES
PEP-007\tTesamorelin Research Material\tR360-TESAMORELIN-20MG-VIAL\t20 mg\tVial\tREQUEST_ACCESS
PEP-008\tGonadorelin Research Material\tR360-GONADORELIN-5MG-VIAL\t5 mg\tVial\tHELD_PENDING_GATES
PEP-009\tNAD+ Research Material\tR360-NAD-500MG-VIAL\t500 mg\tVial\tHELD_PENDING_GATES
PEP-009\tNAD+ Research Material\tR360-NAD-1000MG-VIAL\t1000 mg\tVial\tREQUEST_ACCESS
PEP-010\tMOTS-C Research Material\tR360-MOTSC-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEP-010\tMOTS-C Research Material\tR360-MOTSC-40MG-VIAL\t40 mg\tVial\tREQUEST_ACCESS
PEP-011\tEpithalon Research Material\tR360-EPITHALON-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEP-011\tEpithalon Research Material\tR360-EPITHALON-100MG-VIAL\t100 mg\tVial\tREQUEST_ACCESS
PEP-012\tSS-31 Research Material\tR360-SS31-10MG-VIAL\t10 mg\tVial\tHELD_PENDING_GATES
PEP-012\tSS-31 Research Material\tR360-SS31-50MG-VIAL\t50 mg\tVial\tREQUEST_ACCESS
PEP-013\tSLU-PP-332 Research Capsules\tR360-SLUPP332-250MCGX100-CAP\t250 mcg\tCapsule bottle\tHELD_PENDING_GATES
PEP-014\tDihexa Research Capsules\tR360-DIHEXA-10MGX60-CAP\t10 mg\tCapsule bottle\tHELD_PENDING_GATES
PEP-015\tSemax + Selank + DSIP Research Blend\tR360-SEMAX_SELANK_DSIP-10MG_10MG_2MG-VIAL\t10 mg / 10 mg / 2 mg\tVial\tREQUEST_ACCESS
PEX-001\tBPC-157 Research Material\tR360-BPC157-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-001\tBPC-157 Research Material\tR360-BPC157-20MG-VIAL\t20 mg\tVial\tREQUEST_ACCESS
PEX-002\tTB-500 Research Material\tR360-TB500-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-003\tGHK-Cu Research Material\tR360-GHKCU-100MG-VIAL\t100 mg\tVial\tREQUEST_ACCESS
PEX-004\tKPV Research Material\tR360-KPV-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-005\tSemax Research Material\tR360-SEMAX-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-005\tSemax Research Material\tR360-SEMAX-30MG-VIAL\t30 mg\tVial\tREQUEST_ACCESS
PEX-006\tSelank Research Material\tR360-SELANK-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-007\tDSIP Research Material\tR360-DSIP-15MG-VIAL\t15 mg\tVial\tREQUEST_ACCESS
PEX-008\tThymosin Alpha-1 Research Material\tR360-THYMOSINALPHA1-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-009\tIpamorelin Research Material\tR360-IPAMORELIN-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-010\t5-Amino-1MQ Research Material\tR360-5AMINO1MQ-5MG-VIAL\t5 mg\tVial\tREQUEST_ACCESS
PEX-010\t5-Amino-1MQ Research Material\tR360-5AMINO1MQ-50MG-VIAL\t50 mg\tVial\tREQUEST_ACCESS
PEX-011\tAdamax Research Material\tR360-ADAMAX-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-012\tAOD-9604 Research Material\tR360-AOD9604-5MG-VIAL\t5 mg\tVial\tREQUEST_ACCESS
PEX-012\tAOD-9604 Research Material\tR360-AOD9604-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-013\tCJC-1295 with DAC Research Material\tR360-CJC1295DAC-5MG-VIAL\t5 mg\tVial\tREQUEST_ACCESS
PEX-014\tFollistatin Research Material\tR360-FOLLISTATIN-1MG-VIAL\t1 mg\tVial\tREQUEST_ACCESS
PEX-015\tGlutathione Research Material\tR360-GLUTATHIONE-600MG-VIAL\t600 mg\tVial\tREQUEST_ACCESS
PEX-015\tGlutathione Research Material\tR360-GLUTATHIONE-1500MG-VIAL\t1500 mg\tVial\tREQUEST_ACCESS
PEX-016\tHCG Research Material\tR360-HCG-5000IU-VIAL\t5000 IU\tVial\tREQUEST_ACCESS
PEX-017\tIGF-1 LR3 Research Material\tR360-IGF1LR3-0P1MG-VIAL\t0.1 mg\tVial\tREQUEST_ACCESS
PEX-017\tIGF-1 LR3 Research Material\tR360-IGF1LR3-1MG-VIAL\t1 mg\tVial\tREQUEST_ACCESS
PEX-018\tKisspeptin-10 Research Material\tR360-KISSPEPTIN10-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-019\tL-Carnitine Research Material\tR360-LCARNITINE-600MG-VIAL\t600 mg\tVial\tREQUEST_ACCESS
PEX-020\tLIPO-C Research Material\tR360-LIPOC-100MG-VIAL\t100 mg\tVial\tREQUEST_ACCESS
PEX-021\tMelanotan I Research Material\tR360-MELANOTAN1-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-022\tMelanotan II Research Material\tR360-MELANOTAN2-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-023\tSermorelin Research Material\tR360-SERMORELIN-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-024\tThymalin Research Material\tR360-THYMALIN-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-025\tVIP Research Material\tR360-VIP-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-026\tSemax + Selank Research Blend\tR360-SEMAX_SELANK-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
PEX-027\tTesamorelin + Ipamorelin Research Blend\tR360-TESAMORELIN_IPAMORELIN-15MG-VIAL\t15 mg\tVial\tREQUEST_ACCESS
PRH-001\tSemaglutide\tR360-SEMAGLUTIDE-10MG-VIAL\t10 mg\tVial\tUNAVAILABLE
PRH-001\tSemaglutide\tR360-SEMAGLUTIDE-15MG-VIAL\t15 mg\tVial\tUNAVAILABLE
PRH-001\tSemaglutide\tR360-SEMAGLUTIDE-20MG-VIAL\t20 mg\tVial\tUNAVAILABLE
PRH-001\tSemaglutide\tR360-SEMAGLUTIDE-30MG-VIAL\t30 mg\tVial\tUNAVAILABLE
PRH-001\tSemaglutide\tR360-SEMAGLUTIDE-50MG-VIAL\t50 mg\tVial\tUNAVAILABLE
PRH-002\tTirzepatide\tR360-TIRZEPATIDE-10MG-VIAL\t10 mg\tVial\tUNAVAILABLE
PRH-002\tTirzepatide\tR360-TIRZEPATIDE-20MG-VIAL\t20 mg\tVial\tUNAVAILABLE
PRH-002\tTirzepatide\tR360-TIRZEPATIDE-30MG-VIAL\t30 mg\tVial\tUNAVAILABLE
PRH-002\tTirzepatide\tR360-TIRZEPATIDE-60MG-VIAL\t60 mg\tVial\tUNAVAILABLE
PRH-002\tTirzepatide\tR360-TIRZEPATIDE-100MG-VIAL\t100 mg\tVial\tUNAVAILABLE
PRH-002\tTirzepatide\tR360-TIRZEPATIDE-120MG-VIAL\t120 mg\tVial\tUNAVAILABLE
PRH-003\tRetatrutide\tR360-RETATRUTIDE-10MG-VIAL\t10 mg\tVial\tUNAVAILABLE
PRH-003\tRetatrutide\tR360-RETATRUTIDE-15MG-VIAL\t15 mg\tVial\tUNAVAILABLE
PRH-003\tRetatrutide\tR360-RETATRUTIDE-20MG-VIAL\t20 mg\tVial\tUNAVAILABLE
PRH-003\tRetatrutide\tR360-RETATRUTIDE-30MG-VIAL\t30 mg\tVial\tUNAVAILABLE
PRH-003\tRetatrutide\tR360-RETATRUTIDE-50MG-VIAL\t50 mg\tVial\tUNAVAILABLE
PEP-COMP-001\tARA-290 Research Material\tR360-ARA290-10MG-VIAL\t10 mg\tVial\tREQUEST_ACCESS
SUP-COMP-001\tBacteriostatic Water - Laboratory Supply\tR360-BACWATER-3ML\tSterile solution\tSterile solution\tHELD_PENDING_GATES
SUP-COMP-002\tBacteriostatic Water - Laboratory Supply\tR360-BACWATER-10ML\tSterile solution\tSterile solution\tHELD_PENDING_GATES
SUP-COMP-003\tBacteriostatic Water - Laboratory Supply\tR360-BACWATER-30ML\tSterile solution\tSterile solution\tHELD_PENDING_GATES
RAW-001\tBPC-157\tRAW-001\t5 mg\tVial / source presentation\tREQUEST_ACCESS
RAW-002\tCagrilintide\tRAW-002\t10 mg\tVial / source presentation\tHELD_PENDING_GATES
RAW-003\tDSIP\tRAW-003\t10 mg\tVial / source presentation\tREQUEST_ACCESS
RAW-004\tGHK-Cu\tRAW-004\t50 mg\tVial / source presentation\tREQUEST_ACCESS
RAW-005\tHexarelin\tRAW-005\t10 mg\tVial / source presentation\tREQUEST_ACCESS
RAW-006\tKisspeptin\tRAW-006\t10 mg\tVial / source presentation\tREQUEST_ACCESS
RAW-007\tL-Glutathione\tRAW-007\t500 mg\tVial / source presentation\tREQUEST_ACCESS
RAW-008\tOxytocin\tRAW-008\t5 mg\tVial / source presentation\tREQUEST_ACCESS
RAW-009\tSemaglutide\tRAW-009\t5 mg\tVial / source presentation\tUNAVAILABLE
RAW-010\tSermorelin\tRAW-010\t5 mg\tVial / source presentation\tREQUEST_ACCESS
RAW-011\tThymosin Alpha 1\tRAW-011\t10 mg\tVial / source presentation\tREQUEST_ACCESS
RAW-012\tTirzepatide\tRAW-012\t15 mg\tVial / source presentation\tUNAVAILABLE
`.trim();

export const PEPTIDE_MEDIA_PLAN: readonly PeptideMediaPlanEntry[] = MEDIA_ROWS.split("\n").map(
  (line) => {
    const [productId, productName, sku, strength, presentation, sourceActionRaw] = line.split("\t");
    const sourceAction = sourceActionRaw as PeptideSourceAction;
    return {
      productId,
      productName,
      variantId: sku,
      sku,
      strength,
      presentation,
      container: normalizeContainer(presentation),
      template: templateForVariant(sku),
      sourceAction,
      visualState: defaultVisualState(sourceAction),
      sourceWorkbookSha256: PEPTIDE_MEDIA_SOURCE_WORKBOOK_SHA256,
    };
  },
);

export function findPeptideMediaPlanEntry(sku: string): PeptideMediaPlanEntry | null {
  return PEPTIDE_MEDIA_PLAN.find((entry) => entry.sku === sku) ?? null;
}
