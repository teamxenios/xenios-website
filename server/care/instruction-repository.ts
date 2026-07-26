import type {
  CareInstructionReadinessFacts,
  CareInstructionSource,
  CareInstructionSourceKind,
  CarePatientInstruction,
  CareSupplyKit,
  CareSupplyReplacement,
  CareSupplySource,
  CareSupplySourceVerificationState,
} from "@shared/care/instructions";
import type { CareRecordId } from "@shared/care/contracts";
import { getSupabaseAdmin } from "../supabase";

type Row = Record<string, unknown>;
const asId = (value: unknown) => String(value) as CareRecordId;
const throwOnError = (error: { message?: string } | null, code: string) => {
  if (error) throw new Error(code);
};

function asSource(row: Row): CareInstructionSource {
  return {
    id: asId(row.id),
    patientId: row.patient_id ? asId(row.patient_id) : null,
    prescriptionId: row.prescription_id ? asId(row.prescription_id) : null,
    kind: row.kind as CareInstructionSourceKind,
    version: Number(row.version),
    sourceReference: String(row.source_reference),
    contentHash: String(row.content_hash),
    content: String(row.content),
    verified: row.verification_state === "verified",
    // A newly returned append-only source is current; supersession is expressed
    // by a later row that points back to it, never by mutating this record.
    supersededAt: null,
    createdAt: String(row.created_at),
  };
}

function asInstruction(row: Row): CarePatientInstruction {
  const links = (row.care_instruction_source_links ?? []) as Row[];
  const acknowledgments = (row.care_instruction_acknowledgments ?? []) as Row[];
  const acknowledged = acknowledgments
    .map((item) => Number(item.instruction_version))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0] ?? null;
  return {
    id: asId(row.id),
    patientId: asId(row.patient_id),
    prescriptionId: asId(row.prescription_id),
    status: row.status as CarePatientInstruction["status"],
    sourceIds: links.map((link) => asId(link.source_id)),
    instructionContent: String(row.instruction_content),
    version: Number(row.version),
    acknowledgedVersion: acknowledged,
    supersedesInstructionId: row.supersedes_instruction_id
      ? asId(row.supersedes_instruction_id)
      : null,
    releasedAt: row.released_at ? String(row.released_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function asKit(row: Row): CareSupplyKit {
  const source = (row.care_supply_sources ?? {}) as Row;
  return {
    id: asId(row.id),
    patientId: asId(row.patient_id),
    prescriptionId: asId(row.prescription_id),
    status: row.status as CareSupplyKit["status"],
    productSpecificDevice: row.product_specific_device
      ? String(row.product_specific_device)
      : null,
    verifiedSupplierReference:
      source.relationship_reference && row.status !== "draft"
        ? String(source.relationship_reference)
        : null,
    replacementCadence: row.replacement_cadence
      ? String(row.replacement_cadence)
      : null,
    version: Number(row.version),
    supersedesSupplyKitId: row.supersedes_supply_kit_id
      ? asId(row.supersedes_supply_kit_id)
      : null,
    releasedAt: row.released_at ? String(row.released_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function asReplacement(row: Row): CareSupplyReplacement {
  return {
    id: asId(row.id),
    supplyKitId: asId(row.supply_kit_id),
    patientId: asId(row.patient_id),
    status: row.status as CareSupplyReplacement["status"],
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function asSupplySource(row: Row): CareSupplySource {
  return {
    id: asId(row.id),
    legalName: row.legal_name ? String(row.legal_name) : null,
    relationshipReference: row.relationship_reference
      ? String(row.relationship_reference)
      : null,
    supportReference: row.support_reference ? String(row.support_reference) : null,
    verificationState:
      row.verification_state as CareSupplySourceVerificationState,
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const INSTRUCTION_COLUMNS =
  "id,patient_id,prescription_id,status,instruction_content,version,supersedes_instruction_id,released_at,created_at,updated_at,care_instruction_source_links(source_id),care_instruction_acknowledgments(instruction_version)";
const KIT_COLUMNS =
  "id,patient_id,prescription_id,status,product_specific_device,replacement_cadence,version,supersedes_supply_kit_id,released_at,created_at,updated_at,care_supply_sources(relationship_reference)";
const REPLACEMENT_COLUMNS =
  "id,supply_kit_id,patient_id,status,version,created_at,updated_at";

export interface CareInstructionRepository {
  listPatientInstructions(patientId: CareRecordId): Promise<CarePatientInstruction[]>;
  listPatientSupplyKits(patientId: CareRecordId): Promise<CareSupplyKit[]>;
  listPatientReplacements(patientId: CareRecordId): Promise<CareSupplyReplacement[]>;
  listAssignedReplacements(operatorUserId: string): Promise<CareSupplyReplacement[]>;
  loadReadiness(prescriptionId: CareRecordId | null): Promise<CareInstructionReadinessFacts>;
  saveSupplySource(input: {
    supplySourceId: CareRecordId | null;
    legalName: string | null;
    relationshipReference: string | null;
    supportReference: string | null;
    verificationState: CareSupplySourceVerificationState;
    adminUserId: string;
    occurredAt: string;
  }): Promise<CareSupplySource>;
  createSource(input: {
    patientId: CareRecordId | null;
    prescriptionId: CareRecordId | null;
    kind: CareInstructionSourceKind;
    sourceReference: string;
    contentHash: string;
    content: string;
    actorUserId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareInstructionSource>;
  createInstructionDraft(input: {
    patientId: CareRecordId;
    prescriptionId: CareRecordId;
    clinicianUserId: string;
    instructionContent: string;
    pharmacyLabelSourceId: CareRecordId;
    pharmacyInformationSourceId: CareRecordId;
    clinicianDirectionSourceId: CareRecordId;
    manufacturerMaterialSourceId: CareRecordId;
    supersedesInstructionId: CareRecordId | null;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CarePatientInstruction>;
  releaseInstruction(input: {
    instructionId: CareRecordId;
    clinicianUserId: string;
    expectedVersion: number;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CarePatientInstruction>;
  acknowledgeInstruction(input: {
    instructionId: CareRecordId;
    patientId: CareRecordId;
    instructionVersion: number;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CarePatientInstruction>;
  createSupplyKit(input: {
    patientId: CareRecordId;
    prescriptionId: CareRecordId;
    instructionId: CareRecordId;
    supplySourceId: CareRecordId;
    productSpecificDevice: string;
    replacementCadence: string;
    adminUserId: string;
    supersedesSupplyKitId: CareRecordId | null;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareSupplyKit>;
  releaseSupplyKit(input: {
    supplyKitId: CareRecordId;
    adminUserId: string;
    expectedVersion: number;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareSupplyKit>;
  requestReplacement(input: {
    supplyKitId: CareRecordId;
    patientId: CareRecordId;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareSupplyReplacement>;
  applyReplacementAction(input: {
    replacementId: CareRecordId;
    actorUserId: string;
    expectedVersion: number;
    action: "approve" | "fulfill" | "decline" | "cancel";
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareSupplyReplacement>;
}

export function buildCareInstructionRepository(): CareInstructionRepository {
  const admin = getSupabaseAdmin();
  const rpcInstruction = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<CarePatientInstruction> => {
    const { data, error } = await admin.rpc(name, args);
    throwOnError(error, "care_instruction_write_failed");
    const row = data as Row;
    const related = await admin
      .from("care_patient_instructions")
      .select(INSTRUCTION_COLUMNS)
      .eq("id", row.id)
      .single();
    throwOnError(related.error, "care_instruction_lookup_failed");
    return asInstruction(related.data as Row);
  };
  return {
    async listPatientInstructions(patientId) {
      const { data, error } = await admin
        .from("care_patient_instructions")
        .select(INSTRUCTION_COLUMNS)
        .eq("patient_id", patientId)
        .neq("status", "draft")
        .order("created_at", { ascending: false });
      throwOnError(error, "care_instruction_lookup_failed");
      return (data ?? []).map((row) => asInstruction(row as Row));
    },
    async listPatientSupplyKits(patientId) {
      const { data, error } = await admin
        .from("care_supply_kits")
        .select(KIT_COLUMNS)
        .eq("patient_id", patientId)
        .neq("status", "draft")
        .order("created_at", { ascending: false });
      throwOnError(error, "care_supply_kit_lookup_failed");
      return (data ?? []).map((row) => asKit(row as Row));
    },
    async listPatientReplacements(patientId) {
      const { data, error } = await admin
        .from("care_supply_replacements")
        .select(REPLACEMENT_COLUMNS)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      throwOnError(error, "care_supply_replacement_lookup_failed");
      return (data ?? []).map((row) => asReplacement(row as Row));
    },
    async listAssignedReplacements(operatorUserId) {
      const operators = await admin
        .from("care_pharmacy_operators")
        .select("pharmacy_id")
        .eq("user_id", operatorUserId)
        .eq("active", true)
        .is("revoked_at", null);
      throwOnError(operators.error, "care_pharmacy_operator_lookup_failed");
      const pharmacyIds = (operators.data ?? []).map((row) => String(row.pharmacy_id));
      if (!pharmacyIds.length) return [];
      const orders = await admin
        .from("care_pharmacy_orders")
        .select("prescription_id")
        .in("assigned_pharmacy_id", pharmacyIds);
      throwOnError(orders.error, "care_pharmacy_order_lookup_failed");
      const prescriptionIds = (orders.data ?? []).map((row) => String(row.prescription_id));
      if (!prescriptionIds.length) return [];
      const kits = await admin
        .from("care_supply_kits")
        .select("id")
        .in("prescription_id", prescriptionIds);
      throwOnError(kits.error, "care_supply_kit_lookup_failed");
      const kitIds = (kits.data ?? []).map((row) => String(row.id));
      if (!kitIds.length) return [];
      const replacements = await admin
        .from("care_supply_replacements")
        .select(REPLACEMENT_COLUMNS)
        .in("supply_kit_id", kitIds)
        .order("updated_at", { ascending: false });
      throwOnError(replacements.error, "care_supply_replacement_lookup_failed");
      return (replacements.data ?? []).map((row) => asReplacement(row as Row));
    },
    async loadReadiness(prescriptionId) {
      const sources = prescriptionId
        ? await admin
            .from("care_instruction_sources")
            .select("kind")
            .eq("prescription_id", prescriptionId)
            .eq("verification_state", "verified")
        : { data: [], error: null };
      throwOnError(sources.error, "care_instruction_readiness_lookup_failed");
      const kinds = new Set((sources.data ?? []).map((row) => String(row.kind)));
      const prescription = prescriptionId
        ? await admin.from("care_prescriptions").select("status").eq("id", prescriptionId).maybeSingle()
        : { data: null, error: null };
      throwOnError(prescription.error, "care_instruction_readiness_lookup_failed");
      const instruction = prescriptionId
        ? await admin.from("care_patient_instructions").select("id").eq("prescription_id", prescriptionId).eq("status", "released").limit(1)
        : { data: [], error: null };
      const kit = prescriptionId
        ? await admin.from("care_supply_kits").select("product_specific_device,replacement_cadence,care_supply_sources(verification_state)").eq("prescription_id", prescriptionId).eq("status", "released").limit(1)
        : { data: [], error: null };
      throwOnError(instruction.error, "care_instruction_readiness_lookup_failed");
      throwOnError(kit.error, "care_instruction_readiness_lookup_failed");
      const kitRow = kit.data?.[0] as Row | undefined;
      const supplySource = (kitRow?.care_supply_sources ?? {}) as Row;
      return {
        prescriptionSigned: prescription.data?.status === "signed",
        pharmacyLabelVerified: kinds.has("pharmacy_label"),
        pharmacyInformationVerified: kinds.has("pharmacy_information"),
        clinicianDirectionVerified: kinds.has("clinician_direction"),
        manufacturerMaterialVerified: kinds.has("manufacturer_material"),
        patientInstructionContentVerified: Boolean(instruction.data?.length),
        patientInstructionReviewed: Boolean(instruction.data?.length),
        productSpecificDeviceVerified: Boolean(kitRow?.product_specific_device),
        supplySourceVerified: supplySource.verification_state === "verified",
        replacementCadenceVerified: Boolean(kitRow?.replacement_cadence),
        publicActivationApproved: false,
      };
    },
    async createSource(input) {
      const { data, error } = await admin.rpc("care_create_instruction_source", {
        p_patient_id: input.patientId,
        p_prescription_id: input.prescriptionId,
        p_kind: input.kind,
        p_source_reference: input.sourceReference,
        p_content_hash: input.contentHash,
        p_content: input.content,
        p_actor_user_id: input.actorUserId,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(error, "care_instruction_source_write_failed");
      return asSource(data as Row);
    },
    createInstructionDraft: (input) =>
      rpcInstruction("care_create_patient_instruction_draft", {
        p_patient_id: input.patientId,
        p_prescription_id: input.prescriptionId,
        p_clinician_user_id: input.clinicianUserId,
        p_instruction_content: input.instructionContent,
        p_pharmacy_label_source_id: input.pharmacyLabelSourceId,
        p_pharmacy_information_source_id: input.pharmacyInformationSourceId,
        p_clinician_direction_source_id: input.clinicianDirectionSourceId,
        p_manufacturer_material_source_id: input.manufacturerMaterialSourceId,
        p_supersedes_instruction_id: input.supersedesInstructionId,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      }),
    releaseInstruction: (input) =>
      rpcInstruction("care_release_patient_instruction", {
        p_instruction_id: input.instructionId,
        p_clinician_user_id: input.clinicianUserId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      }),
    acknowledgeInstruction: (input) =>
      rpcInstruction("care_acknowledge_patient_instruction", {
        p_instruction_id: input.instructionId,
        p_patient_id: input.patientId,
        p_instruction_version: input.instructionVersion,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      }),
    async createSupplyKit(input) {
      const { data, error } = await admin.rpc("care_create_supply_kit", {
        p_patient_id: input.patientId,
        p_prescription_id: input.prescriptionId,
        p_instruction_id: input.instructionId,
        p_supply_source_id: input.supplySourceId,
        p_product_specific_device: input.productSpecificDevice,
        p_replacement_cadence: input.replacementCadence,
        p_admin_user_id: input.adminUserId,
        p_supersedes_supply_kit_id: input.supersedesSupplyKitId,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(error, "care_supply_kit_write_failed");
      return asKit(data as Row);
    },
    async saveSupplySource(input) {
      const { data, error } = await admin.rpc("care_save_supply_source", {
        p_supply_source_id: input.supplySourceId,
        p_legal_name: input.legalName,
        p_relationship_reference: input.relationshipReference,
        p_support_reference: input.supportReference,
        p_verification_state: input.verificationState,
        p_admin_user_id: input.adminUserId,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(error, "care_supply_source_write_failed");
      return asSupplySource(data as Row);
    },
    async releaseSupplyKit(input) {
      const { data, error } = await admin.rpc("care_release_supply_kit", {
        p_supply_kit_id: input.supplyKitId,
        p_admin_user_id: input.adminUserId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(error, "care_supply_kit_write_failed");
      return asKit(data as Row);
    },
    async requestReplacement(input) {
      const { data, error } = await admin.rpc("care_request_supply_replacement", {
        p_supply_kit_id: input.supplyKitId,
        p_patient_id: input.patientId,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(error, "care_supply_replacement_write_failed");
      return asReplacement(data as Row);
    },
    async applyReplacementAction(input) {
      const { data, error } = await admin.rpc("care_apply_supply_replacement_action", {
        p_replacement_id: input.replacementId,
        p_actor_user_id: input.actorUserId,
        p_expected_version: input.expectedVersion,
        p_action: input.action,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(error, "care_supply_replacement_write_failed");
      return asReplacement(data as Row);
    },
  };
}
