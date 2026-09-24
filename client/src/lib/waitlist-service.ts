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

export const contactService = {
  submit: async (data: ContactSubmission): Promise<{ success: boolean; message?: string; autoReplySent?: boolean }> => {
    const uncertain = "Receipt is not confirmed. Your message may already have been accepted. Keep the same details and retry shortly; unchanged retries within 24 hours are protected against duplicate email.";
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = async () => {
      let res: Response;
      let result: { success: boolean; message?: string; autoReplySent?: boolean };
      try {
        res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          signal: controller.signal,
        });
        result = await res.json();
      } catch {
        throw new Error(uncertain);
      }
      if (!res.ok || result.success !== true) throw new Error(result.message || uncertain);
      return result;
    };
    try {
      return await Promise.race([request(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new Error(uncertain)); controller.abort(); }, 20_000);
      })]);
    } finally {
      clearTimeout(timer);
    }
  },
};
