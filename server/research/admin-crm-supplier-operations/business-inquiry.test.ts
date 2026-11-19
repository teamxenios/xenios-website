import { describe, expect, it, vi } from "vitest";
import { BusinessInquiryService, type BusinessInquiryRepository } from "./business-inquiry";

const ACTOR = "10000000-0000-4000-8000-000000000001";
const ORG = "20000000-0000-4000-8000-000000000001";
const enquiry = {
  contactName: "Synthetic", contactEmail: "synthetic@example.invalid", organizationName: "Synthetic Organization",
  organizationType: "research", location: "Texas", categories: ["research"], selections: [],
  packagingPreference: "not_sure", siteCount: 1, replenishment: "not_sure", services: [],
};
function setup() {
  const repository: BusinessInquiryRepository = { submit: vi.fn(), list: vi.fn(), read: vi.fn(), assign: vi.fn(), listOrganization: vi.fn() };
  return { repository, service: new BusinessInquiryService(repository) };
}
describe("business enquiry service ownership boundary", () => {
  it("hashes domain-separated trusted context and attempt, normalizes input without leaking selectors", async () => {
    const { service, repository } = setup();
    await service.submit({ ownerContext: "a".repeat(40) }, "b".repeat(32), enquiry);
    const command = vi.mocked(repository.submit).mock.calls[0][0];
    expect(command).toMatchObject({ actorId: null, organizationId: null, enquiry });
    expect(command.ownerHash).toMatch(/^[a-f0-9]{64}$/);
    expect(command.attemptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(command.ownerHash).not.toContain("a".repeat(40));
    await service.submit({ ownerContext: "c".repeat(40) }, "b".repeat(32), enquiry);
    expect(vi.mocked(repository.submit).mock.calls[1][0].ownerHash).not.toBe(command.ownerHash);
    expect(vi.mocked(repository.submit).mock.calls[1][0].attemptHash).toBe(command.attemptHash);
  });
  it("passes verified organization binding separately from public content", async () => {
    const { service, repository } = setup();
    await service.submit({ ownerContext: "a".repeat(40), actorId: ACTOR, organizationId: ORG }, "b".repeat(32), enquiry);
    expect(repository.submit).toHaveBeenCalledWith(expect.objectContaining({ actorId: ACTOR, organizationId: ORG }));
  });
  it("rejects missing context and incomplete organization binding before persistence", async () => {
    const { service, repository } = setup();
    await expect(service.submit({ ownerContext: "short" }, "b".repeat(32), enquiry)).rejects.toMatchObject({ code: "not_permitted" });
    await expect(service.submit({ ownerContext: "a".repeat(40), actorId: ACTOR }, "b".repeat(32), enquiry)).rejects.toMatchObject({ code: "not_permitted" });
    expect(repository.submit).not.toHaveBeenCalled();
  });
  it("refuses invalid payload and attempt without writes", async () => {
    const { service, repository } = setup();
    await expect(service.submit({ ownerContext: "a".repeat(40) }, "short", enquiry)).rejects.toMatchObject({ code: "invalid_request" });
    await expect(service.submit({ ownerContext: "a".repeat(40) }, "b".repeat(32), { ...enquiry, assignedTo: ACTOR })).rejects.toMatchObject({ code: "invalid_request" });
    expect(repository.submit).not.toHaveBeenCalled();
  });
  it("does not replace durable conflicts or outages with synthetic success", async () => {
    const { service, repository } = setup();
    vi.mocked(repository.submit).mockRejectedValue(new Error("Synthetic lost transport reply"));
    await expect(service.submit({ ownerContext: "a".repeat(40) }, "b".repeat(32), enquiry)).rejects.toThrow("lost transport");
  });
  it("bounds staff pagination and assignment before calling the SQL authority", async () => {
    const { service, repository } = setup();
    expect(() => service.list(ACTOR, "not-a-cursor")).toThrow("invalid_request");
    expect(() => service.assign(ACTOR, ORG, { commandId: ORG, expectedRevision: 0, assignedTo: null })).toThrow("invalid_request");
    expect(repository.assign).not.toHaveBeenCalled();
    await service.listOrganization(ACTOR, ORG);
    expect(repository.listOrganization).toHaveBeenCalledWith(ACTOR, ORG, null);
  });
});
