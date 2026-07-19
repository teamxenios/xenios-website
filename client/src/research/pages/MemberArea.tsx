import { useEffect, useState, type ReactNode } from "react";
import { Link, Redirect } from "wouter";
import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";
import { useResearch } from "./../core";

// The private member area (canonical architecture): everything here requires
// the member's own sign-in, verified server-side on every API call. The
// shared gateway password never unlocks these pages.

// Client-side route gate. This is presentation only; authorization is the
// server's (requireMember on every member-authed API). Pending members may
// access only the activation flow.
export function RequireMember({ children }: { children: ReactNode }) {
  const { member, memberChecking } = useResearch();
  if (memberChecking) {
    return (
      <div className="container-x" style={{ paddingTop: "var(--space-hero-top)" }}>
        <p className="mono-cap text-ink-mute">xenios research</p>
      </div>
    );
  }
  if (!member) return <Redirect to="/research/sign-in" />;
  if (member.status !== "active") return <Redirect to="/research/activate" />;
  return <>{children}</>;
}

function AreaCard({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <Link href={href} className="card block hover:border-[color:var(--ink)] transition-colors" style={{ textDecoration: "none" }}>
      <p className="body-m font-700">{title}</p>
      <p className="body-s text-ink-2 mt-2">{body}</p>
    </Link>
  );
}

export function MemberHome() {
  const { member } = useResearch();
  return (
    <>
      <SeoHead title="Member home, xenios research" description="Your private xenios research membership." path="/research/member" />
      <PageIntro
        eyebrow="Private membership"
        title={member ? `Welcome back, ${member.firstName}.` : "Welcome back."}
        lead="Your membership, in one place. Everything here is private to your account."
      />
      <section className="container-x pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" style={{ maxWidth: 960 }}>
          <AreaCard title="Products" body="The research catalog: peptides, supplements, and Quantum." href="/research/products" />
          <AreaCard title="Systems" body="Build a complete system around your goal." href="/research/systems" />
          <AreaCard title="Guides" body="Evidence context and how to read the documentation." href="/research/guides" />
          <AreaCard title="Orders" body="Your cart and order history." href="/research/orders" />
          <AreaCard title="Subscriptions" body="Your membership and billing." href="/research/subscriptions" />
          <AreaCard title="Referrals" body="Invite someone you trust." href="/research/referrals" />
        </div>
      </section>
    </>
  );
}

export function Subscriptions() {
  const { member } = useResearch();
  return (
    <>
      <SeoHead title="Subscriptions, xenios research" description="Your xenios research membership and billing." path="/research/subscriptions" />
      <PageIntro
        eyebrow="Membership"
        title="Your membership."
        lead="Membership is a one-time $50 activation plus a $25 monthly membership. There is no annual plan."
      />
      <section className="container-x pb-20">
        <div className="max-w-[560px] space-y-4">
          <div className="card">
            <p className="mono-label text-ink-mute">Status</p>
            <p className="body-l text-ink mt-2">{member?.status === "active" ? "Active" : "Pending activation"}</p>
          </div>
          <div className="card">
            <p className="mono-label text-ink-mute">Billing</p>
            <p className="body-s text-ink-2 mt-2">
              Online billing management is being finalized. To update or cancel your monthly membership, contact support and a person will handle it.
            </p>
            <a href="mailto:research@xeniostechnology.com" className="btn btn-secondary mt-5">Contact support</a>
          </div>
        </div>
      </section>
    </>
  );
}

type ReferralState = {
  enabled: boolean;
  code: string | null;
  eligible?: boolean;
  counts: { visits: number; applications: number; qualified: number };
  creditAvailableCents: number;
  creditPendingCents: number;
};

export function ReferralsPage() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<ReferralState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!memberToken) return;
    let alive = true;
    fetch("/api/research/member/referrals", {
      headers: { Authorization: "Bearer " + memberToken },
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((body) => {
        if (alive && body?.ok) setState(body.referrals as ReferralState);
        else if (alive) setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [memberToken]);

  return (
    <>
      <SeoHead title="Referrals, xenios research" description="Invite someone you trust to xenios research." path="/research/referrals" />
      <PageIntro
        eyebrow="Referrals"
        title="Invite someone you trust."
        lead="Membership grows by invitation between people who know each other."
      />
      <section className="container-x pb-20">
        <div className="max-w-[560px]">
          {!state && !failed && <p className="body-s text-ink-mute">Loading...</p>}
          {failed && <p className="body-s text-ink-mute">Referrals are unavailable right now.</p>}
          {state && !state.enabled && (
            <div className="card">
              <p className="body-m text-ink-2">
                The referral program is not open yet. When it opens, your personal invite link will appear here.
              </p>
            </div>
          )}
          {state && state.enabled && (
            <div className="space-y-4">
              <div className="card">
                <p className="mono-label text-ink-mute">Your invite code</p>
                <p className="display-s tabular mt-2">{state.code ?? "Available after activation"}</p>
              </div>
              <div className="card grid grid-cols-3 gap-4 text-center">
                {([["Applications", state.counts.applications], ["Qualified", state.counts.qualified], ["Credit", `$${(state.creditAvailableCents / 100).toFixed(2)}`]] as const).map(
                  ([label, value]) => (
                    <div key={label}>
                      <p className="display-s tabular">{value}</p>
                      <p className="mono-label text-ink-mute mt-1">{label}</p>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export function ProfilePage() {
  const { member } = useResearch();
  return (
    <>
      <SeoHead title="Profile, xenios research" description="Your xenios research profile." path="/research/profile" />
      <PageIntro eyebrow="Profile" title="Your account." lead="Your membership details, private to you." />
      <section className="container-x pb-20">
        <div className="max-w-[560px] space-y-4">
          <div className="card">
            <p className="mono-label text-ink-mute">Name</p>
            <p className="body-l text-ink mt-2">{member?.firstName ?? ""}</p>
          </div>
          <div className="card">
            <p className="mono-label text-ink-mute">Membership</p>
            <p className="body-l text-ink mt-2">{member?.status === "active" ? "Active" : "Pending activation"}</p>
          </div>
          <div className="card">
            <p className="mono-label text-ink-mute">Changes</p>
            <p className="body-s text-ink-2 mt-2">
              To update your details, change your email, or close your account, contact support and a person will handle it.
            </p>
            <a href="mailto:research@xeniostechnology.com" className="btn btn-secondary mt-5">Contact support</a>
          </div>
        </div>
      </section>
    </>
  );
}
