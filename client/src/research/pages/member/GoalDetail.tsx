import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { formatMoney, useResearch } from "../../core";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchCapabilityBoundary,
  ResearchEmptyState,
  capabilityStatusOrPending,
} from "../../ui/kit";
import { fetchCapabilities, type CapabilityStatus, type ResearchCapability } from "../../lib/capabilities";
import { MEMBER_ROUTES } from "../../lib/routes";
import { findGoal, productsForGoal, RESEARCH_GOALS, type ResearchGoal } from "./goals-data";

// Goal detail: the honest map for one goal. Editorial copy comes from
// goals-data.ts (presentation, allowed in production). The related products
// row is driven ONLY by the real gated catalog via useResearch(); when the
// catalog is not available it renders an honest empty state, never invented
// products. The research-education pathways section is gated behind the
// product_commerce capability.

function slugId(prefix: string, label: string): string {
  return `${prefix}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function BulletSection({ label, items }: { label: string; items: string[] }) {
  const id = slugId("goal-section", label);
  return (
    <section className="card" aria-labelledby={id}>
      <h2 id={id} className="mono-label text-ink-mute">
        {label}
      </h2>
      <ul className="mt-3 grid gap-2" style={{ listStyle: "disc", paddingLeft: "1.1rem" }}>
        {items.map((item) => (
          <li key={item} className="body-s text-ink-2">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RelatedProducts({ goal }: { goal: ResearchGoal }) {
  const { member, products } = useResearch();
  const matches = productsForGoal(products, goal);

  if (products.length === 0) {
    return (
      <ResearchEmptyState
        title="Catalog matches appear here."
        body={
          member
            ? "The catalog has not loaded yet for this session. When it is available, products relevant to this goal appear here automatically."
            : "The product catalog is available to active members. Once your membership is active, products relevant to this goal appear here."
        }
        action={
          <Link href={MEMBER_ROUTES.products} className="btn btn-ghost">
            Go to Products
          </Link>
        }
      />
    );
  }

  if (matches.length === 0) {
    return (
      <ResearchEmptyState
        title="No catalog matches for this goal yet."
        body="Nothing in the current catalog is tagged for this goal. The full catalog is still available to browse."
        action={
          <Link href={MEMBER_ROUTES.products} className="btn btn-ghost">
            Browse all products
          </Link>
        }
      />
    );
  }

  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {matches.map((product) => (
        <li key={product.slug}>
          <Link
            href={MEMBER_ROUTES.product.replace(":slug", product.slug)}
            className="card block h-full"
            style={{ textDecoration: "none" }}
            data-testid={`goal-product-${product.slug}`}
          >
            <p className="mono-label text-ink-mute">{product.eyebrow}</p>
            <p className="body-m font-700 mt-1">{product.name}</p>
            <p className="body-s text-ink-2 mt-2">{product.summary}</p>
            <p className="body-s tabular text-ink-mute mt-3">{formatMoney(product.priceCents)}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function GoalDetail() {
  const params = useParams<{ slug: string }>();
  const goal = findGoal(params.slug);
  const { memberToken } = useResearch();
  const [capabilities, setCapabilities] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);

  // One capability fetch per page load (the module caches for a minute).
  useEffect(() => {
    let alive = true;
    void fetchCapabilities(memberToken).then((statuses) => {
      if (alive) setCapabilities(statuses);
    });
    return () => {
      alive = false;
    };
  }, [memberToken]);

  if (!goal) {
    return (
      <ResearchMemberShell
        eyebrow="Shop by Goal"
        title="Goal not found"
        lead="That goal does not exist. The full list of goals is one click away."
      >
        <ResearchEmptyState
          title="We could not find that goal."
          body={`There are ${RESEARCH_GOALS.length} goals to choose from, and none of them match this address.`}
          action={
            <Link href={MEMBER_ROUTES.goals} className="btn btn-primary">
              Back to all goals
            </Link>
          }
        />
      </ResearchMemberShell>
    );
  }

  const commerceStatus = capabilityStatusOrPending(capabilities, "product_commerce");

  return (
    <ResearchMemberShell
      eyebrow="Shop by Goal"
      title={goal.name}
      lead={goal.plainLanguageGoal}
      actions={
        <Link href={MEMBER_ROUTES.goals} className="btn btn-ghost">
          All goals
        </Link>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <BulletSection label="Lifestyle foundation" items={goal.lifestyleFoundation} />
        <BulletSection label="Fitness considerations" items={goal.fitnessConsiderations} />
        <BulletSection label="Nutrition considerations" items={goal.nutritionConsiderations} />
        <section className="card" aria-labelledby="goal-supplement-categories">
          <h2 id="goal-supplement-categories" className="mono-label text-ink-mute">
            Supplement categories
          </h2>
          <p className="body-s text-ink-2 mt-2">
            Categories only. These name areas of the catalog worth reading about, not specific products or doses.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {goal.supplementCategories.map((category) => (
              <li key={category}>
                <span className="chip text-ink-2">{category}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card mt-6" aria-labelledby="goal-honesty">
        <h2 id="goal-honesty" className="mono-label text-ink-mute">
          What xenios does not promise
        </h2>
        <p className="body-s text-ink-2 mt-2 max-w-[64ch]">{goal.whatXeniosDoesNotPromise}</p>
      </section>

      <section className="mt-8" aria-labelledby="goal-pathways">
        <h2 id="goal-pathways" className="body-l font-700">
          Research-education pathways
        </h2>
        <div className="mt-3">
          <ResearchCapabilityBoundary status={commerceStatus}>
            <div className="card">
              <p className="body-s text-ink-2 max-w-[64ch]">
                Ordering is open. If this goal is your current focus, review the matched products below, read the
                related guides, and use the assessment so your choices rest on your own data rather than a
                category page.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={MEMBER_ROUTES.products} className="btn btn-secondary">
                  Open the catalog
                </Link>
              </div>
            </div>
          </ResearchCapabilityBoundary>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="goal-products">
        <h2 id="goal-products" className="body-l font-700">
          Related products
        </h2>
        <p className="body-s text-ink-mute mt-1">From the live catalog, matched to this goal by tag and category.</p>
        <div className="mt-4">
          <RelatedProducts goal={goal} />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="goal-guides">
        <h2 id="goal-guides" className="body-l font-700">
          Related guide topics
        </h2>
        <p className="body-s text-ink-mute mt-1">Look for these in the Guides library.</p>
        <ul className="mt-3 flex flex-wrap gap-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {goal.relatedGuideTopics.map((topic) => (
            <li key={topic}>
              <Link href={MEMBER_ROUTES.guides} className="chip text-ink-2" style={{ textDecoration: "none" }}>
                {topic}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <Link href={MEMBER_ROUTES.guides} className="btn btn-ghost">
            Open the Guides
          </Link>
        </div>
      </section>

      <section className="card mt-8" aria-labelledby="goal-assessment">
        <h2 id="goal-assessment" className="body-m font-700">
          Not sure this is the right starting goal?
        </h2>
        <p className="body-s text-ink-2 mt-2 max-w-[60ch]">
          The assessment walks through where you are today and helps order your priorities, so the first thing you
          work on is the one most likely to matter.
        </p>
        <div className="mt-4">
          <Link href={MEMBER_ROUTES.assessment} className="btn btn-primary">
            Take the assessment
          </Link>
        </div>
      </section>
    </ResearchMemberShell>
  );
}
