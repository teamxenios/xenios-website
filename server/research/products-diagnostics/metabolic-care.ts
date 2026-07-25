import crypto from "crypto";
import { Website3ValidationError } from "./errors";

export const US_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
] as const;
export type UsStateCode = (typeof US_STATE_CODES)[number];

const US_STATE_CODE_SET = new Set<string>(US_STATE_CODES);
const MAX_IDEMPOTENCY_KEY_LENGTH = 160;

export const METABOLIC_GOAL_CATEGORIES = [
  "general_metabolic_health",
  "weight_management_interest",
  "care_pathway_updates",
  "other_general_goal",
] as const;
export type MetabolicGoalCategory = (typeof METABOLIC_GOAL_CATEGORIES)[number];

export const PREFERRED_CONTACT_METHODS = ["email", "phone", "text"] as const;
export type PreferredContactMethod = (typeof PREFERRED_CONTACT_METHODS)[number];

export interface MetabolicPathwayConfig {
  pathwayId: "glp_1_pathway" | "glp_2_pathway" | "next_generation_multi_agonist";
  publicName: string;
  internalSearchAliases: string[];
  publicStatus: string;
  publicCopy: string;
  actions: {
    joinInterestHref: string;
    exploreCareHref: string;
    askQuestionHref: string;
  };
  adminEditable: true;
  updatedAt: string;
  updatedBy: string | null;
}

export interface PublicMetabolicPathway {
  pathwayId: MetabolicPathwayConfig["pathwayId"];
  publicName: string;
  publicStatus: string;
  publicCopy: string;
  actions: MetabolicPathwayConfig["actions"];
}

export const DEFAULT_METABOLIC_PATHWAYS: readonly MetabolicPathwayConfig[] = [
  {
    pathwayId: "glp_1_pathway",
    publicName: "GLP-1 Pathway",
    internalSearchAliases: [],
    publicStatus: "Pending clinician launch",
    publicCopy:
      "Clinician-guided metabolic evaluation and treatment options are being prepared through the separate Xenios Care pathway.",
    actions: {
      joinInterestHref: "/research/member/metabolic-interest?pathway=glp_1_pathway",
      exploreCareHref: "/care",
      askQuestionHref: "/research/member/questions?topic=metabolic-care",
    },
    adminEditable: true,
    updatedAt: "2026-07-25T00:00:00.000Z",
    updatedBy: null,
  },
  {
    pathwayId: "glp_2_pathway",
    publicName: "GLP-2 Pathway",
    internalSearchAliases: [],
    publicStatus: "Pending clinician definition",
    publicCopy:
      "This pathway remains under clinical and product-definition review. Details will publish only after the medical team confirms the intended service, eligibility, product, and follow-up model.",
    actions: {
      joinInterestHref: "/research/member/metabolic-interest?pathway=glp_2_pathway",
      exploreCareHref: "/care",
      askQuestionHref: "/research/member/questions?topic=metabolic-care",
    },
    adminEditable: true,
    updatedAt: "2026-07-25T00:00:00.000Z",
    updatedBy: null,
  },
  {
    pathwayId: "next_generation_multi_agonist",
    publicName: "Next-Generation Multi-Agonist Pathway",
    internalSearchAliases: ["GLP-3 placeholder"],
    publicStatus: "Pending clinician and regulatory review",
    publicCopy:
      "Next-generation multi-receptor metabolic pathways are being evaluated. Availability, eligibility, product selection, and timing will depend on clinician review and the status of the underlying therapy.",
    actions: {
      joinInterestHref:
        "/research/member/metabolic-interest?pathway=next_generation_multi_agonist",
      exploreCareHref: "/care",
      askQuestionHref: "/research/member/questions?topic=metabolic-care",
    },
    adminEditable: true,
    updatedAt: "2026-07-25T00:00:00.000Z",
    updatedBy: null,
  },
] as const;

export function toPublicMetabolicPathway(
  pathway: MetabolicPathwayConfig,
): PublicMetabolicPathway {
  return {
    pathwayId: pathway.pathwayId,
    publicName: pathway.publicName,
    publicStatus: pathway.publicStatus,
    publicCopy: pathway.publicCopy,
    actions: { ...pathway.actions },
  };
}

export class MetabolicPathwayRepository {
  private readonly pathways = new Map(
    DEFAULT_METABOLIC_PATHWAYS.map((pathway) => [
      pathway.pathwayId,
      structuredClone(pathway),
    ]),
  );

  listPublic(): PublicMetabolicPathway[] {
    return Array.from(this.pathways.values()).map(toPublicMetabolicPathway);
  }

  searchAdmin(query: string): MetabolicPathwayConfig[] {
    const normalized = query.trim().toLowerCase();
    return Array.from(this.pathways.values())
      .filter((pathway) =>
        [
          pathway.publicName,
          pathway.publicStatus,
          ...pathway.internalSearchAliases,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      )
      .map((pathway) => structuredClone(pathway));
  }

  async update(
    pathwayId: MetabolicPathwayConfig["pathwayId"],
    patch: Partial<
      Pick<
        MetabolicPathwayConfig,
        "publicName" | "publicStatus" | "publicCopy" | "actions" | "internalSearchAliases"
      >
    >,
    actor: string,
    at: string,
  ): Promise<MetabolicPathwayConfig> {
    const current = this.pathways.get(pathwayId);
    if (!current) throw new Website3ValidationError("Metabolic pathway not found");
    const next: MetabolicPathwayConfig = {
      ...current,
      ...structuredClone(patch),
      pathwayId,
      adminEditable: true,
      updatedAt: at,
      updatedBy: actor,
    };
    this.pathways.set(pathwayId, next);
    return structuredClone(next);
  }
}

export interface MetabolicInterestRecord {
  interestId: string;
  memberId: string;
  pathwayId: MetabolicPathwayConfig["pathwayId"];
  currentState: UsStateCode;
  generalGoalCategory: MetabolicGoalCategory;
  preferredContact: PreferredContactMethod;
  interestDate: string;
  attributionSource: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface MetabolicInterestStore {
  findByIdempotency(memberId: string, idempotencyKey: string): Promise<MetabolicInterestRecord | null>;
  save(record: MetabolicInterestRecord): Promise<void>;
}

export class MemoryMetabolicInterestStore implements MetabolicInterestStore {
  readonly records: MetabolicInterestRecord[] = [];

  async findByIdempotency(
    memberId: string,
    idempotencyKey: string,
  ): Promise<MetabolicInterestRecord | null> {
    return (
      this.records.find(
        (record) =>
          record.memberId === memberId && record.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  async save(record: MetabolicInterestRecord): Promise<void> {
    this.records.push(structuredClone(record));
  }
}

export type JoinMetabolicInterestInput = Omit<
  MetabolicInterestRecord,
  "interestId" | "memberId" | "createdAt" | "currentState"
> & { currentState: string };

export class MetabolicInterestService {
  constructor(
    private readonly store: MetabolicInterestStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async join(
    memberId: string,
    input: JoinMetabolicInterestInput,
  ): Promise<{ created: boolean; record: MetabolicInterestRecord }> {
    const idempotencyKey = input.idempotencyKey.trim();
    if (
      idempotencyKey.length === 0 ||
      idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
    ) {
      throw new Website3ValidationError(
        `idempotencyKey must contain 1-${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
      );
    }
    if (!US_STATE_CODE_SET.has(input.currentState)) {
      throw new Website3ValidationError("currentState must be a valid US state code");
    }
    if (!METABOLIC_GOAL_CATEGORIES.includes(input.generalGoalCategory)) {
      throw new Website3ValidationError("generalGoalCategory is invalid");
    }
    if (!PREFERRED_CONTACT_METHODS.includes(input.preferredContact)) {
      throw new Website3ValidationError("preferredContact is invalid");
    }
    if (!DEFAULT_METABOLIC_PATHWAYS.some((pathway) => pathway.pathwayId === input.pathwayId)) {
      throw new Website3ValidationError("pathwayId is invalid");
    }
    const interestDate = input.interestDate.trim();
    const parsedInterestDate = new Date(`${interestDate}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(interestDate) ||
      Number.isNaN(parsedInterestDate.getTime()) ||
      parsedInterestDate.toISOString().slice(0, 10) !== interestDate ||
      interestDate > this.now().toISOString().slice(0, 10)
    ) {
      throw new Website3ValidationError(
        "interestDate must be a valid, non-future YYYY-MM-DD date",
      );
    }
    const existing = await this.store.findByIdempotency(memberId, idempotencyKey);
    if (existing) return { created: false, record: existing };

    const record: MetabolicInterestRecord = {
      interestId: crypto.randomUUID(),
      memberId,
      pathwayId: input.pathwayId,
      currentState: input.currentState as UsStateCode,
      generalGoalCategory: input.generalGoalCategory,
      preferredContact: input.preferredContact,
      interestDate,
      attributionSource: input.attributionSource.slice(0, 120),
      idempotencyKey,
      createdAt: this.now().toISOString(),
    };
    await this.store.save(record);
    return { created: true, record };
  }
}
