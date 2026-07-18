// Client presentation adapter only. PR #12 owns the authoritative shared and
// server referral contracts. Keep every feature off until an enabled server
// response supplies authenticated dashboard state and invitation validation.

export type ReferralFeatureAvailability = {
  referralsEnabled: boolean;
  applicantInvitesEnabled: boolean;
  memberCreditsEnabled: boolean;
  socialCardsEnabled: boolean;
  validationEndpointEnabled: boolean;
};

export const REFERRAL_FEATURES_OFF: ReferralFeatureAvailability = {
  referralsEnabled: false,
  applicantInvitesEnabled: false,
  memberCreditsEnabled: false,
  socialCardsEnabled: false,
  validationEndpointEnabled: false,
};

export type AggregateReferralDashboardInput = {
  enabled: boolean;
  code: string | null;
  counts: {
    visits: number;
    applications: number;
    qualified: number;
  };
  creditAvailableCents: number;
  creditPendingCents: number;
};

export type InvitationRouteState = {
  status: "invalid" | "unavailable" | "verified";
  code: string | null;
  applicationHref: string;
  canAttachReferral: boolean;
};

export function parseInvitationCode(value: string | null | undefined): string | null {
  const candidate = (value ?? "").trim().toUpperCase();
  return /^[A-Z0-9-]{6,32}$/.test(candidate) ? candidate : null;
}

export function resolveInvitationRouteState(input: {
  rawCode: string | null | undefined;
  features: ReferralFeatureAvailability;
  serverValidatedCode?: string | null;
}): InvitationRouteState {
  const code = parseInvitationCode(input.rawCode);
  if (!code) {
    return { status: "invalid", code: null, applicationHref: "/research/apply", canAttachReferral: false };
  }

  const validationReady =
    input.features.referralsEnabled &&
    input.features.applicantInvitesEnabled &&
    input.features.validationEndpointEnabled;
  const validatedCode = parseInvitationCode(input.serverValidatedCode);

  if (!validationReady || validatedCode !== code) {
    return { status: "unavailable", code: null, applicationHref: "/research/apply", canAttachReferral: false };
  }

  return {
    status: "verified",
    code,
    applicationHref: `/research/apply?ref=${encodeURIComponent(code)}`,
    canAttachReferral: true,
  };
}

export function resolveAggregateDashboardPresentation(input: {
  features: ReferralFeatureAvailability;
  state?: AggregateReferralDashboardInput | null;
  isDevelopment: boolean;
  previewRequested: boolean;
  previewState?: AggregateReferralDashboardInput;
}) {
  const programEnabled = input.features.referralsEnabled && Boolean(input.state?.enabled);
  const developmentPreview = !programEnabled && input.isDevelopment && input.previewRequested;
  const source = programEnabled ? input.state! : developmentPreview ? input.previewState : null;
  const creditsEnabled = programEnabled && input.features.memberCreditsEnabled;
  const code = programEnabled && input.features.applicantInvitesEnabled && input.features.validationEndpointEnabled
    ? parseInvitationCode(source?.code)
    : null;

  return {
    mode: programEnabled ? "enabled" as const : developmentPreview ? "development-preview" as const : "disabled" as const,
    counts: source?.counts ?? { visits: 0, applications: 0, qualified: 0 },
    creditAvailableCents: creditsEnabled ? source?.creditAvailableCents ?? 0 : 0,
    creditPendingCents: creditsEnabled ? source?.creditPendingCents ?? 0 : 0,
    creditsEnabled,
    code,
    canShare: Boolean(code && input.features.socialCardsEnabled),
  };
}
