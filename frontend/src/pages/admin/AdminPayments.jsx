import { useEffect, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import {
  DollarSign,
  Loader2,
  RefreshCw,
} from "lucide-react";

export const AdminPayments = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPayments = async () => {
    try {
      const res = await adminApi.getPaymentStats();
      setData(res.data);
    } catch (err) {
      setError(err.message || "Failed to load payment statistics.");
    } finally {
      setLoading(false);
    }
  };

  const refreshPayments = () => {
    setLoading(true);
    setError(null);
    void fetchPayments();
  };

  useEffect(() => {
    let active = true;
    adminApi.getPaymentStats()
      .then((res) => {
        if (active) setData(res.data);
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load payment statistics.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-2">
        <Loader2 className="w-7 h-7 text-red-600 animate-spin" />
        <span className="text-xs text-gray-500 font-medium">Loading payment ledger...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center text-xs text-red-700 font-semibold">
        {error}
      </div>
    );
  }

  const { summary, orders } = data || {};

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-600" /> Payments & Revenue Ledger
          </h2>
          <p className="text-xs text-gray-500 mt-1">Platform commissions, cook earnings payout splits, and order transaction audit</p>
        </div>
        <button
          onClick={refreshPayments}
          className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <span className="text-xs font-semibold text-gray-500 block">Total Platform Revenue</span>
          <span className="text-2xl font-extrabold text-emerald-600">₹{summary?.totalPlatformRevenue ?? 0}</span>
          <p className="text-[11px] text-gray-400">Includes 10% platform fee + delivery base</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <span className="text-xs font-semibold text-gray-500 block">Cook Payout Pool</span>
          <span className="text-2xl font-extrabold text-amber-600">₹{summary?.totalCookEarnings ?? 0}</span>
          <p className="text-[11px] text-gray-400">Total net food revenue earned by home cooks</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <span className="text-xs font-semibold text-gray-500 block">Courier Payout Pool</span>
          <span className="text-2xl font-extrabold text-blue-600">₹{summary?.totalDeliveryEarnings ?? 0}</span>
          <p className="text-[11px] text-gray-400">Total delivery fee distributed to agents</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <span className="text-xs font-semibold text-gray-500 block">Gross Order Volume</span>
          <span className="text-2xl font-extrabold text-gray-900">₹{summary?.totalGrossVolume ?? 0}</span>
          <p className="text-[11px] text-gray-400">{summary?.paidOrdersCount ?? 0} paid transactions</p>
        </div>
      </div>

      {/* Transaction Ledger Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-gray-900">Recent Transactions & Split Audits</h3>
          <span className="text-xs font-semibold text-gray-500">Showing last 50 orders</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3.5">Order #</th>
                <th className="px-4 py-3.5">Customer</th>
                <th className="px-4 py-3.5">Cook Kitchen</th>
                <th className="px-4 py-3.5">Total Paid</th>
                <th className="px-4 py-3.5">Cook Share</th>
                <th className="px-4 py-3.5">Delivery Share</th>
                <th className="px-4 py-3.5">Platform Fee</th>
                <th className="px-4 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders?.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-xs text-gray-400 font-medium">
                    No payment transactions or order records found.
                  </td>
                </tr>
              ) : (
                orders?.map((ord) => (
                  <tr key={ord.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-gray-900">{ord.orderNumber}</td>
                    <td className="px-4 py-3.5 font-medium text-gray-800">{ord.customer?.name}</td>
                    <td className="px-4 py-3.5 font-medium text-gray-800">{ord.cook?.businessName}</td>
                    <td className="px-4 py-3.5 font-extrabold text-gray-900">₹{ord.totalAmount}</td>
                    <td className="px-4 py-3.5 font-semibold text-amber-700">₹{ord.cookEarning}</td>
                    <td className="px-4 py-3.5 font-semibold text-blue-700">₹{ord.deliveryEarning}</td>
                    <td className="px-4 py-3.5 font-bold text-emerald-700">₹{ord.platformFee + ord.deliveryFee}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                          ord.paymentStatus === "PAID"
                            ? "bg-emerald-100 text-emerald-800"
                            : ord.paymentStatus === "REFUNDED"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {ord.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminPayments;
