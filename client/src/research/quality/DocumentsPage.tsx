import { FileCheck2, KeyRound, LockKeyhole, SearchCheck } from "lucide-react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { NoticeBar, PageIntro } from "../components";
import { LotLookupForm } from "./LotLookupForm";
import { QualityNav } from "./QualityNav";
import "./quality.css";

const DOCUMENT_LANES = [
  {
    icon: SearchCheck,
    title: "Approved public lot records",
    body: "An exact lot lookup may show an approved status summary and explicitly public documents. No approximate match is returned.",
  },
  {
    icon: LockKeyhole,
    title: "Secure account documents",
    body: "Member, order, agreement, and account documents remain behind authenticated, ownership-scoped access controls.",
  },
  {
    icon: FileCheck2,
    title: "Version-aware records",
    body: "Pending, expired, missing, replaced, and withdrawn records stay distinct from currently available documents when their status metadata is explicitly approved for public display.",
  },
] as const;

export default function DocumentsPage() {
  return (
    <div className="quality-page">
      <SeoHead
        title="Quality documents | Xenios Research"
        description="Find approved public lot records or sign in for secure, ownership-scoped account documents."
        path="/research/documents"
      />
      <PageIntro
        eyebrow="Document access"
        title="The right record, through the right door."
        lead="Public lot evidence and private account records serve different audiences. Xenios keeps their access paths, approval states, and disclosure boundaries separate."
      />
      <NoticeBar>
        Public verification exposes only records explicitly approved for public access. It never publishes unapproved or private supplier files, internal review notes, raw storage locations, personal information, or private account documents.
      </NoticeBar>

      <section className="container-x section-y" aria-labelledby="document-lanes-title">
        <p className="mono-cap text-ink-mute mb-5">Access model</p>
        <h2 className="display-s max-w-[20ch]" id="document-lanes-title">Availability is a fact, not a guess.</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
          {DOCUMENT_LANES.map(({ icon: Icon, title, body }) => (
            <article className="card" key={title}>
              <Icon aria-hidden="true" size={21} style={{ color: "var(--quality-copper)" }} />
              <h3 className="h3 mt-8">{title}</h3>
              <p className="body-s text-ink-2 mt-3">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="quality-band" aria-labelledby="document-lookup-title">
        <div className="container-x grid grid-cols-1 lg:grid-cols-[0.7fr_1.3fr] gap-12">
          <div>
            <KeyRound aria-hidden="true" size={22} style={{ color: "#c98a5c" }} />
            <p className="mono-cap text-ink-mute mt-5 mb-4">Public verification</p>
            <h2 className="display-s" id="document-lookup-title">Use the exact lot code.</h2>
          </div>
          <div>
            <LotLookupForm />
            <p className="body-s text-ink-mute mt-5">
              If the public source is unavailable, the result will say so. It will not imply that the lot or document does not exist.
            </p>
          </div>
        </div>
      </section>

      <section className="container-x section-y" aria-labelledby="member-documents-title">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-center card bg-paper-2">
          <div>
            <p className="mono-cap text-ink-mute mb-4">Private records</p>
            <h2 className="h3" id="member-documents-title">Looking for an account document?</h2>
            <p className="body-m text-ink-2 mt-3 max-w-[60ch]">
              Sign in to reach secure documents connected to your membership or account. Authentication does not make a private record public.
            </p>
          </div>
          <Link className="btn btn-primary" href="/research/member/documents">Open secure documents</Link>
        </div>
      </section>

      <QualityNav current="/research/documents" />
    </div>
  );
}
