import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, Check, Home, LoaderCircle, MapPin, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { addressApi } from "../api/addressApi.js";

const emptyForm = (isDefault = false) => ({
  label: "Home",
  recipientName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  locality: "",
  city: "",
  state: "",
  pincode: "",
  landmark: "",
  isDefault,
});

const fields = [
  ["recipientName", "Recipient name", "text", true],
  ["phone", "Phone number", "tel", true],
  ["addressLine1", "Address line 1", "text", true],
  ["addressLine2", "Address line 2", "text", false],
  ["locality", "Locality / area", "text", true],
  ["city", "City", "text", true],
  ["state", "State", "text", true],
  ["pincode", "PIN code", "text", true],
  ["landmark", "Landmark", "text", false],
];

export const AddressesPage = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const response = await addressApi.list();
      setItems(Array.isArray(response?.data?.items) ? response.data.items : []);
    } catch (requestError) {
      setError(requestError.message || "Saved addresses could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    addressApi.list()
      .then((response) => {
        if (active) setItems(Array.isArray(response?.data?.items) ? response.data.items : []);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "Saved addresses could not be loaded.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm(items.length === 0));
    setError("");
    setFeedback("");
  };

  const openEdit = (address) => {
    setEditingId(address.id);
    setForm({ ...emptyForm(), ...address, isDefault: Boolean(address.isDefault) });
    setError("");
    setFeedback("");
  };

  const saveAddress = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = editingId
        ? await addressApi.update(editingId, form)
        : await addressApi.create(form);
      setItems(response?.data?.items || []);
      setForm(null);
      setEditingId(null);
      setFeedback(editingId ? "Address updated." : "Address saved.");
    } catch (requestError) {
      setError(requestError.message || "The address could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const performAddressAction = async (address, action, successMessage) => {
    setBusyId(address.id);
    setError("");
    setFeedback("");
    try {
      const response = await action(address.id);
      setItems(response?.data?.items || []);
      setFeedback(successMessage);
    } catch (requestError) {
      setError(requestError.message || "The address could not be updated.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link to="/profile" className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:text-red-800"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Profile</Link>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">Delivery addresses</h1>
          <p className="mt-1 text-sm text-gray-600">Save complete delivery details for future orders.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={refresh} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh</button>
          {!form && <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"><Plus className="h-4 w-4" aria-hidden="true" /> Add address</button>}
        </div>
      </div>

      {error && <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</div>}
      {feedback && <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{feedback}</p>}

      {form && (
        <form onSubmit={saveAddress} className="mt-6 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-bold text-gray-900">{editingId ? "Edit address" : "Add delivery address"}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-gray-700">Address label
              <select value={form.label || "Home"} onChange={(event) => setForm({ ...form, label: event.target.value })} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5" aria-label="Address label">
                {["Home", "Work", "Other"].map((label) => <option key={label}>{label}</option>)}
              </select>
            </label>
            {fields.map(([key, label, type, required]) => (
              <label key={key} className={`space-y-1 text-sm font-medium text-gray-700 ${["addressLine1", "addressLine2", "locality", "landmark"].includes(key) ? "sm:col-span-2" : ""}`}>
                {label}{required && <span aria-hidden="true"> *</span>}
                <input type={type} value={form[key] || ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={required} maxLength={key === "pincode" ? 6 : undefined} inputMode={key === "phone" || key === "pincode" ? "numeric" : undefined} autoComplete={key === "phone" ? "tel" : key === "pincode" ? "postal-code" : undefined} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100" />
              </label>
            ))}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={Boolean(form.isDefault)} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} /> Set as default delivery address</label>
          <div className="mt-5 flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button type="button" onClick={() => { setForm(null); setEditingId(null); }} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{saving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}{saving ? "Saving…" : editingId ? "Save changes" : "Save address"}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="mt-10 flex min-h-40 items-center justify-center gap-3 text-sm text-gray-600" role="status"><LoaderCircle className="h-5 w-5 animate-spin text-red-600" aria-hidden="true" /> Loading saved addresses…</div>
      ) : items.length === 0 && !error ? (
        <section className="mt-7 rounded-3xl border border-dashed border-orange-200 bg-white px-5 py-14 text-center">
          <Home className="mx-auto h-10 w-10 text-orange-300" aria-hidden="true" />
          <h2 className="mt-3 font-bold text-gray-900">No saved addresses yet</h2>
          <p className="mt-1 text-sm text-gray-600">Add a delivery address to keep it ready for future ordering.</p>
          {!form && <button type="button" onClick={openCreate} className="mt-4 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700">Add your first address</button>}
        </section>
      ) : (
        <section className="mt-7 grid gap-4 md:grid-cols-2" aria-label="Saved addresses">
          {items.map((address) => (
            <article key={address.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${address.isDefault ? "border-emerald-300" : "border-gray-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-red-600" aria-hidden="true" /><h2 className="font-bold text-gray-900">{address.label || "Delivery address"}</h2></div>
                {address.isDefault && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"><Check className="h-3.5 w-3.5" aria-hidden="true" /> Default</span>}
              </div>
              <p className="mt-3 text-sm font-semibold text-gray-900">{address.recipientName || "Recipient details needed"}</p>
              <p className="mt-1 text-sm text-gray-700">{[address.addressLine1, address.addressLine2, address.locality, address.landmark, address.city, address.state, address.pincode].filter(Boolean).join(", ")}</p>
              <p className="mt-2 text-sm text-gray-600">{address.phone || "Phone number needed"}</p>
              <div className="mt-4 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-3 text-sm">
                {!address.isDefault && <button type="button" disabled={busyId === address.id} onClick={() => performAddressAction(address, addressApi.setDefault, "Default address updated.")} className="font-semibold text-emerald-700 hover:underline disabled:opacity-50">Set default</button>}
                <button type="button" onClick={() => openEdit(address)} className="inline-flex items-center gap-1 font-semibold text-gray-700 hover:text-red-700"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit</button>
                <button type="button" disabled={busyId === address.id} onClick={() => { if (window.confirm("Delete this saved address?")) performAddressAction(address, addressApi.remove, "Address deleted."); }} className="inline-flex items-center gap-1 font-semibold text-red-700 hover:underline disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete</button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
};

export default AddressesPage;
