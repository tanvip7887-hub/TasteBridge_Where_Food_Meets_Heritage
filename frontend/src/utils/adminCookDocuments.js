export const getLatestFssaiDocument = (documents = []) => documents
  .filter((document) => document.documentType === "FSSAI_LICENSE")
  .sort((left, right) => {
    const dateDifference = new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
    return dateDifference || String(right.id).localeCompare(String(left.id));
  })[0] || null;

export const getOtherVerificationDocuments = (documents = []) =>
  documents.filter((document) => document.documentType !== "FSSAI_LICENSE");
