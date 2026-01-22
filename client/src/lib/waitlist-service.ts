import { z } from "zod";

export interface WaitlistSubmission {
  firstName: string;
  email: string;
  role: string;
  activeClients?: string;
  adminHours?: string;
  dataSources?: string;
  anonymizedDataConsent?: boolean;
  submissionType: "general" | "coach_partner";
}

export interface WaitlistResponse {
  success: boolean;
  message: string;
}

export const waitlistService = {
  submit: async (data: WaitlistSubmission): Promise<WaitlistResponse> => {
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to submit");
      }

      return {
        success: true,
        message: result.message,
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error("Failed to submit");
    }
  },
};
