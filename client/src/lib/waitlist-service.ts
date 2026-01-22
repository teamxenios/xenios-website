import { z } from "zod";

// Define the shape of a waitlist submission
export interface WaitlistSubmission {
  firstName: string;
  email: string;
}

// Define the response shape
export interface WaitlistResponse {
  success: boolean;
  message: string;
}

/**
 * Service to handle waitlist submissions.
 * Currently uses an in-memory mock.
 * To switch to a real provider:
 * 1. Implement a real API endpoint (e.g., /api/waitlist)
 * 2. Update the `submitWaitlist` function to fetch() that endpoint
 */
export const waitlistService = {
  submit: async (data: WaitlistSubmission): Promise<WaitlistResponse> => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mock success/failure logic
    // For demonstration, let's fail if the email is "error@test.com"
    if (data.email === "error@test.com") {
      throw new Error("This email is already on the waitlist or invalid.");
    }

    // Success
    console.log("Waitlist submission received:", data);
    return {
      success: true,
      message: "You've been added to the list.",
    };
  },
};
