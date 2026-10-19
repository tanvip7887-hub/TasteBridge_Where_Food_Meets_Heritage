import { useEffect } from "react";
import { MessageSquareText, X } from "lucide-react";
import CustomerReviewForm from "./CustomerReviewForm.jsx";

export const CustomerReviewModal = ({
  isOpen,
  target,
  onClose,
  onSuccess,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !target) return null;

  const isEditing = target.kind === "edit";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl transition-all"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-orange-50 p-2.5 text-[#D2552B]">
              <MessageSquareText className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h2 id="review-modal-title" className="text-xl font-extrabold text-[#2B1B12]">
                {isEditing ? "Edit your review" : "Rate & review"}
              </h2>
              <p className="text-xs text-gray-500">
                {target.reviewType === "EXPERIENCE"
                  ? "Share your event dining experience"
                  : "Share your thoughts on this dish"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close review dialog"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5">
          <CustomerReviewForm
            target={target}
            onSkip={onClose}
            onSuccess={(result) => {
              if (onSuccess) {
                onSuccess(result);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default CustomerReviewModal;
