import { useEffect, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import {
  Save,
  Loader2,
  CheckCircle,
  Percent,
  DollarSign,
} from "lucide-react";

export const AdminSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");

  const [platformFeePercent, setPlatformFeePercent] = useState(10);
  const [deliveryFeeBase, setDeliveryFeeBase] = useState(30);

  const fetchSettings = async () => {
    try {
      const res = await adminApi.getPlatformSettings();
      if (res.data) {
        setPlatformFeePercent(res.data.platformFeePercent ?? 10);
        setDeliveryFeeBase(res.data.deliveryFeeBase ?? 30);
      }
    } catch (err) {
      setError(err.message || "Failed to load platform settings.");
    } finally {
      setLoading(false);
    }
  };

  const refreshSettings = () => {
    setLoading(true);
    setError(null);
    void fetchSettings();
  };

  useEffect(() => {
    let active = true;
    adminApi.getPlatformSettings()
      .then((res) => {
        if (!active || !res.data) return;
        setPlatformFeePercent(res.data.platformFeePercent ?? 10);
        setDeliveryFeeBase(res.data.deliveryFeeBase ?? 30);
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load platform settings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setSuccessMsg("");
      setError(null);
      await adminApi.updatePlatformSettings({
        platformFeePercent: Number(platformFeePercent),
        deliveryFeeBase: Number(deliveryFeeBase),
      });
      setSuccessMsg("Platform settings saved successfully!");
      refreshSettings();
    } catch (err) {
      setError(err.message || "Failed to update platform settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-2">
        <Loader2 className="w-7 h-7 text-red-600 animate-spin" />
        <span className="text-xs text-gray-500 font-medium">Loading platform configuration...</span>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-12">

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 font-semibold">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">Financial Fee Structure</h3>

          {/* Platform Fee Percent */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <Percent className="w-4 h-4 text-red-600" /> Platform Commission Fee (%)
            </label>
            <p className="text-xs text-gray-500">Percentage charged by TasteBridge marketplace on each completed order.</p>
            <input
              type="number"
              step="0.1"
              min="0"
              max="50"
              required
              value={platformFeePercent}
              onChange={(e) => setPlatformFeePercent(e.target.value)}
              className="w-full max-w-xs px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
          </div>

          {/* Delivery Fee Base */}
          <div className="space-y-1.5 pt-2">
            <label className="block text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-600" /> Base Delivery Fee (₹)
            </label>
            <p className="text-xs text-gray-500">Default base delivery charge applied to customer food orders.</p>
            <input
              type="number"
              step="1"
              min="0"
              required
              value={deliveryFeeBase}
              onChange={(e) => setDeliveryFeeBase(e.target.value)}
              className="w-full max-w-xs px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-100">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-[#D9532B] hover:bg-[#AD4324] text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminSettings;
