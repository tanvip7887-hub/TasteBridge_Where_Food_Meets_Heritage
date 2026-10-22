const ReviewSkeleton = () => <div className="grid animate-pulse gap-4 rounded-2xl border border-orange-100 bg-white p-4 sm:grid-cols-[104px_minmax(0,1fr)] sm:p-5" aria-hidden="true">
  <div className="h-40 rounded-xl bg-[#F7F2EC] sm:h-[104px] sm:w-[104px]" />
  <div className="space-y-4 py-1"><div className="h-3 w-16 rounded bg-[#F7F2EC]" /><div className="h-6 max-w-sm rounded bg-[#F7F2EC]" /><div className="h-4 w-40 rounded bg-[#F7F2EC]" /></div>
</div>;

export default ReviewSkeleton;
