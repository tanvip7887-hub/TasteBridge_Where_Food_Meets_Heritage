export const normalizeCookReadiness = (readiness) => {
  if (!readiness || typeof readiness.readyToSell !== "boolean" || !Array.isArray(readiness.checklist)) {
    return null;
  }

  return {
    readyToSell: readiness.readyToSell,
    showChecklist: !readiness.readyToSell,
    heading: readiness.readyToSell ? "Ready to sell" : "Setup incomplete",
    checklist: readiness.checklist.map((item) => ({
      id: item.id,
      label: item.label,
      complete: item.complete === true,
      message: item.message,
      actionHref: item.actionHref || null,
    })),
  };
};
