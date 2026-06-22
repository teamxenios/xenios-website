import { Link, useRoute } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import {
  CAREERS_ROLES,
  COHORT_ROLES,
  EQUAL_OPPORTUNITY_STATEMENT,
  OPEN_ROLES,
  careerApplyHref,
  careerDescription,
  type CareerRole,
} from "@/lib/careers";

const CAREERS_SEO = {
  title: "Careers, xenios",
  description: "Open founding roles and the founding coach cohort at xenios.",
  path: "/careers",
};

function RoleCard({ role }: { role: CareerRole }) {
  return (
    <article className="rule-all p-6 md:p-8 rounded-[16px] bg-paper" data-testid={`role-${role.slug}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="mono-cap text-ink-mute mb-3">{role.type}</p>
          <h3 className="display-s mb-2">{role.title}</h3>
          <p className="body-m text-ink-mute mb-4">{role.tagline}</p>
          <p className="body-l text-ink-2 max-w-[58ch]">{role.summary}</p>
          <p className="body-s text-ink-mute mt-5">{role.location}</p>
        </div>
        <div className="flex flex-col sm:flex-row md:flex-col gap-3 md:min-w-[190px]">
          <Link href={`/careers/${role.slug}`} className="btn btn-secondary text-center">
            View details
          </Link>
          <a href={careerApplyHref(role)} className="btn btn-primary text-center" data-testid={`button-apply-${role.slug}`}>
            Apply by email
          </a>
        </div>
      </div>
    </article>
  );
}

function JobPostingJsonLd({ role }: { role: CareerRole }) {
  if (role.group !== "open") return null;

  const json = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: role.title,
    description: careerDescription(role),
    datePosted: "2026-06-22",
    employmentType: "CONTRACTOR",
    hiringOrganization: {
      "@type": "Organization",
      name: "Xenios Technologies, Inc.",
      sameAs: "https://xeniostechnology.com",
    },
    applicantLocationRequirements: {
      "@type": "Country",
      name: role.location.includes("US") ? "United States" : "Remote",
    },
    jobLocationType: "TELECOMMUTE",
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}

function DetailBlocks({ role }: { role: CareerRole }) {
  return (
    <div className="space-y-6">
      {role.detail.map((block, index) => {
        if (block.kind === "heading") {
          return <h2 key={`${block.text}-${index}`} className="display-s pt-4">{block.text}</h2>;
        }
        if (block.kind === "list") {
          return (
            <ul key={`list-${index}`} className="space-y-3">
              {block.items.map((item) => (
                <li key={item} className="body-m text-ink-2 grid grid-cols-[16px_1fr] gap-3">
                  <span className="text-pulse mt-1">→</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        return <p key={`${block.text.slice(0, 32)}-${index}`} className="body-l text-ink-2">{block.text}</p>;
      })}
    </div>
  );
}

export function CareersRole() {
  const [, params] = useRoute<{ slug: string }>("/careers/:slug");
  const role = CAREERS_ROLES.find((item) => item.slug === params?.slug);

  if (!role) {
    return (
      <PageShell>
        <SeoHead title="Role not found, xenios" description="That xenios role is not listed." path="/careers" />
        <section className="container-x pt-24 md:pt-36 pb-20">
          <p className="mono-cap text-ink-mute mb-6">CAREERS</p>
          <h1 className="display-xl text-balance mb-8">Role not found.</h1>
          <Link href="/careers" className="btn btn-primary">Back to careers</Link>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <SeoHead title={`${role.title}, xenios`} description={role.summary} path={`/careers/${role.slug}`} />
      <JobPostingJsonLd role={role} />
      <section className="container-x pt-24 md:pt-36 pb-12">
        <Link href="/careers" className="body-s text-ink-mute hover:text-ink transition-colors">Back to careers</Link>
        <p className="mono-cap text-ink-mute mt-10 mb-6">{role.type}</p>
        <h1 className="display-xl text-balance max-w-[14ch]">{role.title}</h1>
        <p className="mt-6 body-l text-ink-2 max-w-[62ch]">{role.summary}</p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <a href={careerApplyHref(role)} className="btn btn-primary" data-testid={`button-apply-detail-${role.slug}`}>
            Apply by email
          </a>
          <a href="mailto:team@xeniostechnology.com" className="btn btn-secondary">
            Ask a question
          </a>
        </div>
      </section>

      <section className="container-x py-12 rule-top">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rule-all rounded-[14px] p-5">
            <p className="mono-cap text-ink-mute mb-2">TYPE</p>
            <p className="body-m text-ink-2">{role.type}</p>
          </div>
          <div className="rule-all rounded-[14px] p-5">
            <p className="mono-cap text-ink-mute mb-2">LOCATION</p>
            <p className="body-m text-ink-2">{role.location}</p>
          </div>
          <div className="rule-all rounded-[14px] p-5">
            <p className="mono-cap text-ink-mute mb-2">APPLY</p>
            <p className="body-m text-ink-2">team@xeniostechnology.com</p>
          </div>
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <article className="max-w-[78ch]">
          <DetailBlocks role={role} />
        </article>
      </section>

      <section className="container-x py-12 rule-top">
        <p className="body-s text-ink-mute max-w-[90ch]">{EQUAL_OPPORTUNITY_STATEMENT}</p>
      </section>
    </PageShell>
  );
}

export default function Careers() {
  return (
    <PageShell>
      <SeoHead {...CAREERS_SEO} />
      {OPEN_ROLES.map((role) => <JobPostingJsonLd key={role.slug} role={role} />)}

      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">CAREERS</p>
        <h1 className="display-xl text-balance max-w-[18ch]">Build the operating system behind proactive health.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[64ch]">
          xenios is hiring builders who can turn trust, attention, and professional judgment into real infrastructure. The professional stays in front. The AI carries the work behind them.
        </p>
      </section>

      <section className="container-x py-16 rule-top">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
          <div>
            <p className="mono-cap text-ink-mute mb-4">OPEN ROLES</p>
            <h2 className="display-m max-w-[18ch]">Paid founding roles.</h2>
          </div>
          <p className="body-m text-ink-mute max-w-[42ch]">Contract to full-time roles for people who want to shape the product, system, and company from the first real wedge.</p>
        </div>
        <div className="space-y-6">
          {OPEN_ROLES.map((role) => <RoleCard key={role.slug} role={role} />)}
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <div className="rounded-[24px] bg-ink text-paper p-6 md:p-10">
          <p className="mono-cap text-paper/60 mb-4">FOUNDING COACH COHORT</p>
          <h2 className="display-m text-paper max-w-[20ch] mb-5">Build with the first coaches.</h2>
          <p className="body-m text-paper/70 max-w-[60ch] mb-8">
            This is a founding cohort with free early access, not a salaried role. It is for coaches who want to test Hercules and the Studio with real client context and shape the product before public launch.
          </p>
          <div className="space-y-6">
            {COHORT_ROLES.map((role) => (
              <article key={role.slug} className="rounded-[16px] border border-paper/20 p-6 md:p-8" data-testid={`role-${role.slug}`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="mono-cap text-paper/60 mb-3">{role.type}</p>
                    <h3 className="display-s text-paper mb-2">{role.title}</h3>
                    <p className="body-m text-paper/60 mb-4">{role.tagline}</p>
                    <p className="body-l text-paper/80 max-w-[58ch]">{role.summary}</p>
                    <p className="body-s text-paper/60 mt-5">{role.location}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row md:flex-col gap-3 md:min-w-[190px]">
                    <Link href={`/careers/${role.slug}`} className="btn btn-secondary text-center">
                      View details
                    </Link>
                    <a href={careerApplyHref(role)} className="btn btn-primary btn-on-dark text-center" data-testid={`button-apply-${role.slug}`}>
                      Apply by email
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="container-x py-12 rule-top">
        <p className="body-s text-ink-mute max-w-[90ch]">{EQUAL_OPPORTUNITY_STATEMENT}</p>
      </section>
    </PageShell>
  );
}
