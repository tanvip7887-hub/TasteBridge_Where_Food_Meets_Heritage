import { useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, Star } from "lucide-react";
import reviewsApi from "../../api/reviewsApi.js";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

const RATING_LABELS = {
  1: "1 - Poor",
  2: "2 - Fair",
  3: "3 - Good",
  4: "4 - Very good",
  5: "5 - Excellent",
};

export const CustomerReviewForm = ({
  target,
  onSuccess,
  onSkip,
  className = "",
}) => {
  const isEditing = target?.kind === "edit";
  const [rating, setRating] = useState(target?.rating || 0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState(target?.comment || "");
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [apiError, setApiError] = useState("");
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successResult, setSuccessResult] = useState(null);

  const displayRating = hoveredRating || rating;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving || isSuccess) return;

    setValidationError("");
    setApiError("");
    setIsDuplicate(false);

    // Validation
    if (!rating || rating < 1 || rating > 5) {
      setValidationError("Please select a star rating between 1 and 5.");
      return;
    }

    if (comment.length > 500) {
      setValidationError("Comment cannot exceed 500 characters.");
      return;
    }

    setSaving(true);
    try {
      let response;
      const trimmedComment = comment.trim();

      if (isEditing) {
        response = await reviewsApi.update(target.id, {
          rating,
          ...(trimmedComment ? { comment: trimmedComment } : {}),
        });
      } else {
        const isFood = target?.reviewType === "FOOD" || (!target?.reviewType && target?.orderItemId);
        if (isFood) {
          const orderItemId = target.orderItemId || target.id;
          response = await reviewsApi.create({
            reviewType: "FOOD",
            orderItemId,
            rating,
            ...(trimmedComment ? { comment: trimmedComment } : {}),
          });
        } else {
          const bookingId = target.bookingId || target.id;
          response = await reviewsApi.create({
            reviewType: "EXPERIENCE",
            bookingId,
            rating,
            ...(trimmedComment ? { comment: trimmedComment } : {}),
          });
        }
      }

      const result = unwrap(response);
      setIsSuccess(true);
      setSuccessResult(result);
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err) {
      const message = err?.message || "Your review could not be saved. Please try again.";
      const status = err?.status;
      if (
        status === 409 ||
        message.toLowerCase().includes("already been reviewed") ||
        message.toLowerCase().includes("conflict")
      ) {
        setIsDuplicate(true);
      } else {
        setApiError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  if (isDuplicate) {
    return (
      <div className={`space-y-4 ${className}`} role="alert">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <h3 className="font-bold">Already reviewed</h3>
              <p className="mt-1 text-sm text-amber-800">
                This {target?.reviewType === "EXPERIENCE" ? "event booking" : "purchased dish"} has already been reviewed.
                Your feedback has already been recorded and duplicate submissions are prevented.
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className={`space-y-4 ${className}`} role="status">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <div>
              <h3 className="font-bold text-emerald-950">Thank you for your feedback!</h3>
              <p className="mt-1 text-sm text-emerald-800">
                {isEditing
                  ? "Your review has been successfully updated."
                  : "Your review helps other customers discover great food and experiences."}
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onSkip?.() || (onSuccess && onSuccess(successResult))}
            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`space-y-5 ${className}`} noValidate>
      {target?.subjectName && (
        <div className="border-b border-gray-100 pb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[#D2552B]">
            {target.reviewType === "EXPERIENCE" ? "Attended event" : "Verified order"}
          </p>
          <h3 className="mt-1 font-bold text-gray-900">{target.subjectName}</h3>
          {target.orderReference && (
            <p className="mt-0.5 text-xs text-gray-500">
              Reference: {target.orderReference}
            </p>
          )}
        </div>
      )}

      {/* 1-5 Star Rating */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-gray-800">
          Rating <span className="text-red-500">*</span>
        </legend>
        <div
          role="radiogroup"
          aria-label="Rating out of 5 stars"
          className="flex items-center gap-1.5"
        >
          {[1, 2, 3, 4, 5].map((starValue) => {
            const isFilled = starValue <= displayRating;
            return (
              <button
                key={starValue}
                type="button"
                role="radio"
                aria-checked={rating === starValue}
                aria-label={`${starValue} star${starValue > 1 ? "s" : ""}`}
                disabled={saving}
                onClick={() => {
                  setRating(starValue);
                  if (validationError) setValidationError("");
                }}
                onMouseEnter={() => setHoveredRating(starValue)}
                onMouseLeave={() => setHoveredRating(0)}
                className="rounded-lg p-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50"
              >
                <Star
                  className={`h-8 w-8 transition-colors ${
                    isFilled
                      ? "fill-amber-400 text-amber-500"
                      : "text-gray-300"
                  }`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
          {displayRating > 0 && (
            <span className="ml-2 text-xs font-medium text-gray-600">
              {RATING_LABELS[displayRating]}
            </span>
          )}
        </div>
      </fieldset>

      {/* Optional Comment */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="review-comment" className="text-sm font-semibold text-gray-800">
            Comment <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <span
            className={`text-xs ${
              comment.length > 500 ? "font-bold text-red-600" : "text-gray-500"
            }`}
            aria-live="polite"
          >
            {comment.length}/500
          </span>
        </div>
        <textarea
          id="review-comment"
          rows={4}
          maxLength={500}
          disabled={saving}
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            if (validationError) setValidationError("");
          }}
          placeholder="Share details of your experience, food quality, or taste…"
          className="w-full rounded-xl border border-gray-300 p-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-[#D2552B]/20 disabled:bg-gray-50"
        />
      </div>

      {/* Validation and API Error States */}
      {validationError && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {validationError}
        </p>
      )}

      {apiError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <div className="flex-1">{apiError}</div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        <button
          type="button"
          disabled={saving}
          onClick={onSkip}
          className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {isEditing ? "Cancel" : "Skip for now"}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-[#D2552B] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {saving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {saving ? "Saving…" : isEditing ? "Update review" : "Submit review"}
        </button>
      </div>
    </form>
  );
};

export default CustomerReviewForm;
