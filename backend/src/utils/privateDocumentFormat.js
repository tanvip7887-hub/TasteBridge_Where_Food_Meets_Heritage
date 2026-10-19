const formatByMimeType = Object.freeze({
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
});

const formatByExtension = Object.freeze({
  pdf: "pdf",
  jpg: "jpg",
  jpeg: "jpg",
  png: "png",
});

/** Resolve the Cloudinary format from validated document metadata. */
export const getPrivateDocumentFormat = ({ mimeType, fileName } = {}) => {
  const normalizedMimeType = mimeType?.split(";")[0].trim().toLowerCase();
  if (normalizedMimeType) return formatByMimeType[normalizedMimeType] || null;

  const extension = fileName?.split(".").pop()?.toLowerCase();
  return formatByExtension[extension] || null;
};
