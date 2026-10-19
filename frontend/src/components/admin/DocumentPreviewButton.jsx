import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, ExternalLink, FileText, Loader2, X } from "lucide-react";
import { cookApi } from "../../api/cookApi.js";
import { fetchDocumentPreview } from "../../utils/documentPreview.js";

export const DocumentPreviewButton = ({ document, label = "Preview" }) => {
  const [open, setOpen] = useState(false);
  const [openDocumentId, setOpenDocumentId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const requestIdRef = useRef(0);
  const previewRef = useRef(null);

  const releasePreview = () => {
    previewRef.current?.dispose();
    previewRef.current = null;
    setPreview(null);
  };

  const loadPreview = async () => {
    const requestId = ++requestIdRef.current;
    releasePreview();
    setOpen(true);
    setOpenDocumentId(document.id);
    setLoading(true);
    setError("");
    try {
      const nextPreview = await fetchDocumentPreview({
        document,
        getDocument: cookApi.getDocument,
        isCurrent: () => requestIdRef.current === requestId,
      });
      if (requestId !== requestIdRef.current) {
        nextPreview?.dispose();
        return;
      }
      if (!nextPreview) return;
      previewRef.current = nextPreview;
      setPreview(nextPreview);
    } catch (requestError) {
      if (requestId === requestIdRef.current) {
        setError(requestError?.message || "The document could not be loaded. Please try again.");
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  const closePreview = () => {
    requestIdRef.current += 1;
    releasePreview();
    setOpen(false);
    setOpenDocumentId(null);
    setLoading(false);
    setError("");
  };

  useEffect(() => () => {
    requestIdRef.current += 1;
    previewRef.current?.dispose();
    previewRef.current = null;
  }, [document.id]);

  return (
    <>
      <button
        type="button"
        onClick={loadPreview}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
      >
        {label} <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </button>
      {open && openDocumentId === document.id && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePreview(); }}>
          <section className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="document-preview-title">
            <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                <h2 id="document-preview-title" className="truncate text-sm font-bold text-gray-900">{document.fileName || document.documentType || "Verification document"}</h2>
              </div>
              <button type="button" onClick={closePreview} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Close document preview">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>
            <div className="min-h-48 overflow-auto p-4">
              {loading ? (
                <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-gray-600" role="status">
                  <Loader2 className="h-5 w-5 animate-spin text-red-600" aria-hidden="true" /> Loading private document…
                </div>
              ) : error ? (
                <div className="flex min-h-48 flex-col items-center justify-center text-center" role="alert">
                  <AlertCircle className="h-8 w-8 text-red-600" aria-hidden="true" />
                  <p className="mt-3 max-w-xl text-sm text-red-800">{error}</p>
                  <button type="button" onClick={loadPreview} className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Try again</button>
                </div>
              ) : preview?.type === "application/pdf" ? (
                <iframe title="Private verification document PDF" src={preview.url} className="h-[72vh] w-full rounded-lg border border-gray-200" />
              ) : preview ? (
                <img src={preview.url} alt={document.fileName || `${document.documentType || "Verification"} document`} className="mx-auto max-h-[72vh] max-w-full rounded-lg object-contain" />
              ) : null}
            </div>
          </section>
        </div>,
        globalThis.document.body
      )}
    </>
  );
};

export default DocumentPreviewButton;
