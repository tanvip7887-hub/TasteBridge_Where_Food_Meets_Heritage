import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Star,
  UtensilsCrossed,
} from "lucide-react";
import cookApi from "../api/cookApi.js";
import reviewsApi from "../api/reviewsApi.js";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

const formatPrice = (price) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);

export const PublicCookProfilePage = () => {
  const { id } = useParams();
  const [retryKey, setRetryKey] = useState(0);
  const [page, setPage] = useState(1);

  const [profileState, setProfileState] = useState({ key: null, cook: null, error: null });
  const profileKey = `${id}:${retryKey}`;
  const loading = profileState.key !== profileKey;
  const cook = loading ? null : profileState.cook;
  const error = loading ? null : profileState.error;

  const [reviewsState, setReviewsState] = useState({ key: null, data: null, error: null });
  const reviewsKey = `${id}:${page}:${retryKey}`;
  const reviewsLoading = reviewsState.key !== reviewsKey;
  const reviewsData = reviewsLoading ? null : reviewsState.data;
  const reviewsError = reviewsLoading ? null : reviewsState.error;

  // Fetch public cook profile
  useEffect(() => {
    let active = true;
    cookApi
      .getPublicProfile(id)
      .then((res) => {
        if (!active) return;
        const cookData = unwrap(res);
        setProfileState({ key: profileKey, error: null, cook: cookData });
      })
      .catch((err) => {
        if (!active) return;
        setProfileState({
          key: profileKey,
          error: err.status === 404 ? "Cook profile not found." : err.message || "Failed to load cook profile.",
          cook: null,
        });
      });
    return () => {
      active = false;
    };
  }, [id, profileKey]);

  // Fetch public cook reviews
  useEffect(() => {
    let active = true;
    reviewsApi
      .forCook(id, { page, limit: 10 })
      .then((res) => {
        if (!active) return;
        const data = unwrap(res);
        setReviewsState({ key: reviewsKey, error: null, data });
      })
      .catch((err) => {
        if (!active) return;
        setReviewsState({
          key: reviewsKey,
          error: err.message || "Reviews could not be loaded.",
          data: null,
        });
      });
    return () => {
      active = false;
    };
  }, [id, page, reviewsKey]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-sm text-gray-600" role="status">
        <LoaderCircle className="h-5 w-5 animate-spin text-red-600" aria-hidden="true" />
        Loading cook profile…
      </div>
    );
  }

  if (error || !cook) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24" role="alert">
        <AlertCircle className="mx-auto h-10 w-10 text-red-600" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold text-gray-900">{error || "Cook profile unavailable"}</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-gray-600">
          This kitchen may not be public yet, or the profile link is no longer valid.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => setRetryKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <Link
            to="/explore"
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to dishes
          </Link>
        </div>
      </section>
    );
  }

  const ratingSummary = cook.ratingSummary || reviewsData?.ratingSummary;
  const reviews = reviewsData?.items || [];
  const pagination = reviewsData?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link
        to="/explore"
        className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to dishes
      </Link>

      {/* Cook Hero Profile Card */}
      <article className="mt-5 overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm">
        <div className="h-32 bg-gradient-to-r from-orange-400 via-amber-500 to-red-500 sm:h-44" />
        <div className="relative px-5 pb-8 sm:px-8 lg:px-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between">
            <div className="-mt-16 flex items-end gap-4 sm:-mt-20">
              {cook.profileImage ? (
                <img
                  src={cook.profileImage}
                  alt={cook.businessName}
                  className="h-28 w-28 rounded-2xl border-4 border-white bg-white object-cover shadow-md sm:h-36 sm:w-36"
                />
              ) : (
                <div
                  className="flex h-28 w-28 items-center justify-center rounded-2xl border-4 border-white bg-orange-100 text-orange-700 shadow-md sm:h-36 sm:w-36"
                  aria-hidden="true"
                >
                  <UtensilsCrossed className="h-12 w-12" />
                </div>
              )}
              <div className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">{cook.businessName}</h1>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Approved Home Kitchen
                  </span>
                </div>
                {cook.specialization && (
                  <p className="mt-1 text-sm font-medium text-gray-700">{cook.specialization}</p>
                )}
              </div>
            </div>

            {/* Overall Rating Header Badge */}
            <div className="mt-4 flex items-center gap-2 sm:mt-0 sm:pb-2">
              {ratingSummary?.count > 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-amber-900">
                  <Star className="h-5 w-5 fill-amber-400 text-amber-500" aria-hidden="true" />
                  <span className="text-lg font-bold">{Number(ratingSummary.average || 0).toFixed(1)}</span>
                  <span className="text-xs text-amber-800">
                    ({ratingSummary.count} verified review{ratingSummary.count === 1 ? "" : "s"})
                  </span>
                </div>
              ) : (
                <span className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
                  No reviews yet
                </span>
              )}
            </div>
          </div>

          {/* Details & Location */}
          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-gray-600">
            {(cook.locality || cook.city) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                {[cook.locality, cook.city].filter(Boolean).join(", ")}
              </span>
            )}
            {cook.experienceYears && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                {cook.experienceYears} years experience
              </span>
            )}
            {cook.createdAt && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                Member since {new Date(cook.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
              </span>
            )}
          </div>

          {/* Cuisines */}
          {Array.isArray(cook.cuisines) && cook.cuisines.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {cook.cuisines.map((cuisine) => (
                <span
                  key={cuisine}
                  className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800"
                >
                  {cuisine}
                </span>
              ))}
            </div>
          )}

          {/* Bio */}
          {cook.bio && (
            <div className="mt-6 border-t border-gray-100 pt-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">About the Cook & Kitchen</h2>
              <p className="mt-2 max-w-4xl whitespace-pre-line text-sm leading-6 text-gray-700">{cook.bio}</p>
            </div>
          )}
        </div>
      </article>

      {/* Dishes Section */}
      <section className="mt-10" aria-labelledby="cook-dishes-heading">
        <div className="flex items-center justify-between">
          <h2 id="cook-dishes-heading" className="text-xl font-bold text-gray-900">
            Dishes by {cook.businessName}
          </h2>
          <span className="text-sm text-gray-500">{cook.dishes?.length || 0} dishes available</span>
        </div>

        {cook.dishes?.length ? (
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cook.dishes.map((dish) => (
              <article
                key={dish.id}
                className="group overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <Link to={`/dishes/${dish.id}`} className="block focus:outline-none">
                  <div className="flex h-44 items-center justify-center bg-orange-50">
                    {dish.image ? (
                      <img src={dish.image} alt={dish.name} className="h-full w-full object-cover" />
                    ) : (
                      <UtensilsCrossed className="h-10 w-10 text-orange-300" aria-hidden="true" />
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-gray-900 group-hover:text-red-700">{dish.name}</h3>
                        <p className="mt-0.5 text-xs text-gray-500">{dish.category?.name || dish.cuisine}</p>
                        {dish.ratingSummary?.count >= 3 && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-700">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden="true" />
                            {Number(dish.ratingSummary.average || 0).toFixed(1)} · {dish.ratingSummary.count}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 font-bold text-gray-900">{formatPrice(dish.price)}</span>
                    </div>
                    {dish.description && (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-600">{dish.description}</p>
                    )}
                  </div>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-orange-50/70 p-4 text-sm text-gray-600">
            No active dishes currently listed by this cook.
          </p>
        )}
      </section>

      {/* Customer Reviews Section */}
      <section className="mt-12 border-t border-orange-100 pt-8" aria-labelledby="cook-reviews-heading">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="cook-reviews-heading" className="text-xl font-extrabold text-gray-900">
              Customer reviews
            </h2>
            {ratingSummary?.count > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
                <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />
                <span className="font-semibold text-gray-900">
                  {Number(ratingSummary.average || 0).toFixed(1)} out of 5
                </span>
                <span>·</span>
                <span>
                  {ratingSummary.count} verified customer review{ratingSummary.count === 1 ? "" : "s"}
                </span>
              </p>
            )}
          </div>
        </div>

        {reviewsLoading ? (
          <p role="status" className="mt-6 flex items-center gap-2 text-sm text-gray-500">
            <LoaderCircle className="h-4 w-4 animate-spin text-red-600" />
            Loading kitchen reviews…
          </p>
        ) : reviewsError ? (
          <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-red-700" role="alert">
            <AlertCircle className="h-4 w-4" />
            {reviewsError}
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              className="font-semibold underline"
            >
              <RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Retry
            </button>
          </div>
        ) : reviews.length > 0 ? (
          <div className="mt-6 space-y-4">
            {reviews.map((review) => (
              <article key={review.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{review.customerName}</p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          review.verified === "VERIFIED_ORDER"
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-purple-50 text-purple-800"
                        }`}
                      >
                        <CheckCircle className="h-3 w-3" aria-hidden="true" />
                        {review.verified === "VERIFIED_ORDER" ? "Verified order" : "Attended event"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span>{new Date(review.createdAt).toLocaleDateString("en-IN")}</span>
                      {review.subjectName && (
                        <>
                          <span>·</span>
                          <span className="font-medium text-gray-700">{review.subjectName}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-bold text-amber-700">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />
                    {review.rating}/5
                  </span>
                </div>

                {review.comment && (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{review.comment}</p>
                )}

                {review.cookReply && (
                  <div className="mt-4 rounded-xl bg-orange-50/80 p-4 text-sm text-gray-700">
                    <p className="text-xs font-bold text-[#D2552B]">
                      Reply from {review.cookName || cook.businessName}
                      {review.cookRepliedAt && (
                        <span className="ml-1 text-[11px] font-normal text-gray-500">
                          · {new Date(review.cookRepliedAt).toLocaleDateString("en-IN")}
                        </span>
                      )}
                    </p>
                    <p className="mt-1.5 leading-5">{review.cookReply}</p>
                  </div>
                )}
              </article>
            ))}

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Review pages">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
                </button>
                <span className="text-xs text-gray-600">
                  Page {page} of {pagination.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="inline-flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 disabled:opacity-40"
                >
                  Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </nav>
            )}
          </div>
        ) : (
          <p className="mt-6 rounded-xl bg-orange-50/70 p-4 text-sm text-gray-600">
            No customer reviews yet for this kitchen.
          </p>
        )}
      </section>
    </main>
  );
};

export default PublicCookProfilePage;
