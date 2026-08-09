/**
 * Display-only peptide roadmap rows transcribed from the master offerings
 * workbook tab "08 Peptides All" on 2026-08-09.
 *
 * This file contains no price, cost, supplier, margin, release, hold, or
 * purchase authority. liveSku is present only for the 70 exact SKU matches
 * confirmed by the Session 7 audit; it is a join key, never an authorization.
 */

export type PeptideRoadmapSourceAvailability =
  | "Approval required"
  | "Request access"
  | "Unavailable"
  | "Research approval or request access"
  | "Research hold / Care evaluation required"
  | "Care only / Research unavailable"
  | "Planning / supplier quote needed";

export type PeptideRoadmapSourceRow = Readonly<{
  catalogId: string;
  productCode: string;
  displayName: string;
  family: string;
  strength: string | null;
  format: string;
  sourceAvailability: PeptideRoadmapSourceAvailability;
  liveSku: string | null;
}>;

type RoadmapTuple = readonly [
  catalogId: string,
  productCode: string,
  displayName: string,
  family: string,
  strength: string | null,
  format: string,
  sourceAvailability: PeptideRoadmapSourceAvailability,
  liveSku: string | null,
];

const ROADMAP_TUPLES: readonly RoadmapTuple[] = [
  ["R360-BPC157_TB500-15MG_15MG-VIAL", "PEP-001", "BPC-157 + TB-500 Research Blend", "Research blend", "15 mg / 15 mg", "Vial", "Approval required", "R360-BPC157_TB500-15MG_15MG-VIAL"],
  ["R360-BPC157_TB500_GHKCU-10MG_10MG_50MG-VIAL", "PEP-002", "BPC-157 + TB-500 + GHK-Cu Research Blend", "Research blend", "10 mg / 10 mg / 50 mg", "Vial", "Approval required", "R360-BPC157_TB500_GHKCU-10MG_10MG_50MG-VIAL"],
  ["R360-TB500_BPC157_GHKCU_KPV-5MG_5MG_10MG_5MG-VIAL", "PEP-003", "KLOW Research Blend", "Research blend", "5 mg / 5 mg / 10 mg / 5 mg", "Vial", "Approval required", "R360-TB500_BPC157_GHKCU_KPV-5MG_5MG_10MG_5MG-VIAL"],
  ["R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL", "PEP-004", "Thymosin Alpha-1 + KPV + LL-37 Research Blend", "Research blend", "5 mg / 5 mg / 5 mg", "Vial", "Approval required", "R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL"],
  ["R360-CJC1295_IPAMORELIN-5MG_5MG-VIAL", "PEP-005", "CJC-1295 + Ipamorelin Research Blend", "Research blend", "5 mg / 5 mg", "Vial", "Approval required", "R360-CJC1295_IPAMORELIN-5MG_5MG-VIAL"],
  ["R360-CJC1295_IPAMORELIN-20MG-VIAL", "PEP-005", "CJC-1295 + Ipamorelin Research Blend", "Research blend", "20 mg", "Vial", "Request access", "R360-CJC1295_IPAMORELIN-20MG-VIAL"],
  ["R360-PT141-10MG-VIAL", "PEP-006", "PT-141 Research Material", "Research peptide / material", "10 mg", "Vial", "Approval required", "R360-PT141-10MG-VIAL"],
  ["R360-TESAMORELIN-10MG-VIAL", "PEP-007", "Tesamorelin Research Material", "Research peptide / material", "10 mg", "Vial", "Approval required", "R360-TESAMORELIN-10MG-VIAL"],
  ["R360-TESAMORELIN-20MG-VIAL", "PEP-007", "Tesamorelin Research Material", "Research peptide / material", "20 mg", "Vial", "Request access", "R360-TESAMORELIN-20MG-VIAL"],
  ["R360-GONADORELIN-5MG-VIAL", "PEP-008", "Gonadorelin Research Material", "Research peptide / material", "5 mg", "Vial", "Approval required", "R360-GONADORELIN-5MG-VIAL"],
  ["R360-NAD-500MG-VIAL", "PEP-009", "NAD+ Research Material", "Research compound", "500 mg", "Vial", "Approval required", "R360-NAD-500MG-VIAL"],
  ["R360-NAD-1000MG-VIAL", "PEP-009", "NAD+ Research Material", "Research compound", "1000 mg", "Vial", "Request access", "R360-NAD-1000MG-VIAL"],
  ["R360-MOTSC-10MG-VIAL", "PEP-010", "MOTS-C Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-MOTSC-10MG-VIAL"],
  ["R360-MOTSC-40MG-VIAL", "PEP-010", "MOTS-C Research Material", "Research peptide / material", "40 mg", "Vial", "Request access", "R360-MOTSC-40MG-VIAL"],
  ["R360-EPITHALON-10MG-VIAL", "PEP-011", "Epithalon Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-EPITHALON-10MG-VIAL"],
  ["R360-EPITHALON-100MG-VIAL", "PEP-011", "Epithalon Research Material", "Research peptide / material", "100 mg", "Vial", "Request access", "R360-EPITHALON-100MG-VIAL"],
  ["R360-SS31-10MG-VIAL", "PEP-012", "SS-31 Research Material", "Research peptide / material", "10 mg", "Vial", "Approval required", "R360-SS31-10MG-VIAL"],
  ["R360-SS31-50MG-VIAL", "PEP-012", "SS-31 Research Material", "Research peptide / material", "50 mg", "Vial", "Request access", "R360-SS31-50MG-VIAL"],
  ["R360-SLUPP332-250MCGX100-CAP", "PEP-013", "SLU-PP-332 Research Capsules", "Research capsule", "250 mcg", "Capsule bottle", "Approval required", "R360-SLUPP332-250MCGX100-CAP"],
  ["R360-DIHEXA-10MGX60-CAP", "PEP-014", "Dihexa Research Capsules", "Research capsule", "10 mg", "Capsule bottle", "Approval required", "R360-DIHEXA-10MGX60-CAP"],
  ["R360-SEMAX_SELANK_DSIP-10MG_10MG_2MG-VIAL", "PEP-015", "Semax + Selank + DSIP Research Blend", "Research blend", "10 mg / 10 mg / 2 mg", "Vial", "Request access", "R360-SEMAX_SELANK_DSIP-10MG_10MG_2MG-VIAL"],
  ["R360-BPC157-10MG-VIAL", "PEX-001", "BPC-157 Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-BPC157-10MG-VIAL"],
  ["R360-BPC157-20MG-VIAL", "PEX-001", "BPC-157 Research Material", "Research peptide / material", "20 mg", "Vial", "Request access", "R360-BPC157-20MG-VIAL"],
  ["R360-TB500-10MG-VIAL", "PEX-002", "TB-500 Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-TB500-10MG-VIAL"],
  ["R360-GHKCU-100MG-VIAL", "PEX-003", "GHK-Cu Research Material", "Research peptide / material", "100 mg", "Vial", "Request access", "R360-GHKCU-100MG-VIAL"],
  ["R360-KPV-10MG-VIAL", "PEX-004", "KPV Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-KPV-10MG-VIAL"],
  ["R360-SEMAX-10MG-VIAL", "PEX-005", "Semax Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-SEMAX-10MG-VIAL"],
  ["R360-SEMAX-30MG-VIAL", "PEX-005", "Semax Research Material", "Research peptide / material", "30 mg", "Vial", "Request access", "R360-SEMAX-30MG-VIAL"],
  ["R360-SELANK-10MG-VIAL", "PEX-006", "Selank Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-SELANK-10MG-VIAL"],
  ["R360-DSIP-15MG-VIAL", "PEX-007", "DSIP Research Material", "Research peptide / material", "15 mg", "Vial", "Request access", "R360-DSIP-15MG-VIAL"],
  ["R360-THYMOSINALPHA1-10MG-VIAL", "PEX-008", "Thymosin Alpha-1 Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-THYMOSINALPHA1-10MG-VIAL"],
  ["R360-IPAMORELIN-10MG-VIAL", "PEX-009", "Ipamorelin Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-IPAMORELIN-10MG-VIAL"],
  ["R360-5AMINO1MQ-5MG-VIAL", "PEX-010", "5-Amino-1MQ Research Material", "Research compound", "5 mg", "Vial", "Request access", "R360-5AMINO1MQ-5MG-VIAL"],
  ["R360-5AMINO1MQ-50MG-VIAL", "PEX-010", "5-Amino-1MQ Research Material", "Research compound", "50 mg", "Vial", "Request access", "R360-5AMINO1MQ-50MG-VIAL"],
  ["R360-ADAMAX-10MG-VIAL", "PEX-011", "Adamax Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-ADAMAX-10MG-VIAL"],
  ["R360-AOD9604-5MG-VIAL", "PEX-012", "AOD-9604 Research Material", "Research peptide / material", "5 mg", "Vial", "Request access", "R360-AOD9604-5MG-VIAL"],
  ["R360-AOD9604-10MG-VIAL", "PEX-012", "AOD-9604 Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-AOD9604-10MG-VIAL"],
  ["R360-CJC1295DAC-5MG-VIAL", "PEX-013", "CJC-1295 with DAC Research Material", "Research peptide / material", "5 mg", "Vial", "Request access", "R360-CJC1295DAC-5MG-VIAL"],
  ["R360-FOLLISTATIN-1MG-VIAL", "PEX-014", "Follistatin Research Material", "Research peptide / material", "1 mg", "Vial", "Request access", "R360-FOLLISTATIN-1MG-VIAL"],
  ["R360-GLUTATHIONE-600MG-VIAL", "PEX-015", "Glutathione Research Material", "Research compound", "600 mg", "Vial", "Request access", "R360-GLUTATHIONE-600MG-VIAL"],
  ["R360-GLUTATHIONE-1500MG-VIAL", "PEX-015", "Glutathione Research Material", "Research compound", "1500 mg", "Vial", "Request access", "R360-GLUTATHIONE-1500MG-VIAL"],
  ["R360-HCG-5000IU-VIAL", "PEX-016", "HCG Research Material", "Hormone / clinical material", "5000 IU", "Vial", "Request access", "R360-HCG-5000IU-VIAL"],
  ["R360-IGF1LR3-0P1MG-VIAL", "PEX-017", "IGF-1 LR3 Research Material", "Research peptide / material", "0.1 mg", "Vial", "Request access", "R360-IGF1LR3-0P1MG-VIAL"],
  ["R360-IGF1LR3-1MG-VIAL", "PEX-017", "IGF-1 LR3 Research Material", "Research peptide / material", "1 mg", "Vial", "Request access", "R360-IGF1LR3-1MG-VIAL"],
  ["R360-KISSPEPTIN10-10MG-VIAL", "PEX-018", "Kisspeptin-10 Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-KISSPEPTIN10-10MG-VIAL"],
  ["R360-LCARNITINE-600MG-VIAL", "PEX-019", "L-Carnitine Research Material", "Research compound", "600 mg", "Vial", "Request access", "R360-LCARNITINE-600MG-VIAL"],
  ["R360-LIPOC-100MG-VIAL", "PEX-020", "LIPO-C Research Material", "Research compound", "100 mg", "Vial", "Request access", "R360-LIPOC-100MG-VIAL"],
  ["R360-MELANOTAN1-10MG-VIAL", "PEX-021", "Melanotan I Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-MELANOTAN1-10MG-VIAL"],
  ["R360-MELANOTAN2-10MG-VIAL", "PEX-022", "Melanotan II Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-MELANOTAN2-10MG-VIAL"],
  ["R360-SERMORELIN-10MG-VIAL", "PEX-023", "Sermorelin Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-SERMORELIN-10MG-VIAL"],
  ["R360-THYMALIN-10MG-VIAL", "PEX-024", "Thymalin Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-THYMALIN-10MG-VIAL"],
  ["R360-VIP-10MG-VIAL", "PEX-025", "VIP Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", "R360-VIP-10MG-VIAL"],
  ["R360-SEMAX_SELANK-10MG-VIAL", "PEX-026", "Semax + Selank Research Blend", "Research blend", "10 mg", "Vial", "Request access", "R360-SEMAX_SELANK-10MG-VIAL"],
  ["R360-TESAMORELIN_IPAMORELIN-15MG-VIAL", "PEX-027", "Tesamorelin + Ipamorelin Research Blend", "Research blend", "15 mg", "Vial", "Request access", "R360-TESAMORELIN_IPAMORELIN-15MG-VIAL"],
  ["R360-SEMAGLUTIDE-10MG-VIAL", "PRH-001", "Semaglutide", "Prescription / investigational metabolic drug", "10 mg", "Vial", "Unavailable", "R360-SEMAGLUTIDE-10MG-VIAL"],
  ["R360-SEMAGLUTIDE-15MG-VIAL", "PRH-001", "Semaglutide", "Prescription / investigational metabolic drug", "15 mg", "Vial", "Unavailable", "R360-SEMAGLUTIDE-15MG-VIAL"],
  ["R360-SEMAGLUTIDE-20MG-VIAL", "PRH-001", "Semaglutide", "Prescription / investigational metabolic drug", "20 mg", "Vial", "Unavailable", "R360-SEMAGLUTIDE-20MG-VIAL"],
  ["R360-SEMAGLUTIDE-30MG-VIAL", "PRH-001", "Semaglutide", "Prescription / investigational metabolic drug", "30 mg", "Vial", "Unavailable", "R360-SEMAGLUTIDE-30MG-VIAL"],
  ["R360-SEMAGLUTIDE-50MG-VIAL", "PRH-001", "Semaglutide", "Prescription / investigational metabolic drug", "50 mg", "Vial", "Unavailable", "R360-SEMAGLUTIDE-50MG-VIAL"],
  ["R360-TIRZEPATIDE-10MG-VIAL", "PRH-002", "Tirzepatide", "Prescription / investigational metabolic drug", "10 mg", "Vial", "Unavailable", "R360-TIRZEPATIDE-10MG-VIAL"],
  ["R360-TIRZEPATIDE-20MG-VIAL", "PRH-002", "Tirzepatide", "Prescription / investigational metabolic drug", "20 mg", "Vial", "Unavailable", "R360-TIRZEPATIDE-20MG-VIAL"],
  ["R360-TIRZEPATIDE-30MG-VIAL", "PRH-002", "Tirzepatide", "Prescription / investigational metabolic drug", "30 mg", "Vial", "Unavailable", "R360-TIRZEPATIDE-30MG-VIAL"],
  ["R360-TIRZEPATIDE-60MG-VIAL", "PRH-002", "Tirzepatide", "Prescription / investigational metabolic drug", "60 mg", "Vial", "Unavailable", "R360-TIRZEPATIDE-60MG-VIAL"],
  ["R360-TIRZEPATIDE-100MG-VIAL", "PRH-002", "Tirzepatide", "Prescription / investigational metabolic drug", "100 mg", "Vial", "Unavailable", "R360-TIRZEPATIDE-100MG-VIAL"],
  ["R360-TIRZEPATIDE-120MG-VIAL", "PRH-002", "Tirzepatide", "Prescription / investigational metabolic drug", "120 mg", "Vial", "Unavailable", "R360-TIRZEPATIDE-120MG-VIAL"],
  ["R360-RETATRUTIDE-10MG-VIAL", "PRH-003", "Retatrutide", "Prescription / investigational metabolic drug", "10 mg", "Vial", "Unavailable", "R360-RETATRUTIDE-10MG-VIAL"],
  ["R360-RETATRUTIDE-15MG-VIAL", "PRH-003", "Retatrutide", "Prescription / investigational metabolic drug", "15 mg", "Vial", "Unavailable", "R360-RETATRUTIDE-15MG-VIAL"],
  ["R360-RETATRUTIDE-20MG-VIAL", "PRH-003", "Retatrutide", "Prescription / investigational metabolic drug", "20 mg", "Vial", "Unavailable", "R360-RETATRUTIDE-20MG-VIAL"],
  ["R360-RETATRUTIDE-30MG-VIAL", "PRH-003", "Retatrutide", "Prescription / investigational metabolic drug", "30 mg", "Vial", "Unavailable", "R360-RETATRUTIDE-30MG-VIAL"],
  ["R360-RETATRUTIDE-50MG-VIAL", "PRH-003", "Retatrutide", "Prescription / investigational metabolic drug", "50 mg", "Vial", "Unavailable", "R360-RETATRUTIDE-50MG-VIAL"],
  ["R360-ARA290-10MG-VIAL", "PEP-COMP-001", "ARA-290 Research Material", "Research peptide / material", "10 mg", "Vial", "Request access", null],
  ["R360-BACWATER-3ML", "SUP-COMP-001", "Bacteriostatic Water - Laboratory Supply", "Laboratory supply", null, "Sterile solution", "Approval required", null],
  ["R360-BACWATER-10ML", "SUP-COMP-002", "Bacteriostatic Water - Laboratory Supply", "Laboratory supply", null, "Sterile solution", "Approval required", null],
  ["R360-BACWATER-30ML", "SUP-COMP-003", "Bacteriostatic Water - Laboratory Supply", "Laboratory supply", null, "Sterile solution", "Approval required", null],
  ["RAW-001", "RAW-001", "BPC-157", "Raw Peptides box-of-10 source", "5 mg", "Vial / source presentation", "Research approval or request access", null],
  ["RAW-002", "RAW-002", "Cagrilintide", "Raw Peptides box-of-10 source", "10 mg", "Vial / source presentation", "Research hold / Care evaluation required", null],
  ["RAW-003", "RAW-003", "DSIP", "Raw Peptides box-of-10 source", "10 mg", "Vial / source presentation", "Research approval or request access", null],
  ["RAW-004", "RAW-004", "GHK-Cu", "Raw Peptides box-of-10 source", "50 mg", "Vial / source presentation", "Research approval or request access", null],
  ["RAW-005", "RAW-005", "Hexarelin", "Raw Peptides box-of-10 source", "10 mg", "Vial / source presentation", "Research approval or request access", null],
  ["RAW-006", "RAW-006", "Kisspeptin", "Raw Peptides box-of-10 source", "10 mg", "Vial / source presentation", "Research approval or request access", null],
  ["RAW-007", "RAW-007", "L-Glutathione", "Raw Peptides box-of-10 source", "500 mg", "Vial / source presentation", "Research approval or request access", null],
  ["RAW-008", "RAW-008", "Oxytocin", "Raw Peptides box-of-10 source", "5 mg", "Vial / source presentation", "Research approval or request access", null],
  ["RAW-009", "RAW-009", "Semaglutide", "Raw Peptides box-of-10 source", "5 mg", "Vial / source presentation", "Care only / Research unavailable", null],
  ["RAW-010", "RAW-010", "Sermorelin", "Raw Peptides box-of-10 source", "5 mg", "Vial / source presentation", "Research approval or request access", null],
  ["RAW-011", "RAW-011", "Thymosin Alpha 1", "Raw Peptides box-of-10 source", "10 mg", "Vial / source presentation", "Research approval or request access", null],
  ["RAW-012", "RAW-012", "Tirzepatide", "Raw Peptides box-of-10 source", "15 mg", "Vial / source presentation", "Care only / Research unavailable", null],
  ["XAC-001-10MG-VIAL", "XAC-001", "GLP-3 (RT)", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-001-20MG-VIAL", "XAC-001", "GLP-3 (RT)", "Research peptide", "20MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-001-30MG-VIAL", "XAC-001", "GLP-3 (RT)", "Research peptide", "30MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-002-30MG-VIAL", "XAC-002", "GLP-2 (TR)", "Research peptide", "30MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-002-60MG-VIAL", "XAC-002", "GLP-2 (TR)", "Research peptide", "60MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-003-10MG-VIAL", "XAC-003", "GLP-1 (SM)", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-004-50MG-VIAL", "XAC-004", "GHK-Cu", "Research peptide", "50MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-004-100MG-VIAL", "XAC-004", "GHK-Cu", "Research peptide", "100MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-005-10MG-VIAL", "XAC-005", "Tesamorlin", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-006-15MG-SPRAY", "XAC-006", "Melanotan II Spray", "Research peptide spray", "15MG", "Spray", "Planning / supplier quote needed", null],
  ["XAC-007-5MG-VIAL", "XAC-007", "LL-37", "Research peptide", "5MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-008-20MG-VIAL", "XAC-008", "Cartalax", "Research peptide", "20MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-009-10MG-VIAL", "XAC-009", "Sermorelin", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-010-10MG-VIAL", "XAC-010", "Kisspeptin", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-011-10MG-VIAL", "XAC-011", "Dihexa", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-012-10MG-VIAL", "XAC-012", "VIP", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-013-10MG-VIAL", "XAC-013", "ARA-290", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-014-15MG-SPRAY", "XAC-014", "DSIP Spray", "Research peptide spray", "15MG", "Spray", "Planning / supplier quote needed", null],
  ["XAC-015-15MG-SPRAY", "XAC-015", "Adalank Spray", "Research peptide spray", "15MG", "Spray", "Planning / supplier quote needed", null],
  ["XAC-016-15MG-SPRAY", "XAC-016", "Adamax Spray", "Research peptide spray", "15MG", "Spray", "Planning / supplier quote needed", null],
  ["XAC-017-30MG-SPRAY", "XAC-017", "BPC-157/TB-500 Spray (Wolverine)", "Research peptide spray", "30MG", "Spray Blend", "Planning / supplier quote needed", null],
  ["XAC-018-15MG-SPRAY", "XAC-018", "BPC-157 Spray", "Research peptide spray", "15MG", "Spray", "Planning / supplier quote needed", null],
  ["XAC-019-10MG-VIAL", "XAC-019", "Pinealon", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-020-50MG-VIAL", "XAC-020", "AHK-Cu", "Research peptide", "50MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-021-10MG-VIAL", "XAC-021", "MOTS-C", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-021-40MG-VIAL", "XAC-021", "MOTS-C", "Research peptide", "40MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-022-500MG-VIAL", "XAC-022", "NAD+", "Research peptide", "500MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-023-10MG-BLEND", "XAC-023", "CJC-1295 / Ipamorelin (No DAC)", "Research blend", "10MG", "Blend / Stack", "Planning / supplier quote needed", null],
  ["XAC-024-10MG-VIAL", "XAC-024", "BPC-157", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-025-10ML-SUPPLY", "XAC-025", "Amino H2O", "Research supply", "10mL", "Research Supply", "Planning / supplier quote needed", null],
  ["XAC-025-30ML-SUPPLY", "XAC-025", "Amino H2O", "Research supply", "30mL", "Research Supply", "Planning / supplier quote needed", null],
  ["XAC-026-10MG-VIAL", "XAC-026", "KPV", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-027-80MG-BLEND", "XAC-027", "KLOW", "Research blend", "80MG", "Blend / Stack", "Planning / supplier quote needed", null],
  ["XAC-028-10MG-VIAL", "XAC-028", "SEMAX", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-029-1500MG-VIAL", "XAC-029", "Glutathione", "Research peptide", "1500MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-030-10MG-VIAL", "XAC-030", "Melanotan II", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-031-70MG-BLEND", "XAC-031", "GLOW", "Research blend", "70MG", "Blend / Stack", "Planning / supplier quote needed", null],
  ["XAC-032-10MG-VIAL", "XAC-032", "SELANK", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-033-10MG-VIAL", "XAC-033", "Melanotan I", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-034-10MG-VIAL", "XAC-034", "TB-500", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-035-1MG-VIAL", "XAC-035", "IGF-1 LR3", "Research peptide", "1MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-036-50MG-VIAL", "XAC-036", "5-Amino-1MQ", "Research peptide", "50MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-037-10MG-BLEND", "XAC-037", "BPC-157/TB-500 (Wolverine)", "Research blend", "10MG", "Blend / Stack", "Planning / supplier quote needed", null],
  ["XAC-037-20MG-BLEND", "XAC-037", "BPC-157/TB-500 (Wolverine)", "Research blend", "20MG", "Blend / Stack", "Planning / supplier quote needed", null],
  ["XAC-038-10MG-VIAL", "XAC-038", "PT-141", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-039-10MG-VIAL", "XAC-039", "Cagrilintide", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-040-5MG-VIAL", "XAC-040", "AOD-9604", "Research peptide", "5MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-041-5MG-VIAL", "XAC-041", "DSIP", "Research peptide", "5MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-042-10MG-VIAL", "XAC-042", "Epithalon", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-043-10MG-VIAL", "XAC-043", "Ipamorelin", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-044-10MG-VIAL", "XAC-044", "SNAP-8", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-045-10MG-VIAL", "XAC-045", "Thymosin Alpha-1", "Research peptide", "10MG", "Lyophilized / Standard", "Planning / supplier quote needed", null],
  ["XAC-046-25MG-SPRAY", "XAC-046", "GHK-Cu SPRAY", "Research peptide spray", "25MG", "Spray", "Planning / supplier quote needed", null],
  ["XAC-047-750MG-SPRAY", "XAC-047", "NAD+ SPRAY", "Research peptide spray", "750MG", "Spray", "Planning / supplier quote needed", null],
  ["XAC-048-25MG-SPRAY", "XAC-048", "SEMAX SPRAY", "Research peptide spray", "25MG", "Spray", "Planning / supplier quote needed", null],
  ["XAC-049-20MG-SPRAY", "XAC-049", "SELANK SPRAY", "Research peptide spray", "20MG", "Spray", "Planning / supplier quote needed", null],
  ["XAC-050-15MG-SPRAY", "XAC-050", "PT-141 SPRAY", "Research peptide spray", "15MG", "Spray", "Planning / supplier quote needed", null],
];

export const PEPTIDE_ROADMAP_ROWS: readonly PeptideRoadmapSourceRow[] =
  Object.freeze(
    ROADMAP_TUPLES.map(
      ([catalogId, productCode, displayName, family, strength, format, sourceAvailability, liveSku]) =>
        Object.freeze({
          catalogId,
          productCode,
          displayName,
          family,
          strength,
          format,
          sourceAvailability,
          liveSku,
        }),
    ),
  );

export const PEPTIDE_ROADMAP_AUDIT = Object.freeze({
  roadmapVariants: 143,
  exactProductControlMatches: 70,
  unmapped: 73,
  ambiguous: 0,
  aminoPlanningVariants: 57,
  aminoLiveProductControlMatches: 0,
});
