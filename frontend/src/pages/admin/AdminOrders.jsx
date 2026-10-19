import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import ConfirmationModal from "../../components/admin/ConfirmationModal.jsx";
import {
  ShoppingBag,
  Search,
  Filter,
  Eye,
  Loader2,
  RefreshCw,
  MapPin,
  X,
} from "lucide-react";

export const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const searchRef = useRef(search);
  const requestIdRef = useRef(0);
  const requestControllerRef = useRef(null);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const [selectedOrder, setSelectedOrder] = useState(null);

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    action: null,
    loading: false,
  });

  const fetchOrders = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    try {
      const res = await adminApi.getAllOrders({
        search: searchRef.current,
        status: statusFilter || undefined,
      }, { signal: controller.signal });
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setOrders(res.data.orders || []);
    } catch (err) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setError(err.message || "Failed to load orders list.");
    } finally {
      if (requestId === requestIdRef.current) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [statusFilter]);

  const refreshOrders = () => {
    setLoading(true);
    setError(null);
    void fetchOrders();
  };

  useEffect(() => {
    fetchOrders();
    return () => {
      requestControllerRef.current?.abort();
      requestIdRef.current += 1;
    };
  }, [fetchOrders]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    refreshOrders();
  };

  const openOrderDetail = async (orderId) => {
    try {
      const res = await adminApi.getOrderById(orderId);
      setSelectedOrder(res.data);
    } catch (err) {
      alert("Failed to load order details: " + err.message);
    }
  };

  const handleUpdateOrderStatus = (orderId, newStatus) => {
    setConfirmModal({
      isOpen: true,
      title: `Update Order Status to ${newStatus}`,
      message: `Are you sure you want to manually set this order's status to ${newStatus}?`,
      action: async () => {
        setConfirmModal((prev) => ({ ...prev, loading: true }));
        try {
          await adminApi.updateOrderStatus(orderId, { status: newStatus });
          setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false });
          if (selectedOrder && selectedOrder.id === orderId) {
            openOrderDetail(orderId);
          }
          refreshOrders();
        } catch (err) {
          alert("Error: " + err.message);
          setConfirmModal((prev) => ({ ...prev, loading: false }));
        }
      },
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-indigo-600" /> Order Lifecycle Monitor
          </h2>
          <p className="text-xs text-gray-500 mt-1">Track live customer orders, courier dispatches, status progression and receipts</p>
        </div>
        <button
          onClick={refreshOrders}
          className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search order #, customer name, cook business..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </form>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setLoading(true);
              setError(null);
              setStatusFilter(e.target.value);
            }}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="">All Order Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PREPARING">Preparing</option>
            <option value="READY_FOR_PICKUP">Ready for Pickup</option>
            <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
            <option value="DELIVERED">Delivered</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-7 h-7 text-red-600 animate-spin" />
          <span className="text-xs text-gray-500 font-medium">Loading orders...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 rounded-2xl border border-red-200 text-center text-xs text-red-700 font-semibold">
          {error}
        </div>
      ) : orders.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-gray-200 text-center space-y-2">
          <ShoppingBag className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-sm font-bold text-gray-700">No Orders Found</p>
          <p className="text-xs text-gray-500">Try changing your search or filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3.5">Order Number</th>
                  <th className="px-4 py-3.5">Customer / Cook</th>
                  <th className="px-4 py-3.5">Total Amount</th>
                  <th className="px-4 py-3.5">Order Status</th>
                  <th className="px-4 py-3.5">Payment</th>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-gray-900">{ord.orderNumber}</td>
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-gray-900 block">{ord.customer?.name}</span>
                      <span className="text-[11px] text-gray-500">Cook: {ord.cook?.businessName}</span>
                    </td>
                    <td className="px-4 py-3.5 font-extrabold text-gray-900">₹{ord.totalAmount}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          ord.status === "DELIVERED"
                            ? "bg-emerald-100 text-emerald-800"
                            : ord.status === "OUT_FOR_DELIVERY"
                            ? "bg-blue-100 text-blue-800"
                            : ord.status === "CANCELLED"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {ord.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-emerald-700">{ord.paymentStatus}</td>
                    <td className="px-4 py-3.5 text-gray-500">{new Date(ord.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => openOrderDetail(ord.id)}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-gray-100 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Order #{selectedOrder.orderNumber}</h3>
                <p className="text-xs text-gray-500">Placed on {new Date(selectedOrder.createdAt).toLocaleString()}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Participants */}
            <div className="grid grid-cols-3 gap-4 text-xs bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div>
                <span className="text-gray-500 block font-medium">Customer</span>
                <span className="font-bold text-gray-900">{selectedOrder.customer?.name}</span>
                <span className="text-[11px] text-gray-500 block">{selectedOrder.customer?.email}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Cook Kitchen</span>
                <span className="font-bold text-gray-900">{selectedOrder.cook?.businessName}</span>
                <span className="text-[11px] text-gray-500 block">{selectedOrder.cook?.user?.name}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Delivery Agent</span>
                <span className="font-bold text-gray-900">{selectedOrder.deliveryAgent?.user?.name || "Unassigned"}</span>
                <span className="text-[11px] text-gray-500 block">{selectedOrder.deliveryAgent?.user?.phone || ""}</span>
              </div>
            </div>

            {/* Address */}
            {selectedOrder.address && (
              <div className="text-xs space-y-1">
                <span className="font-bold text-gray-900 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-red-500" /> Delivery Address
                </span>
                <p className="text-gray-600 pl-5">
                  {selectedOrder.address.addressLine1}, {selectedOrder.address.city}, {selectedOrder.address.state} - {selectedOrder.address.pincode}
                </p>
              </div>
            )}

            {/* Order Items */}
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <h4 className="text-sm font-bold text-gray-900">Ordered Items</h4>
              <div className="space-y-2">
                {selectedOrder.items?.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 text-xs">
                    <span className="font-bold text-gray-900">
                      {item.name} x {item.quantity}
                    </span>
                    <span className="font-extrabold text-gray-900">₹{item.totalPrice}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Breakdown */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200/80 text-xs space-y-2">
              <div className="flex justify-between text-gray-600">
                <span>Items Subtotal</span>
                <span>₹{selectedOrder.subtotal}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Delivery Fee</span>
                <span>₹{selectedOrder.deliveryFee}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Platform Commission Fee</span>
                <span>₹{selectedOrder.platformFee}</span>
              </div>
              <div className="flex justify-between font-extrabold text-sm text-gray-900 border-t border-gray-200 pt-2">
                <span>Total Amount Paid</span>
                <span className="text-red-600">₹{selectedOrder.totalAmount}</span>
              </div>
              <div className="flex justify-between text-[11px] text-gray-500 pt-1">
                <span>Cook Payout: ₹{selectedOrder.cookEarning}</span>
                <span>Courier Payout: ₹{selectedOrder.deliveryEarning}</span>
              </div>
            </div>

            {/* Lifecycle Status Action */}
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
              <span className="text-xs font-semibold text-gray-500 mr-auto">Change Status:</span>
              {selectedOrder.status === "PENDING" && <button onClick={() => handleUpdateOrderStatus(selectedOrder.id, "CONFIRMED")} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">Confirm</button>}
              {selectedOrder.status === "CONFIRMED" && <button onClick={() => handleUpdateOrderStatus(selectedOrder.id, "PREPARING")} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">Start Preparing</button>}
              {selectedOrder.status === "PREPARING" && <button onClick={() => handleUpdateOrderStatus(selectedOrder.id, "READY_FOR_PICKUP")} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700">Ready for Pickup</button>}
              {selectedOrder.status === "READY_FOR_PICKUP" && <button onClick={() => handleUpdateOrderStatus(selectedOrder.id, "OUT_FOR_DELIVERY")} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700">Out for Delivery</button>}
              {selectedOrder.status === "OUT_FOR_DELIVERY" && <button onClick={() => handleUpdateOrderStatus(selectedOrder.id, "DELIVERED")} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700">Mark Delivered</button>}
              {["PENDING", "CONFIRMED", "PREPARING"].includes(selectedOrder.status) && selectedOrder.paymentStatus !== "PAID" && <button onClick={() => handleUpdateOrderStatus(selectedOrder.id, "CANCELLED")} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700">Cancel Order</button>}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        loading={confirmModal.loading}
        onConfirm={() => confirmModal.action && confirmModal.action()}
        onCancel={() => setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false })}
      />
    </div>
  );
};

export default AdminOrders;
