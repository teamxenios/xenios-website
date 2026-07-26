import { describe, expect, it } from "vitest";
import { SUPPLEMENT_PLACEHOLDERS } from "./supplements";
import {
  DEFAULT_METABOLIC_PATHWAYS,
  MemoryMetabolicInterestStore,
  MetabolicInterestService,
  MetabolicPathwayRepository,
  toPublicMetabolicPathway,
} from "./metabolic-care";

describe("supplement placeholders", () => {
  it("creates only truthful coming-soon category placeholders", () => {
    expect(SUPPLEMENT_PLACEHOLDERS.map((item) => item.category)).toEqual([
      "foundational",
      "performance",
      "longevity",
      "specialty",
    ]);
    for (const item of SUPPLEMENT_PLACEHOLDERS) {
      expect(item).toMatchObject({
        status: "coming_soon",
        brand: null,
        priceCents: null,
        stockState: null,
        servingInstructions: null,
        claims: [],
      });
      expect(Object.keys(item.channelMetadata).sort()).toEqual(
        [
          "affiliate",
          "wholesale",
          "professional_dispensary",
          "partner_fulfilled",
          "private_label",
        ].sort(),
      );
    }
  });
});

describe("pending metabolic pathways", () => {
  it("publishes all three exact cards and keeps the internal alias private", () => {
    const publicRows = DEFAULT_METABOLIC_PATHWAYS.map(toPublicMetabolicPathway);
    expect(publicRows.map((row) => row.publicName)).toEqual([
      "GLP-1 Pathway",
      "GLP-2 Pathway",
      "Next-Generation Multi-Agonist Pathway",
    ]);
    const publicJson = JSON.stringify(publicRows);
    expect(publicJson).not.toContain("GLP-3");
    expect(publicJson).not.toContain("placeholder");
    expect(publicJson).not.toContain("price");
    expect(publicJson).not.toContain("dose");
    expect(publicJson).not.toContain("inventory");
    expect(publicJson).not.toContain("administration");
  });

  it("does not imply GLP-2 has the same use as GLP-1", () => {
    const glp2 = DEFAULT_METABOLIC_PATHWAYS[1];
    expect(glp2.publicCopy).toContain("clinical and product-definition review");
    expect(glp2.publicCopy).not.toContain("same");
    expect(glp2.publicCopy).not.toContain("weight");
  });

  it("lets administrators find the internal alias without returning it publicly", () => {
    const repository = new MetabolicPathwayRepository();
    expect(repository.searchAdmin("GLP-3")).toHaveLength(1);
    expect(JSON.stringify(repository.listPublic())).not.toContain("GLP-3");
  });

  it("allows every public field and link to be updated after clinician review", async () => {
    const repository = new MetabolicPathwayRepository();
    const next = await repository.update(
      "glp_1_pathway",
      {
        publicName: "Updated clinician pathway",
        publicStatus: "Updated status",
        publicCopy: "Updated clinician-approved copy.",
        actions: {
          joinInterestHref: "/interest",
          exploreCareHref: "/care",
          askQuestionHref: "/questions",
        },
      },
      "admin@example.com",
      "2026-07-29T10:00:00.000Z",
    );
    expect(next).toMatchObject({
      publicName: "Updated clinician pathway",
      publicStatus: "Updated status",
      publicCopy: "Updated clinician-approved copy.",
      updatedBy: "admin@example.com",
    });
  });

  it("collects only interest-list fields and is idempotent", async () => {
    const store = new MemoryMetabolicInterestStore();
    const service = new MetabolicInterestService(
      store,
      () => new Date("2026-07-25T12:00:00.000Z"),
    );
    const input = {
      pathwayId: "glp_1_pathway" as const,
      currentState: "IL",
      generalGoalCategory: "care_pathway_updates" as const,
      preferredContact: "email" as const,
      interestDate: "2026-07-25",
      attributionSource: "metabolic_card",
      idempotencyKey: "interest-key-123456",
    };
    expect((await service.join("member_1", input)).created).toBe(true);
    expect((await service.join("member_1", input)).created).toBe(false);
    expect(store.records).toHaveLength(1);
    expect(Object.keys(store.records[0]).sort()).toEqual(
      [
        "interestId",
        "memberId",
        "pathwayId",
        "currentState",
        "generalGoalCategory",
        "preferredContact",
        "interestDate",
        "attributionSource",
        "idempotencyKey",
        "createdAt",
      ].sort(),
    );
  });

  it.each([
    [{ idempotencyKey: "" }, "idempotencyKey"],
    [{ idempotencyKey: "x".repeat(161) }, "idempotencyKey"],
    [{ currentState: "ZZ" }, "currentState"],
    [{ interestDate: "2026-02-30" }, "interestDate"],
    [{ interestDate: "2026-07-26" }, "interestDate"],
  ])("rejects invalid interest input before persistence lookup", async (patch, message) => {
    let lookups = 0;
    const store = {
      async findByIdempotency() {
        lookups += 1;
        return null;
      },
      async save() {
        throw new Error("save should not run");
      },
    };
    const service = new MetabolicInterestService(
      store,
      () => new Date("2026-07-25T12:00:00.000Z"),
    );
    await expect(
      service.join("member_1", {
        pathwayId: "glp_1_pathway",
        currentState: "IL",
        generalGoalCategory: "care_pathway_updates",
        preferredContact: "email",
        interestDate: "2026-07-25",
        attributionSource: "metabolic_card",
        idempotencyKey: "interest-key-123456",
        ...patch,
      }),
    ).rejects.toThrow(message);
    expect(lookups).toBe(0);
  });
});
