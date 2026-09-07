import { AccountPortalShell } from "../account-portal/AccountPortalShell";
import { loadAccountDocuments } from "../account-portal/api";
import { AccountResourceBoundary, useAccountResource } from "../account-portal/resource";
import { useDocumentDownload } from "../account-portal/useDocumentDownload";
import { AccountDocumentsView } from "../account-portal/views/DocumentsView";
import { useResearch } from "../core";

export default function AccountDocuments() {
  const { memberToken } = useResearch();
  const snapshot = useAccountResource(loadAccountDocuments, memberToken);
  const download = useDocumentDownload(memberToken);
  return (
    <AccountPortalShell
      eyebrow="Secure records"
      title="Documents in one place."
      lead="Customer-facing receipts, approved COAs, order records, historical billing records, and appropriate Care administration documents."
    >
      <AccountResourceBoundary snapshot={snapshot}>
        {(documents) => <AccountDocumentsView key={memberToken} documents={documents} onDownload={download} />}
      </AccountResourceBoundary>
    </AccountPortalShell>
  );
}
