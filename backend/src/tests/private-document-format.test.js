import assert from "node:assert/strict";
import test from "node:test";
import { getPrivateDocumentFormat } from "../utils/privateDocumentFormat.js";

test("private document format follows supported MIME types, not misleading filenames", () => {
  assert.equal(getPrivateDocumentFormat({ mimeType: "application/pdf", fileName: "certificate" }), "pdf");
  assert.equal(getPrivateDocumentFormat({ mimeType: "image/png", fileName: "certificate.pdf" }), "png");
  assert.equal(getPrivateDocumentFormat({ mimeType: "image/jpeg; charset=binary", fileName: "upload" }), "jpg");
  assert.equal(getPrivateDocumentFormat({ mimeType: "image/jpg", fileName: "upload" }), "jpg");
});

test("legacy documents without MIME metadata use a supported filename extension", () => {
  assert.equal(getPrivateDocumentFormat({ fileName: "certificate.PDF" }), "pdf");
  assert.equal(getPrivateDocumentFormat({ fileName: "identity.jpeg" }), "jpg");
  assert.equal(getPrivateDocumentFormat({ fileName: "identity.png" }), "png");
  assert.equal(getPrivateDocumentFormat({ fileName: "extensionless-document" }), null);
  assert.equal(getPrivateDocumentFormat({ mimeType: "application/octet-stream", fileName: "identity.pdf" }), null);
});
