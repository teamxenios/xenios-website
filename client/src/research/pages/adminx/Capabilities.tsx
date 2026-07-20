import { useEffect, useState } from "react";
import {
  fetchCapabilities,
  statusFor,
  type CapabilityStatus,
  type ResearchCapability,
} from "../../lib/capabilities";
import { ResearchCapabilityBoundary, ResearchLoadingState, ResearchSecureNotice, ResearchStatusBadge } from "../../ui/kit";
import { AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/capabilities: the truth table for every provider-backed
// capability, with admin detail visible (state, admin message, and the NAMES
// of missing environment variables or approvals, never values). When the
// capability registry endpoint is unpublished, every capability honestly
// reports pending; nothing is assumed live.
// ---------------------------------------------------------------------------

const ALL_CAPABILITIES: Array<{ capability: ResearchCapability; label: string; owns: string }> = [
  { capability: "transactional_email", label: "Transactional email", owns: "Application, approval, and activation emails" },
  { capability: "membership_billing", label: "Membership billing", owns: "The $50 activation and the $25 monthly membership" },
  { capability: "product_commerce", label: "Product commerce", owns: "Member ordering against the catalog" },
  { capability: "identity_verification", label: "Identity verification", owns: "Member identity checks" },
  { capability: "telegram_support", label: "Telegram support", owns: "The support channel behind member questions" },
  { capability: "private_media", label: "Private media", owns: "Member photo, voice, and video storage" },
  { capability: "live_shipping_rates", label: "Live shipping rates", owns: "Carrier rates at checkout" },
  { capability: "mitch_fulfillment", label: "Fulfillment", owns: "Warehouse fulfillment of orders" },
  { capability: "affiliate_payouts", label: "Affiliate payouts", owns: "Partner commission payouts" },
  { capability: "quantum_commerce", label: "Quantum", owns: "The Quantum commerce surface" },
  { capability: "referrals", label: "Referrals", owns: "The member referral program" },
  { capability: "tracker", label: "Tracker", owns: "The member daily tracker" },
  { capability: "assessment", label: "Assessment", owns: "The member assessment" },
  { capability: "blueprint", label: "Blueprint", owns: "The member Blueprint" },
  { capability: "questions", label: "Questions", owns: "The member question inbox" },
];

export default function Capabilities() {
  return (
    <AdminScreen
      title="Capabilities"
      lead="Every provider-backed capability and its true state. Missing configuration is named, never valued; a capability is only ever shown enabled because the server said so."
    >
      {(token) => <CapabilitiesBody token={token} />}
    </AdminScreen>
  );
}

function CapabilitiesBody({ token }: { token: string }) {
  const [statuses, setStatuses] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchCapabilities(token).then((s) => {
      if (alive) setStatuses(s);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  if (statuses === null) return <ResearchLoadingState label="Checking capability states" />;

  const enabledCount = ALL_CAPABILITIES.filter((c) => statusFor(statuses, c.capability).state === "enabled").length;

  return (
    <div className="grid gap-6">
      <p className="body-s text-ink-2" aria-live="polite">
        {enabledCount} of {ALL_CAPABILITIES.length} capabilities enabled.
        {enabledCount === 0 &&
          " The registry endpoint may be unpublished; when it is, every capability reports pending rather than guessing."}
      </p>
      <div className="grid gap-4">
        {ALL_CAPABILITIES.map(({ capability, label, owns }) => {
          const status = statusFor(statuses, capability);
          return (
            <section key={capability} aria-label={`${label} capability`}>
              <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
                <p className="body-m font-700">{label}</p>
                <ResearchStatusBadge
                  label={status.state === "enabled" ? "Enabled" : status.state.replace(/_/g, " ")}
                  tone={status.state === "enabled" ? "success" : status.state === "misconfigured" ? "danger" : "pending"}
                />
              </div>
              <p className="body-s text-ink-mute mb-2">{owns}</p>
              <ResearchCapabilityBoundary status={status} showAdminDetail>
                <div className="card">
                  <p className="body-s text-ink-2">
                    Enabled. Member-facing surfaces backed by this capability are live.
                  </p>
                  <p className="body-s text-ink-mute mt-1">Checked {new Date(status.checkedAt).toLocaleString("en-US")}</p>
                </div>
              </ResearchCapabilityBoundary>
            </section>
          );
        })}
      </div>
      <ResearchSecureNotice>
        Admin detail names missing environment variables and approvals. Values never leave the server, and this page
        never displays a secret.
      </ResearchSecureNotice>
    </div>
  );
}
