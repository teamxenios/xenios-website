// The Care admin console shell. One header, one index of areas, one guard.
//
// The guard wraps the area content, not the shell, so an unauthorized visitor
// still sees a page that explains itself and never sees a Care record.

import type { ReactNode } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { CareAdminGuard } from "./authorization";
import {
  CARE_ADMIN_AREAS,
  type CareAdminArea,
  type CareAdminAreaKey,
} from "./contracts";
import { CareAdminContractList } from "./ui";

export default function CareAdminLayout({
  area,
  activeKey,
  children,
}: {
  area: CareAdminArea;
  activeKey: CareAdminAreaKey;
  children: ReactNode;
}) {
  return (
    <PageShell>
      <SeoHead
        title={`Care admin, ${area.label.toLowerCase()}, xenios`}
        description="Internal Xenios Care administration. Restricted to Care administrators."
        path={area.path}
        robots="noindex, nofollow"
      />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · ADMIN</p>
        <h1 className="display-m max-w-[20ch]">{area.label}</h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">{area.summary}</p>

        <nav className="mt-10" aria-label="Care admin areas">
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {CARE_ADMIN_AREAS.map((entry) => (
              <li key={entry.key}>
                <Link
                  href={entry.path}
                  className="body-m"
                  aria-current={entry.key === activeKey ? "page" : undefined}
                  data-care-admin-nav={entry.key}
                >
                  {entry.label}
                  {entry.reads.length === 0 && (
                    <span className="mono-label text-ink-mute"> · pending</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <CareAdminGuard>
          {children}
          <CareAdminContractList area={area} />
        </CareAdminGuard>
      </div>
    </PageShell>
  );
}
