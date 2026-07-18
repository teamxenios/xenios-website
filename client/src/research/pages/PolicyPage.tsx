import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import SeoHead from "@/components/SeoHead";
import type { Policy } from "@shared/research/types";
import { fetchPolicies } from "../core";
import { PageIntro } from "../components";

export default function PolicyPage() {
  const params = useParams<{ policy: string }>();
  const [policies, setPolicies] = useState<Record<string, Policy> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPolicies().then((result) => {
      if (!alive) return;
      if (result) setPolicies(result);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const policy = params.policy && policies ? policies[params.policy] : undefined;

  if (failed || (policies && !policy)) {
    return (
      <section className="container-x" style={{ paddingTop: 96, paddingBottom: 96 }}>
        <p className="mono-cap text-ink-mute mb-5">Not found</p>
        <h1 className="display-s">That policy is not available.</h1>
        <Link href="/research" className="btn btn-secondary mt-8">Back to research</Link>
      </section>
    );
  }

  if (!policy) {
    return <section className="container-x" style={{ paddingTop: 96, paddingBottom: 96 }} aria-busy="true" />;
  }

  return (
    <>
      <SeoHead title={`${policy.title}, xenios research`} description={`${policy.title} for the xenios research section.`} path={`/research/policies/${params.policy}`} />
      <PageIntro eyebrow={`Updated ${policy.updated}`} title={policy.title} />
      <section className="container-x pb-20">
        <div className="max-w-[72ch] space-y-10">
          {policy.sections.map((section) => (
            <div key={section.heading}>
              <h2 className="h3 mb-3">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="body-m text-ink-2 mb-3">{paragraph}</p>
              ))}
              {section.bullets && (
                <ul className="mt-2 space-y-2">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="body-s text-ink-2 flex gap-3">
                      <span aria-hidden="true" className="bg-orange-fire shrink-0 mt-2" style={{ width: 6, height: 6, borderRadius: 9999 }} />
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
