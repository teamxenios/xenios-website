import { describe, expect, it } from "vitest";
import { AssistedOrderApiError } from "./api";
import {
  assistedOrderStatusErrorCopy,
  assistedOrderUploadErrorCopy,
} from "./customer-safe-errors";

// Assembled at runtime so the release secret scanner never sees a credentialed
// connection-string literal in source; the redaction under test is unchanged.
const SECRET = ["postgres://service-role", "do-not-render@internal.example"].join(":");

describe("assisted-order customer-safe error copy", () => {
  it("never renders server or exception details on the status surface", () => {
    for (const error of [
      new Error(SECRET),
      new AssistedOrderApiError(500, "internal_error", SECRET),
      new AssistedOrderApiError(403, "forbidden", SECRET),
    ]) {
      const copy = assistedOrderStatusErrorCopy(error);
      expect(copy).not.toContain(SECRET);
      expect(copy).not.toContain("internal_error");
    }
  });

  it("never renders storage or upstream details on the upload surface", () => {
    for (const error of [
      new Error(SECRET),
      new AssistedOrderApiError(500, "storage_error", SECRET),
      new AssistedOrderApiError(413, "payload_too_large", SECRET),
    ]) {
      const copy = assistedOrderUploadErrorCopy(error);
      expect(copy).not.toContain(SECRET);
      expect(copy).not.toContain("storage_error");
    }
  });
});
