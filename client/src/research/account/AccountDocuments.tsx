import { AccountPortalShell } from "../account-portal/AccountPortalShell";
import { downloadAccountDocument, loadAccountDocuments } from "../account-portal/api";
import { AccountResourceBoundary, useAccountResource } from "../account-portal/resource";
import { AccountDocumentsView } from "../account-portal/views/DocumentsView";
import { useResearch } from "../core";

export default function AccountDocuments() {
  const { memberToken } = useResearch();
  const snapshot = useAccountResource(loadAccountDocuments, memberToken);
  return (
    <AccountPortalShell
      eyebrow="Secure records"
      title="Documents in one place."
      lead="Customer-facing receipts, approved COAs, order records, membership records, and appropriate Care administration documents."
    >
      <AccountResourceBoundary snapshot={snapshot}>
        {(documents) => <AccountDocumentsView documents={documents} onDownload={(path) => downloadAccountDocument(memberToken, path)} />}
      </AccountResourceBoundary>
    </AccountPortalShell>
  );
}
