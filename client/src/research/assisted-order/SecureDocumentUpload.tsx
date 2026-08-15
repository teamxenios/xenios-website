import { ChangeEvent, useState } from "react";
import type {
  AssistedOrderDocumentSide,
  AssistedOrderDocumentType,
} from "../../../../shared/research/assisted-order/contract";
import {
  createAssistedOrderUploadTicket,
  uploadAssistedOrderDocument,
} from "./api";

export function SecureDocumentUpload(props: {
  requestId: string;
  publicReference: string;
  statusToken?: string;
  onUploaded: () => void;
}) {
  const [documentType, setDocumentType] =
    useState<AssistedOrderDocumentType>("government_id");
  const [side, setSide] = useState<AssistedOrderDocumentSide>("front");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    setMessage(null);
    setFile(event.target.files?.[0] ?? null);
  };

  const upload = async () => {
    if (!file) {
      setMessage("Choose a document first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const ticket = await createAssistedOrderUploadTicket(props.requestId, {
        publicReference: props.publicReference,
        statusToken: props.statusToken,
        documentType,
        side,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      await uploadAssistedOrderDocument(ticket, file, {
        publicReference: props.publicReference,
        statusToken: props.statusToken,
      });
      setMessage("Document received securely.");
      setFile(null);
      props.onUploaded();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The document could not be uploaded.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="xenios-order-panel">
      <h2>Secure document upload</h2>
      <p>
        Upload documents only when Xenios has requested them. Files are stored
        privately and are never attached to notification email.
      </p>
      <div className="xenios-order-grid">
        <label>
          Document type
          <select
            value={documentType}
            onChange={(event) =>
              setDocumentType(event.target.value as AssistedOrderDocumentType)
            }
          >
            <option value="government_id">Government ID</option>
            <option value="business_document">Business document</option>
            <option value="other">Other requested document</option>
          </select>
        </label>
        <label>
          Side
          <select
            value={side}
            onChange={(event) =>
              setSide(event.target.value as AssistedOrderDocumentSide)
            }
          >
            <option value="front">Front</option>
            <option value="back">Back</option>
            <option value="single">Single file</option>
          </select>
        </label>
        <label className="is-wide">
          File
          <input
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            onChange={pickFile}
          />
        </label>
      </div>
      {message ? <p role="status">{message}</p> : null}
      <div className="xenios-order-actions">
        <button
          className="xenios-order-button"
          type="button"
          onClick={upload}
          disabled={busy || !file}
        >
          {busy ? "Uploading securely…" : "Upload document"}
        </button>
      </div>
    </section>
  );
}
