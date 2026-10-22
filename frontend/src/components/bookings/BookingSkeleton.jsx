const BookingSkeleton = () => <div className="grid animate-pulse gap-4 rounded-2xl border border-orange-100 bg-white p-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:p-5" aria-hidden="true">
  <div className="h-40 rounded-xl bg-[#F7F2EC] sm:h-[110px] sm:w-[140px]" />
  <div className="space-y-4 py-1">
    <div className="h-4 w-24 rounded bg-[#F7F2EC]" />
    <div className="h-6 max-w-sm rounded bg-[#F7F2EC]" />
    <div className="grid gap-3 sm:grid-cols-2"><div className="h-10 rounded bg-[#F7F2EC]" /><div className="h-10 rounded bg-[#F7F2EC]" /><div className="h-10 rounded bg-[#F7F2EC]" /><div className="h-10 rounded bg-[#F7F2EC]" /></div>
  </div>
</div>;

export default BookingSkeleton;
