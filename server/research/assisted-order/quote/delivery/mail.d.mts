export const TEAM: "team@xeniostechnology.com";
export type QuoteTransport = { ready(): boolean; send(key: string, recipient: string): Promise<string> };
export function resendTransport(options: {
  enabled?: boolean;
  apiKey?: string;
  verifiedSender: string;
  verifiedReplyTo: string;
  portalVerified?: boolean;
  portalOrigin?: string;
}): QuoteTransport;
