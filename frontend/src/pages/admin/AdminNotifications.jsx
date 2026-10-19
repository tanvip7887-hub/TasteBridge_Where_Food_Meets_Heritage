import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../../api/adminApi.js";
import {
  Bell,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Info,
} from "lucide-react";

export const AdminNotifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const fetchNotifications = async () => {
    try {
      const res = await adminApi.getNotifications();
      setNotifications((res.data || []).filter((notification) => !notification.isRead));
    } catch (err) {
      setError(err.message || "Failed to load platform notifications.");
    } finally {
      setLoading(false);
    }
  };

  const refreshNotifications = () => {
    setLoading(true);
    setError(null);
    void fetchNotifications();
  };

  useEffect(() => {
    let active = true;
    adminApi.getNotifications()
      .then((res) => {
        if (active) setNotifications((res.data || []).filter((notification) => !notification.isRead));
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load platform notifications.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      await adminApi.markNotificationAsRead(id);
      setNotifications((items) => items.filter((item) => item.id !== id));
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const openNotification = async (notification) => {
    try {
      await adminApi.markNotificationAsRead(notification.id);
      setNotifications((items) => items.filter((item) => item.id !== notification.id));
      const href = notification.metadata?.href;
      if (typeof href === "string" && href.startsWith("/") && !href.startsWith("//")) navigate(href);
    } catch (err) { alert("Error: " + err.message); }
  };

  const handleMarkAllAsRead = async () => {
    try {
      setMarkingAllRead(true);
      await adminApi.markAllNotificationsAsRead();
      setNotifications([]);
    } catch (err) {
      setError(err.message || "Failed to mark notifications as read.");
    } finally {
      setMarkingAllRead(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-red-600" /> Platform Notifications & Alerts
          </h2>
          <p className="text-xs text-gray-500 mt-1">Audit verification queue alerts, system heartbeats and automated operational logs</p>
        </div>
        <div className="flex items-center gap-2">
          {notifications.length > 0 && <button
            type="button"
            onClick={handleMarkAllAsRead}
            disabled={markingAllRead}
            className="px-3.5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            {markingAllRead ? "Marking read…" : "Mark all as read"}
          </button>}
          <button
          onClick={refreshNotifications}
            className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-7 h-7 text-red-600 animate-spin" />
          <span className="text-xs text-gray-500 font-medium">Loading alerts...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 rounded-2xl border border-red-200 text-center text-xs text-red-700 font-semibold">
          {error}
        </div>
      ) : notifications.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-gray-200 text-center space-y-2">
          <Bell className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-sm font-bold text-gray-700">No unread notifications</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 rounded-2xl border flex items-start justify-between gap-4 transition-all ${
                n.isRead ? "bg-white border-gray-200/80 opacity-75" : "bg-red-50/40 border-red-200 font-semibold"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
                  {n.type === "VERIFICATION_ALERT" ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <Info className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">{n.title}</h4>
                  <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                  <span className="text-[10px] text-gray-400 block mt-2">{new Date(n.createdAt).toLocaleString()}</span>
                  {typeof n.metadata?.href === "string" && n.metadata.href.startsWith("/") && !n.metadata.href.startsWith("//") && <button type="button" onClick={() => void openNotification(n)} className="mt-2 text-xs font-bold text-red-700 underline">Open related page</button>}
                </div>
              </div>

              {!n.isRead && (
                <button
                  onClick={() => handleMarkAsRead(n.id)}
                  className="px-3 py-1 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold shrink-0 cursor-pointer"
                >
                  Mark Read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;
