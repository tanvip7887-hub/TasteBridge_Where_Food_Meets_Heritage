import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fetchDocumentPreview, getDocumentPreviewType, populateStandaloneDocumentPreview } from "../src/utils/documentPreview.js";

test("both admin document lists use the shared authenticated preview component", async () => {
  for (const page of ["AdminCooks.jsx", "AdminVerifications.jsx"]) {
    const source = await readFile(new URL(`../src/pages/admin/${page}`, import.meta.url), "utf8");
    assert.match(source, /DocumentPreviewButton document=\{doc\}/);
    assert.doesNotMatch(source, /getDocumentPreviewUrl/);
  }
});

test("preview portal targets the browser document body, not the uploaded document prop", async () => {
  const source = await readFile(new URL("../src/components/admin/DocumentPreviewButton.jsx", import.meta.url), "utf8");
  assert.match(source, /createPortal\([\s\S]*globalThis\.document\.body\s*\)/);
});

test("preview retrieval preserves supported PDF and image formats", async () => {
  for (const [mimeType, expectedType] of [
    ["application/pdf", "application/pdf"],
    ["image/jpeg", "image/jpeg"],
    ["image/jpg", "image/jpg"],
    ["image/png", "image/png"],
  ]) {
    const blob = new Blob(["document"], { type: mimeType });
    const calls = [];
    const preview = await fetchDocumentPreview({
      document: { id: "document-id" },
      getDocument: async (id) => {
        calls.push(id);
        return blob;
      },
      objectUrls: {
        createObjectURL: (value) => {
          assert.equal(value, blob);
          return `blob:${mimeType}`;
        },
        revokeObjectURL: () => {},
      },
    });

    assert.deepEqual(calls, ["document-id"]);
    assert.equal(preview.type, expectedType);
    assert.equal(preview.url, `blob:${mimeType}`);
  }
});

test("preview retrieval reports authenticated API failures without creating a URL", async () => {
  let created = false;
  await assert.rejects(
    fetchDocumentPreview({
      document: { id: "missing-document" },
      getDocument: async () => {
        throw new Error("Document not found");
      },
      objectUrls: {
        createObjectURL: () => {
          created = true;
          return "blob:unused";
        },
        revokeObjectURL: () => {},
      },
    }),
    /Document not found/
  );
  assert.equal(created, false);
});

test("stale document requests do not create a Blob URL after the document changes", async () => {
  let current = true;
  let release;
  let created = false;
  const pendingDocument = new Promise((resolve) => { release = resolve; });
  const request = fetchDocumentPreview({
    document: { id: "old-document", mimeType: "image/png" },
    getDocument: () => pendingDocument,
    isCurrent: () => current,
    objectUrls: {
      createObjectURL: () => { created = true; return "blob:stale"; },
      revokeObjectURL: () => {},
    },
  });

  current = false;
  release(new Blob(["old document"], { type: "image/png" }));
  assert.equal(await request, null);
  assert.equal(created, false);
});

test("unsupported and missing formats are rejected, with filename fallback for generic blob types", () => {
  assert.equal(getDocumentPreviewType(new Blob(["x"], { type: "image/png" })), "image/png");
  assert.equal(getDocumentPreviewType(new Blob(["x"], { type: "application/octet-stream" }), { fileName: "id.pdf" }), "application/pdf");
  assert.equal(getDocumentPreviewType(new Blob(["x"], { type: "text/html" }), { fileName: "id.pdf" }), null);
  assert.equal(getDocumentPreviewType(new Blob(["x"], { type: "application/octet-stream" }), { mimeType: "text/html", fileName: "id.pdf" }), null);
  assert.equal(getDocumentPreviewType(new Blob(["x"]), { fileName: "id.docx" }), null);
});

test("preview object URLs are revoked exactly once on disposal", async () => {
  const revoked = [];
  const preview = await fetchDocumentPreview({
    document: { id: "document-id" },
    getDocument: async () => new Blob(["image"], { type: "image/png" }),
    objectUrls: {
      createObjectURL: () => "blob:preview",
      revokeObjectURL: (url) => revoked.push(url),
    },
  });

  preview.dispose();
  preview.dispose();
  assert.deepEqual(revoked, ["blob:preview"]);
});

test("standalone previews render untrusted filenames as literal title and alt text", () => {
  const elements = [];
  const makeElement = (tagName) => {
    const element = { tagName, children: [], textContent: "" };
    element.appendChild = (child) => element.children.push(child);
    elements.push(element);
    return element;
  };
  const previewDocument = {
    title: "",
    head: makeElement("head"),
    body: makeElement("body"),
    createElement: makeElement,
  };
  const filename = '</title><script>window.pwned = true</script><img src=x onerror="alert(1)">';

  populateStandaloneDocumentPreview({ document: previewDocument }, {
    fileName: filename,
    isPdf: false,
    url: "blob:private-document",
  });

  assert.equal(previewDocument.title, filename);
  const image = previewDocument.body.children[0];
  assert.equal(image.tagName, "img");
  assert.equal(image.alt, filename);
  assert.equal(image.src, "blob:private-document");
  assert.deepEqual(elements.map(({ tagName }) => tagName), ["head", "body", "style", "img"]);
  assert.equal(elements.some(({ tagName }) => tagName === "script"), false);
  assert.equal(elements.some(({ tagName, attributes }) => tagName === "img" && attributes?.onerror), false);
});

test("standalone PDF previews use an iframe with a literal accessible title", () => {
  const makeElement = (tagName) => ({ tagName, children: [], appendChild(child) { this.children.push(child); } });
  const previewDocument = {
    title: "",
    head: makeElement("head"),
    body: makeElement("body"),
    createElement: makeElement,
  };
  const filename = "identity <verification>.pdf";

  populateStandaloneDocumentPreview({ document: previewDocument }, {
    fileName: filename,
    isPdf: true,
    url: "blob:private-pdf",
  });

  assert.equal(previewDocument.title, filename);
  const frame = previewDocument.body.children[0];
  assert.equal(frame.tagName, "iframe");
  assert.equal(frame.src, "blob:private-pdf");
  assert.equal(frame.title, filename);
});

test("delivery-agent standalone preview uses safe DOM construction instead of document.write", async () => {
  const source = await readFile(new URL("../src/pages/delivery/DeliveryAgentApplicationStatus.jsx", import.meta.url), "utf8");
  assert.match(source, /populateStandaloneDocumentPreview\(newWin, previewDoc\)/);
  assert.doesNotMatch(source, /document\.write/);
});
