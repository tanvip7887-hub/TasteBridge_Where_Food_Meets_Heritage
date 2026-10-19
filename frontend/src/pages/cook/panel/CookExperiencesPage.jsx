import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Calendar, CheckCircle2, Clock3, Edit3, ImagePlus, LoaderCircle, MapPin, Plus, RefreshCw, Sparkles, Users, X } from "lucide-react";
import cookApi from "../../../api/cookApi.js";
import { getDineExperiencePublishKey, retireDineExperiencePublishKey } from "../../../utils/dineExperiencePublish.js";
import { formatIstDateTime, istLocalDateTimeToInstant } from "../../../utils/istDateTime.js";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
const emptyDraft = () => ({
  type: "HOME_DINING", title: "", theme: "", cuisine: "", isVegetarian: false,
  description: "", dietaryNotes: "", menuNotes: "", pricePerPerson: "",
  teachingContent: "", learningOutcomes: "", materialsToBring: "", workshopImage: null, removeExistingImage: false,
  maxGuests: "3", capacity: "", durationMinutes: "120", location: "", eventDate: "", eventStartTime: "",
});
const formFromExperience = (experience) => ({
  ...emptyDraft(),
  type: experience.type || "HOME_DINING",
  title: experience.title || "",
  theme: experience.theme || "",
  cuisine: experience.cuisine || "",
  isVegetarian: Boolean(experience.isVegetarian),
  description: experience.description || "",
  dietaryNotes: experience.dietaryNotes || "",
  menuNotes: experience.menuNotes || "",
  teachingContent: experience.teachingContent || "",
  learningOutcomes: experience.learningOutcomes || "",
  materialsToBring: experience.materialsToBring || "",
  existingWorkshopImage: experience.image || experience.photos?.[0] || "",
  pricePerPerson: experience.pricePerPerson ?? "",
  maxGuests: experience.maxGuests ?? "3",
  durationMinutes: experience.durationMinutes ?? "120",
  location: experience.privateAddress || "",
});
const eventDataFromDraft = (draft) => ({
  type: draft.type,
  title: draft.title.trim(),
  theme: draft.theme.trim(),
  description: draft.description.trim(),
  ...(draft.type === "WORKSHOP" ? {
    teachingContent: draft.teachingContent.trim(),
    learningOutcomes: draft.learningOutcomes.trim(),
    materialsToBring: draft.materialsToBring.trim() || null,
  } : {
    cuisine: draft.cuisine.trim(),
    isVegetarian: draft.isVegetarian,
    dietaryNotes: draft.dietaryNotes.trim() || null,
    menuNotes: draft.menuNotes.trim(),
  }),
  pricePerPerson: Number(draft.pricePerPerson),
  maxGuests: Number(draft.maxGuests),
  ...(draft.capacity !== "" ? { capacity: Number(draft.capacity) } : {}),
  durationMinutes: Number(draft.durationMinutes),
  location: draft.location.trim(),
});

const hashWorkshopImage = async (file) => {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
};

const Field = ({ label, name, value, onChange, required = false, ...props }) => (
  <label className="block space-y-1.5 text-sm font-semibold text-[#2B1B12]">
    <span>{label}{required && <span className="text-red-600"> *</span>}</span>
    <input name={name} value={value} onChange={onChange} required={required} className="w-full rounded-xl border border-[#2B1B12]/15 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#D2552B] focus:ring-2 focus:ring-[#D2552B]/10" {...props} />
  </label>
);

const ExperienceEditor = ({ initial, saving, onCancel, onSave }) => {
  const creating = !initial;
  const [draft, setDraft] = useState(() => initial ? formFromExperience(initial) : emptyDraft());
  const imagePreview = useMemo(() => draft.workshopImage ? URL.createObjectURL(draft.workshopImage) : (draft.removeExistingImage ? "" : draft.existingWorkshopImage || ""), [draft.workshopImage, draft.removeExistingImage, draft.existingWorkshopImage]);
  useEffect(() => () => { if (draft.workshopImage && imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview); }, [draft.workshopImage, imagePreview]);
  const change = (event) => {
    const { name, value, type, checked } = event.target;
    setDraft((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  };
  const submit = (event) => {
    event.preventDefault();
    try {
      const data = eventDataFromDraft(draft);
      if (draft.type === "WORKSHOP" && creating && !draft.workshopImage) throw new Error("Upload a workshop image before submitting it for Admin review.");
      if (draft.type === "WORKSHOP" && !creating && !imagePreview && !draft.workshopImage) throw new Error("A workshop needs an image before it can be submitted for review.");
      void onSave(creating
        ? { ...data, startsAt: istLocalDateTimeToInstant(`${draft.eventDate}T${draft.eventStartTime}`) }
        : { ...data, publicArea: initial.publicArea || initial.location || "", addressSource: initial.addressSource || "CUSTOM" }, creating, null, draft.workshopImage, draft.removeExistingImage);
    } catch (error) {
      onSave(null, creating, error);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5 rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-lg font-extrabold text-[#2B1B12]">{creating ? "Publish a new event" : "Edit event details"}</h3><p className="mt-1 text-xs text-[#2B1B12]/65">{creating ? draft.type === "WORKSHOP" ? "The first date is created with your submission. The workshop stays hidden until Admin approval." : "Complete this form once. The first availability slot is created and the event is published together." : "Update the event details using the same fields."}</p></div>
        <button type="button" onClick={onCancel} disabled={saving} aria-label="Close editor" className="rounded-lg px-3 py-2 text-sm font-semibold text-[#2B1B12]/60 hover:bg-orange-50 disabled:opacity-50">Close</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm font-semibold text-[#2B1B12]">Experience type
          <select name="type" value={draft.type} onChange={change} className="w-full rounded-xl border border-[#2B1B12]/15 bg-white px-3 py-2.5 text-sm font-normal"><option value="HOME_DINING">Home dining</option><option value="WORKSHOP">Workshop</option></select>
        </label>
        <Field label="Title" name="title" value={draft.title} onChange={change} required minLength={3} maxLength={120} />
        <Field label="Theme" name="theme" value={draft.theme} onChange={change} required maxLength={120} />
        {draft.type === "HOME_DINING" && <Field label="Cuisine" name="cuisine" value={draft.cuisine} onChange={change} required maxLength={120} />}
        {draft.type === "HOME_DINING" && <label className="block space-y-1.5 text-sm font-semibold text-[#2B1B12]">Menu type
          <select name="isVegetarian" value={String(draft.isVegetarian)} onChange={(event) => setDraft((current) => ({ ...current, isVegetarian: event.target.value === "true" }))} className="w-full rounded-xl border border-[#2B1B12]/15 bg-white px-3 py-2.5 text-sm font-normal"><option value="true">Vegetarian</option><option value="false">Non-vegetarian</option></select>
        </label>}
        <Field label="Price per person (INR)" name="pricePerPerson" value={draft.pricePerPerson} onChange={change} type="number" min="0.01" max="100000" step="0.01" required />
        <Field label="Maximum guests per booking" name="maxGuests" value={draft.maxGuests} onChange={change} type="number" min="1" max="3" step="1" required />
        {creating && <Field label="Seats for this event date" name="capacity" value={draft.capacity} onChange={change} type="number" min="1" max="100" step="1" required />}
        <Field label="Duration (minutes)" name="durationMinutes" value={draft.durationMinutes} onChange={change} type="number" min="15" max="1440" step="1" required />
        <Field label="Location" name="location" value={draft.location} onChange={change} required minLength={8} maxLength={2000} autoComplete="street-address" />
        {creating && <>
          <Field label="Event date" name="eventDate" value={draft.eventDate} onChange={change} type="date" required />
          <Field label="Event start time (IST)" name="eventStartTime" value={draft.eventStartTime} onChange={change} type="time" required />
        </>}
      </div>
      <p className="text-xs leading-5 text-[#2B1B12]/60">{draft.type === "WORKSHOP" ? "Workshops are in-person. Enter the real venue address; customers see your Cook profile locality and city until a booking is confirmed. The end time is calculated from duration. Available seats are the total capacity; one booking can include up to 3 participants." : "The full venue address is kept private until a booking is confirmed. Customers see your Cook profile locality and city. The event end time is calculated from duration. “Maximum guests per booking” limits one customer's booking; “Seats for this event date” is the total capacity of this date. Cook profile photo is used as the listing image."}</p>
      {draft.type === "WORKSHOP" && <div className="space-y-4 rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
        <label className="block space-y-1.5 text-sm font-semibold text-[#2B1B12]">What will you teach?<textarea name="teachingContent" value={draft.teachingContent} onChange={change} required minLength={10} maxLength={5000} rows={3} placeholder="Describe the recipes, techniques, or skills covered." className="w-full rounded-xl border border-[#2B1B12]/15 bg-white px-3 py-2.5 text-sm font-normal" /></label>
        <label className="block space-y-1.5 text-sm font-semibold text-[#2B1B12]">What will participants learn?<textarea name="learningOutcomes" value={draft.learningOutcomes} onChange={change} required minLength={10} maxLength={3000} rows={3} placeholder="List the skills participants can expect to learn." className="w-full rounded-xl border border-[#2B1B12]/15 bg-white px-3 py-2.5 text-sm font-normal" /></label>
        <label className="block space-y-1.5 text-sm font-semibold text-[#2B1B12]">Materials or ingredients to bring (optional)<textarea name="materialsToBring" value={draft.materialsToBring} onChange={change} maxLength={2000} rows={2} className="w-full rounded-xl border border-[#2B1B12]/15 bg-white px-3 py-2.5 text-sm font-normal" /></label>
        <div className="space-y-2">
          <span className="block text-sm font-semibold text-[#2B1B12]">Workshop image <span className="text-red-600">*</span></span>
          {imagePreview ? <div className="relative w-fit"><img src={imagePreview} alt="Workshop preview" className="h-40 w-full max-w-sm rounded-xl object-cover" /><button type="button" onClick={() => draft.workshopImage ? setDraft((current) => ({ ...current, workshopImage: null })) : setDraft((current) => ({ ...current, removeExistingImage: true }))} aria-label="Remove workshop image" disabled={saving} className="absolute right-2 top-2 rounded-full bg-white p-2 text-red-700 shadow"><X size={16} /></button></div> : <div className="flex h-28 max-w-sm items-center justify-center rounded-xl border border-dashed border-[#2B1B12]/30 bg-white text-sm text-[#2B1B12]/55"><ImagePlus className="mr-2" size={18} />Choose a workshop image</div>}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#2B1B12]/20 bg-white px-3 py-2 text-sm font-semibold text-[#2B1B12]">{imagePreview ? "Replace image" : "Upload image"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) { onSave(null, creating, new Error("Choose a JPG, PNG, or WebP image up to 5 MB.")); event.target.value = ""; return; } setDraft((current) => ({ ...current, workshopImage: file, removeExistingImage: false })); }} /></label>
          <p className="text-xs text-[#2B1B12]/60">Use an image that represents this workshop. JPG, PNG, or WebP, up to 5 MB.</p>
        </div>
      </div>}
      <label className="block space-y-1.5 text-sm font-semibold text-[#2B1B12]">{draft.type === "WORKSHOP" ? "Workshop description" : "Description"}
        <textarea name="description" value={draft.description} onChange={change} required minLength={10} maxLength={5000} rows={4} className="w-full rounded-xl border border-[#2B1B12]/15 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#D2552B]" />
      </label>
      {draft.type === "HOME_DINING" && <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm font-semibold text-[#2B1B12]">Dietary notes<textarea name="dietaryNotes" value={draft.dietaryNotes} onChange={change} maxLength={2000} rows={3} className="w-full rounded-xl border border-[#2B1B12]/15 bg-white px-3 py-2.5 text-sm font-normal" /></label>
        <label className="block space-y-1.5 text-sm font-semibold text-[#2B1B12]">Menu notes <span className="text-red-600">*</span><textarea name="menuNotes" value={draft.menuNotes} onChange={change} required maxLength={2000} rows={3} className="w-full rounded-xl border border-[#2B1B12]/15 bg-white px-3 py-2.5 text-sm font-normal" /></label>
      </div>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-[#2B1B12]/15 px-4 py-2.5 text-sm font-semibold text-[#2B1B12] disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#D2552B] px-5 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">{saving ? <LoaderCircle size={16} className="animate-spin" /> : null}{creating ? draft.type === "WORKSHOP" ? "Submit Workshop for Review" : "Publish Event" : "Save changes"}</button>
      </div>
    </form>
  );
};

export const CookExperiencesPage = () => {
  const [experiences, setExperiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [slotEditorId, setSlotEditorId] = useState(null);
  const [slotDraft, setSlotDraft] = useState({ eventDate: "", eventStartTime: "", capacity: "" });
  const actionLock = useRef(false);

  const loadExperiences = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setLoadError("");
    try {
      const payload = unwrap(await cookApi.getExperiences());
      if (!Array.isArray(payload?.items)) throw new Error("Cook experiences could not be read. Please retry.");
      setExperiences(payload.items);
    } catch (error) {
      setLoadError(error?.message || "Experiences could not be loaded.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    cookApi.getExperiences().then((response) => {
      if (!active) return;
      const payload = unwrap(response);
      if (!Array.isArray(payload?.items)) throw new Error("Cook experiences could not be read. Please retry.");
      setExperiences(payload.items);
      setLoadError("");
    }).catch((error) => { if (active) setLoadError(error?.message || "Experiences could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const refreshAfterAction = async () => loadExperiences({ silent: true });
  const saveExperience = async (data, creating, formError, workshopImage, removeExistingImage) => {
    if (formError) { setActionError(formError.message || "Enter a valid event date and start time."); return; }
    if (actionLock.current) return;
    actionLock.current = true;
    setSaving(true);
    setActionError("");
    setSuccess("");
    try {
      if (creating) {
        const idempotencyPayload = workshopImage ? { ...data, workshopImageHash: await hashWorkshopImage(workshopImage) } : data;
        const pendingKey = await getDineExperiencePublishKey(idempotencyPayload);
        const result = unwrap(await cookApi.publishNewExperience({ ...data, idempotencyKey: pendingKey }, workshopImage));
        const submittedStatus = data.type === "WORKSHOP" ? "PENDING" : "PUBLISHED";
        if (!result?.id || result.status !== submittedStatus || !result.slots?.length) throw new Error("The event was submitted, but its status and first date could not be confirmed. Refresh before retrying.");
        retireDineExperiencePublishKey(pendingKey);
        setSuccess(data.type === "WORKSHOP" ? "Workshop submitted for Admin review. It will be visible to customers after approval." : "Event published and its first date is available to customers.");
      } else {
        const { location, ...fields } = data;
        await cookApi.updateExperience(editor.id, { ...fields, privateAddress: location, addressSource: "CUSTOM" });
        if (editor.type === "WORKSHOP") {
          if (workshopImage) await cookApi.replaceWorkshopImage(editor.id, workshopImage);
          else if (removeExistingImage) await cookApi.removeWorkshopImage(editor.id);
        }
        setSuccess("Event details saved.");
      }
      setEditor(null);
      await refreshAfterAction();
    } catch (error) {
      setActionError(error?.message || "The event could not be published. Check the details and try again.");
    } finally {
      actionLock.current = false;
      setSaving(false);
    }
  };

  const changeStatus = async (experience) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusyId(experience.id);
    setActionError("");
    setSuccess("");
    try {
      if (experience.status === "PUBLISHED") { await cookApi.pauseExperience(experience.id); setSuccess("Experience unpublished and paused."); }
      else {
        await cookApi.publishExperience(experience.id);
        setSuccess(experience.type === "WORKSHOP" ? "Workshop submitted for Admin review." : "Experience published.");
      }
      await refreshAfterAction();
    } catch (error) { setActionError(error?.message || "Experience status could not be changed."); }
    finally { actionLock.current = false; setBusyId(null); }
  };

  const saveSlot = async (event) => {
    event.preventDefault();
    if (!slotEditorId || actionLock.current) return;
    const experience = experiences.find((item) => item.id === slotEditorId);
    if (!experience) return;
    actionLock.current = true;
    setBusyId(slotEditorId);
    setActionError("");
    setSuccess("");
    try {
      const startsAt = istLocalDateTimeToInstant(`${slotDraft.eventDate}T${slotDraft.eventStartTime}`);
      const endsAt = new Date(new Date(startsAt).getTime() + experience.durationMinutes * 60_000).toISOString();
      await cookApi.createExperienceSlot(slotEditorId, { startsAt, endsAt, capacity: Number(slotDraft.capacity) });
      setSlotEditorId(null);
      setSlotDraft({ eventDate: "", eventStartTime: "", capacity: "" });
      setSuccess("Availability date added.");
      await refreshAfterAction();
    } catch (error) { setActionError(error?.message || "The availability date could not be added."); }
    finally { actionLock.current = false; setBusyId(null); }
  };

  const openNewEditor = () => { setActionError(""); setSuccess(""); setEditor({}); };
  const openEditEditor = (experience) => { setActionError(""); setSuccess(""); setEditor(experience); };

  return (
    <div className="space-y-6 text-left animate-in fade-in duration-200">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl font-extrabold tracking-tight text-[#2B1B12] sm:text-2xl">My events</h2><p className="mt-1 text-xs text-[#2B1B12]/70 sm:text-sm">Create and manage your dining experiences and workshops.</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadExperiences()} disabled={loading || saving || Boolean(busyId)} className="inline-flex items-center gap-2 rounded-xl border border-[#2B1B12]/15 bg-white px-3 py-2.5 text-sm font-semibold text-[#2B1B12] disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Refresh</button>
          <button type="button" onClick={openNewEditor} disabled={saving || Boolean(busyId)} className="inline-flex items-center gap-2 rounded-xl bg-[#D2552B] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-[#D2552B]/20 disabled:opacity-50"><Plus size={16} />Host New Event</button>
        </div>
      </div>

      {actionError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle size={17} className="mt-0.5 shrink-0" />{actionError}</div>}
      {success && <div role="status" className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{success}</div>}
      {editor && <ExperienceEditor key={editor.id || "new"} initial={editor.id ? editor : null} saving={saving} onCancel={() => setEditor(null)} onSave={saveExperience} />}

      {loading ? <div role="status" className="flex items-center justify-center gap-2 rounded-3xl border border-[#2B1B12]/10 bg-white p-12 text-sm text-[#2B1B12]/70"><LoaderCircle size={20} className="animate-spin" />Loading your experiences…</div>
        : loadError ? <div className="rounded-3xl border border-red-200 bg-white p-8 text-center"><p role="alert" className="text-sm text-red-700">{loadError}</p><button type="button" onClick={() => void loadExperiences()} className="mt-4 rounded-xl bg-[#D2552B] px-4 py-2 text-sm font-bold text-white">Retry</button></div>
          : experiences.length === 0 ? <div className="space-y-4 rounded-3xl border border-[#2B1B12]/10 bg-white p-8 text-center shadow-xs sm:p-14">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#3E5B3A]/10 text-[#3E5B3A]"><Sparkles size={32} /></div>
            <div className="mx-auto max-w-md space-y-2"><h3 className="text-lg font-bold text-[#2B1B12]">No experiences yet</h3><p className="text-xs leading-relaxed text-[#2B1B12]/60 sm:text-sm">Create a Dine event or submit a workshop for Admin review with its first date.</p></div>
            <button type="button" onClick={openNewEditor} className="inline-flex items-center gap-2 rounded-xl bg-[#D2552B] px-5 py-2.5 text-xs font-bold text-white"><Plus size={16} />Publish your first event</button>
          </div>
            : <div className="space-y-4">
              {experiences.map((experience) => (
                <article key={experience.id} className="rounded-3xl border border-[#2B1B12]/10 bg-white p-5 shadow-xs sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-extrabold text-[#2B1B12]">{experience.title}</h3><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-[#D2552B]">{String(experience.status).replaceAll("_", " ")}</span><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{experience.type === "WORKSHOP" ? "Workshop" : "Home dining"}</span></div>
                      <p className="mt-1 text-sm text-[#2B1B12]/70">{experience.theme || experience.cuisine || "Experience"}</p>
                      {experience.type === "WORKSHOP" && (experience.image || experience.photos?.[0]) && <img src={experience.image || experience.photos[0]} alt={`${experience.title} workshop`} className="mt-3 h-36 w-full max-w-md rounded-xl object-cover" />}
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#2B1B12]/65"><span className="inline-flex items-center gap-1.5"><MapPin size={14} />{experience.publicArea || experience.location || "Area not set"}</span>{experience.pricePerPerson != null && <span>₹{experience.pricePerPerson} per person</span>}<span className="inline-flex items-center gap-1.5"><Users size={14} />Up to {experience.maxGuests ?? "—"} guests per booking</span></div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => openEditEditor(experience)} disabled={Boolean(busyId) || saving} className="inline-flex items-center gap-1.5 rounded-xl border border-[#2B1B12]/15 px-3 py-2 text-xs font-bold text-[#2B1B12] disabled:opacity-50"><Edit3 size={14} />Edit</button>
                      <button type="button" onClick={() => void changeStatus(experience)} disabled={Boolean(busyId) || saving || !["PUBLISHED", "PAUSED", "DRAFT", ...(experience.type === "WORKSHOP" ? ["REJECTED"] : [])].includes(experience.status)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E5B3A] px-3 py-2 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-50">{busyId === experience.id ? <LoaderCircle size={14} className="animate-spin" /> : null}{experience.status === "PUBLISHED" ? "Unpublish" : experience.type === "WORKSHOP" ? "Submit for review" : "Publish"}</button>
                      <button type="button" onClick={() => { setSlotEditorId(experience.id); setSlotDraft({ eventDate: "", eventStartTime: "", capacity: "" }); }} disabled={Boolean(busyId) || saving} className="inline-flex items-center gap-1.5 rounded-xl border border-[#D2552B]/30 px-3 py-2 text-xs font-bold text-[#D2552B] disabled:opacity-50"><Calendar size={14} />Add date</button>
                    </div>
                  </div>
                  {experience.reviewRejectionReason && experience.status === "REJECTED" && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><strong>Admin feedback:</strong> {experience.reviewRejectionReason}</p>}
                  {experience.status === "PENDING" && experience.type === "WORKSHOP" && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Awaiting Admin review. Customers cannot see or book this workshop until it is approved.</p>}
                  {experience.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#2B1B12]/75">{experience.description}</p>}
                  {experience.type === "WORKSHOP" && <div className="mt-3 space-y-1 text-sm text-[#2B1B12]/75"><p><strong>What you will teach:</strong> {experience.teachingContent || "Add teaching details before submission."}</p><p><strong>Participants will learn:</strong> {experience.learningOutcomes || "Add learning outcomes before submission."}</p>{experience.materialsToBring && <p><strong>Bring:</strong> {experience.materialsToBring}</p>}</div>}
                  <div className="mt-5 border-t border-[#2B1B12]/10 pt-4">
                    <h4 className="text-sm font-bold text-[#2B1B12]">Availability</h4>
                    {experience.slots?.length ? <ul className="mt-2 grid gap-2 sm:grid-cols-2">{experience.slots.map((slot) => <li key={slot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-orange-50/70 px-3 py-2 text-xs text-[#2B1B12]/75"><span className="inline-flex items-center gap-2"><Clock3 size={14} />{formatIstDateTime(slot.startsAt)} · {formatIstDateTime(slot.endsAt)}</span><span>{slot.availableSeats}/{slot.capacity} seats · {slot.status}</span></li>)}</ul> : <p className="mt-2 text-xs text-[#2B1B12]/60">No availability dates.</p>}
                  </div>
                  {slotEditorId === experience.id && <form onSubmit={saveSlot} className="mt-4 grid gap-3 rounded-2xl border border-orange-100 bg-orange-50/40 p-4 sm:grid-cols-3 sm:items-end">
                    <Field label="Event date" name="eventDate" value={slotDraft.eventDate} onChange={(event) => setSlotDraft((draft) => ({ ...draft, eventDate: event.target.value }))} type="date" required />
                    <Field label="Event start time (IST)" name="eventStartTime" value={slotDraft.eventStartTime} onChange={(event) => setSlotDraft((draft) => ({ ...draft, eventStartTime: event.target.value }))} type="time" required />
                    <Field label="Seats for this date" name="capacity" value={slotDraft.capacity} onChange={(event) => setSlotDraft((draft) => ({ ...draft, capacity: event.target.value }))} type="number" min="1" max="100" step="1" required />
                    <div className="flex gap-2"><button type="button" onClick={() => setSlotEditorId(null)} disabled={busyId === experience.id} className="rounded-lg border border-[#2B1B12]/15 px-3 py-2 text-xs font-bold">Cancel</button><button type="submit" disabled={Boolean(busyId)} className="inline-flex items-center gap-1 rounded-lg bg-[#D2552B] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busyId === experience.id && <LoaderCircle size={13} className="animate-spin" />}Add date</button></div>
                    <p className="text-xs text-[#2B1B12]/60 sm:col-span-3">End time is calculated from the event duration. Maximum guests per booking and total seats for this date are separate limits.</p>
                  </form>}
                </article>
              ))}
            </div>}
    </div>
  );
};

export default CookExperiencesPage;
