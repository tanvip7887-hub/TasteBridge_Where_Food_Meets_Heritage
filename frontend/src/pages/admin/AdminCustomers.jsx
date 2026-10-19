import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import ConfirmationModal from "../../components/admin/ConfirmationModal.jsx";
import {
  Users,
  Search,
  Filter,
  Eye,
  Loader2,
  RefreshCw,
  Ban,
  ShoppingBag,
  MapPin,
  X,
} from "lucide-react";

export const AdminCustomers = () => {
  const [customers, setCustomers] = useState([]);
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

  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    action: null,
    loading: false,
  });

  const fetchCustomers = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    try {
      const res = await adminApi.getAllCustomers({
        search: searchRef.current,
        status: statusFilter || undefined,
      }, { signal: controller.signal });
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setCustomers(res.data.customers || []);
    } catch (err) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setError(err.message || "Failed to load customers list.");
    } finally {
      if (requestId === requestIdRef.current) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [statusFilter]);

  const refreshCustomers = () => {
    setLoading(true);
    setError(null);
    void fetchCustomers();
  };

  useEffect(() => {
    fetchCustomers();
    return () => {
      requestControllerRef.current?.abort();
      requestIdRef.current += 1;
    };
  }, [fetchCustomers]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    refreshCustomers();
  };

  const openCustomerDetail = async (id) => {
    try {
      const res = await adminApi.getCustomerById(id);
      setSelectedCustomer(res.data);
    } catch (err) {
      alert("Failed to load customer details: " + err.message);
    }
  };

  const handleToggleStatus = (customerId, currentStatus) => {
    const newStatus = currentStatus === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    setConfirmModal({
      isOpen: true,
      title: `${newStatus === "SUSPENDED" ? "Suspend" : "Reactivate"} Customer Account`,
      message: `Are you sure you want to ${newStatus.toLowerCase()} this customer's account?`,
      confirmVariant: newStatus === "SUSPENDED" ? "danger" : "emerald",
      action: async () => {
        setConfirmModal((prev) => ({ ...prev, loading: true }));
        try {
          await adminApi.updateCustomerAccountStatus(customerId, { status: newStatus });
          setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false });
          if (selectedCustomer && selectedCustomer.id === customerId) {
            openCustomerDetail(customerId);
          }
          refreshCustomers();
        } catch (err) {
          alert("Error updating status: " + err.message);
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
            <Users className="w-6 h-6 text-blue-600" /> Customer Management
          </h2>
          <p className="text-xs text-gray-500 mt-1">View customer profiles, order activity, addresses and account status</p>
        </div>
        <button
          onClick={refreshCustomers}
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
            placeholder="Search customer name, email, phone..."
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
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>
        </div>
      </div>

      {/* Customers Table */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-7 h-7 text-red-600 animate-spin" />
          <span className="text-xs text-gray-500 font-medium">Loading customers...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 rounded-2xl border border-red-200 text-center text-xs text-red-700 font-semibold">
          {error}
        </div>
      ) : customers.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-gray-200 text-center space-y-2">
          <Users className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-sm font-bold text-gray-700">No Customers Found</p>
          <p className="text-xs text-gray-500">Try adjusting your search criteria.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3.5">Customer Name</th>
                  <th className="px-4 py-3.5">Email / Phone</th>
                  <th className="px-4 py-3.5">Account Status</th>
                  <th className="px-4 py-3.5">Total Orders</th>
                  <th className="px-4 py-3.5">Joined Date</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-gray-900">{c.name}</td>
                    <td className="px-4 py-3.5">
                      <span className="block font-medium text-gray-800">{c.email}</span>
                      <span className="text-[11px] text-gray-500">{c.phone || "No phone linked"}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                          c.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-gray-800">{c._count?.orders ?? 0} Orders</td>
                    <td className="px-4 py-3.5 text-gray-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => openCustomerDetail(c.id)}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-gray-100 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{selectedCustomer.name}</h3>
                <p className="text-xs text-gray-500">{selectedCustomer.email}</p>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-500 block font-medium">Phone Number</span>
                <span className="font-bold text-gray-900">{selectedCustomer.phone || "N/A"}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Account Status</span>
                <span className="font-bold text-emerald-600 uppercase">{selectedCustomer.status}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Account Created</span>
                <span className="font-bold text-gray-900">{new Date(selectedCustomer.createdAt).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Role</span>
                <span className="font-bold text-gray-900">{selectedCustomer.role}</span>
              </div>
            </div>

            {/* Saved Addresses */}
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-500" /> Saved Delivery Addresses
              </h4>
              {selectedCustomer.addresses?.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No saved addresses found.</p>
              ) : (
                <div className="space-y-2">
                  {selectedCustomer.addresses?.map((addr) => (
                    <div key={addr.id} className="p-3 rounded-xl bg-gray-50 text-xs">
                      <span className="font-bold text-gray-900 block">{addr.label || "Address"}</span>
                      <span className="text-gray-600 block">
                        {addr.addressLine1}, {addr.city}, {addr.state} - {addr.pincode}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Orders Summary */}
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-indigo-500" /> Order History ({selectedCustomer.orders?.length})
              </h4>
              {selectedCustomer.orders?.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No orders placed yet.</p>
              ) : (
                <div className="space-y-2">
                  {selectedCustomer.orders?.map((ord) => (
                    <div key={ord.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 text-xs">
                      <div>
                        <span className="font-bold text-gray-900">{ord.orderNumber}</span>
                        <span className="text-gray-500 block text-[11px]">Cook: {ord.cook?.businessName}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-gray-900 block">₹{ord.totalAmount}</span>
                        <span className="text-[10px] font-semibold text-amber-700">{ord.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                onClick={() => handleToggleStatus(selectedCustomer.id, selectedCustomer.status)}
                className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5 text-red-400" /> {selectedCustomer.status === "SUSPENDED" ? "Reactivate Account" : "Suspend Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmVariant={confirmModal.confirmVariant || "danger"}
        loading={confirmModal.loading}
        onConfirm={() => confirmModal.action && confirmModal.action()}
        onCancel={() => setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false })}
      />
    </div>
  );
};

export default AdminCustomers;
