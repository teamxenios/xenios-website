import type { InsertWaitlist } from "@shared/schema";

export interface WaitlistResponse {
  success: boolean;
  message?: string;
  position?: number;
  count?: number;
  duplicate?: boolean;
}

export const waitlistService = {
  submit: async (data: InsertWaitlist & { website?: string }): Promise<WaitlistResponse> => {
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) {
      const err = new Error(result.message || "Failed to submit") as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return result;
  },
};

export interface ContactSubmission {
  name: string;
  email: string;
  persona: "practitioner" | "investor" | "journalist_creator" | "integration_partner" | "enterprise" | "candidate" | "other";
  subject: string;
  message: string;
  website?: string;
}

const CONTACT_API_PATH = "/api/contact";
export const HEALTH_CONTACT_API_PATH = "/api/care/contact";
export const HEALTH_CONTACT_CONTEXT_SEARCH = "?context=health";
export const HEALTH_CONTACT_PAGE_PATH = `/contact${HEALTH_CONTACT_CONTEXT_SEARCH}`;

export function isHealthContactContext(search: string): boolean {
  return search === HEALTH_CONTACT_CONTEXT_SEARCH;
}

async function submitContact(
  path: string,
  data: ContactSubmission,
): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.message || "Failed to submit");
  return result;
}

export const contactService = {
  submit: async (data: ContactSubmission): Promise<{ success: boolean; message?: string }> => {
    return submitContact(CONTACT_API_PATH, data);
  },
  submitHealth: async (data: ContactSubmission): Promise<{ success: boolean; message?: string }> => {
    return submitContact(HEALTH_CONTACT_API_PATH, data);
  },
};
