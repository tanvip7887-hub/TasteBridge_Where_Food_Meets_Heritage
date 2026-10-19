const supportedTypes = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);

const typeFromFileName = (fileName = "") => {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  return "";
};

export const getDocumentPreviewType = (blob, document = {}) => {
  const responseType = blob?.type?.split(";")[0].trim().toLowerCase();
  const metadataType = document.mimeType?.split(";")[0].trim().toLowerCase();
  if (supportedTypes.has(responseType)) return responseType;
  if (responseType && responseType !== "application/octet-stream") return null;
  if (supportedTypes.has(metadataType)) return metadataType;
  if (metadataType && metadataType !== "application/octet-stream") return null;
  const fileType = typeFromFileName(document.fileName);
  return supportedTypes.has(fileType) ? fileType : null;
};

export const fetchDocumentPreview = async ({ document, getDocument, objectUrls = URL, isCurrent = () => true }) => {
  const blob = await getDocument(document.id);
  if (!isCurrent()) return null;
  const type = getDocumentPreviewType(blob, document);
  if (!type) {
    throw new Error("This document format cannot be previewed. Supported formats are PDF, JPG, JPEG, and PNG.");
  }

  const url = objectUrls.createObjectURL(blob);
  let disposed = false;
  return {
    url,
    type,
    dispose() {
      if (!disposed) {
        disposed = true;
        objectUrls.revokeObjectURL(url);
      }
    },
  };
};

const standalonePreviewStyles = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background-color: #0f172a;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    font-family: system-ui, -apple-system, sans-serif;
  }
  img {
    max-width: 95vw;
    max-height: 95vh;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
  }
  iframe {
    width: 100vw;
    height: 100vh;
    border: none;
  }
`;

export const populateStandaloneDocumentPreview = (previewWindow, previewDoc) => {
  const previewDocument = previewWindow.document;
  previewDocument.title = previewDoc.fileName;

  const style = previewDocument.createElement("style");
  style.textContent = standalonePreviewStyles;
  previewDocument.head.appendChild(style);

  const content = previewDocument.createElement(previewDoc.isPdf ? "iframe" : "img");
  content.src = previewDoc.url;
  if (previewDoc.isPdf) {
    content.title = previewDoc.fileName;
  } else {
    content.alt = previewDoc.fileName;
  }
  previewDocument.body.appendChild(content);
};
