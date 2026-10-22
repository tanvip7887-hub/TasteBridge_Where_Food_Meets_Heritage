import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { AlertCircle, BookOpen, Clock3, LoaderCircle, MessageCircle, MessageSquare, Pencil, Plus, Send, Trash2, Upload } from "lucide-react";
import cookApi from "../../../api/cookApi.js";
import { createPostComment, deletePostComment, listPublicStories } from "../../../api/socialApi.js";
import { activeStoriesForCook, findPublicStoryGroupForCook, ownStoryViewerPath } from "../../../utils/cookStoryEntry.js";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
const tabs = ["Posts", "Active stories", "Drafts", "Comments"];
const postTypes = ["PHOTO", "VIDEO", "RECIPE", "HERITAGE_STORY"];
const readableType = (value) => ({ PHOTO: "Photo", VIDEO: "Video", RECIPE: "Recipe", HERITAGE_STORY: "Heritage story" })[value] || value;
const errorText = (error) => error?.response?.data?.message || error?.message || "Please try again.";
const makeCommentRequestKey = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

const remainingText = (expiresAt, now) => {
  if (now == null) return "Calculating…";
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  if (!Number.isFinite(seconds) || seconds <= 0) return "Expired";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m remaining`;
};

const updateThread = (items, commentId, update) => (items || []).map((item) => item.id === commentId
  ? update(item)
  : { ...item, replies: updateThread(item.replies, commentId, update) });

const CommentThread = ({ item, onReply, onDelete, busy }) => (
  <div className="border-l-2 border-[#D2552B]/15 pl-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#2B1B12]">{item.deleted ? "Deleted comment" : item.author?.displayName || "TasteBridge user"}{!item.deleted && item.author?.role && <span className="ml-1.5 text-xs font-medium text-[#2B1B12]/50">· {item.author.role === "COOK" ? "Cook" : "Customer"}</span>}</p>
        <p className={`mt-1 whitespace-pre-wrap break-words text-sm ${item.deleted ? "italic text-[#2B1B12]/45" : "text-[#2B1B12]/85"}`}>{item.deleted ? "This comment was removed." : item.text}</p>
        <time className="mt-1 block text-[11px] text-[#2B1B12]/45" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
      </div>
      {!item.deleted && <div className="flex shrink-0 gap-3 text-xs font-semibold">
        <button type="button" onClick={() => onReply(item)} className="text-[#B84722] hover:underline">Reply</button>
        {item.canDelete && <button type="button" disabled={busy} onClick={() => onDelete(item)} className="text-red-700 hover:underline disabled:opacity-50">Delete</button>}
      </div>}
    </div>
    {item.replies?.length > 0 && <div className="mt-3 space-y-3 pl-3">{item.replies.map((reply) => <CommentThread key={reply.id} item={reply} onReply={onReply} onDelete={onDelete} busy={busy} />)}</div>}
  </div>
);

const MediaInput = ({ type, onChange, multiple = false, allowStoryVideo = false }) => (
  <label className="block space-y-1 text-sm font-semibold text-[#2B1B12]">
    <span>{type === "VIDEO" ? "Video (up to 60 seconds, 25 MB)" : "Photos (up to 5, each up to 5 MB)"}</span>
    <input
      aria-label={type === "VIDEO" ? "Choose video" : "Choose photos"}
      type="file"
      accept={allowStoryVideo ? "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" : type === "VIDEO" ? "video/mp4,video/quicktime,video/webm" : "image/jpeg,image/png,image/webp"}
      multiple={multiple}
      onChange={onChange}
      className="block w-full rounded-xl border border-[#2B1B12]/15 bg-white p-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#D2552B]/10 file:px-3 file:py-2 file:font-semibold file:text-[#B84722]"
    />
  </label>
);

export const CookStoriesPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.user);
  const cookId = user?.cookProfile?.id;
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") === "Comments" ? "Comments" : "Posts");
  const [posts, setPosts] = useState([]);
  const [stories, setStories] = useState([]);
  const [ownStoryGroup, setOwnStoryGroup] = useState(null);
  const [ownStoryCheckFailed, setOwnStoryCheckFailed] = useState(false);
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [caption, setCaption] = useState("");
  const [dishId, setDishId] = useState("");
  const [postType, setPostType] = useState("PHOTO");
  const [mediaFiles, setMediaFiles] = useState([]);
  const [editTarget, setEditTarget] = useState(null);
  const [clockNow, setClockNow] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsPagination, setCommentsPagination] = useState(null);
  const [commentsCount, setCommentsCount] = useState(0);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState("");
  const [commentsPage, setCommentsPage] = useState(1);
  const [selectedCommentPostId, setSelectedCommentPostId] = useState(() => searchParams.get("postId") || null);
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const commentRequestRef = useRef(null);
  const requestedTab = searchParams.get("tab");
  const requestedPostId = searchParams.get("postId");

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setOwnStoryCheckFailed(false);
    try {
      const [storiesResponse, postsResponse, dishesResponse] = await Promise.all([
        cookApi.getSocialStories(), cookApi.getSocialPosts(), cookApi.getDishes(),
      ]);
      const storyData = unwrap(storiesResponse);
      const postData = unwrap(postsResponse);
      const dishData = unwrap(dishesResponse);
      setStories(Array.isArray(storyData) ? storyData : storyData?.items || []);
      if (cookId && (Array.isArray(storyData) ? storyData.length : storyData?.items?.length)) {
        try {
          const visibleGroup = await findPublicStoryGroupForCook(cookId, (page) => listPublicStories({ page, limit: 50 }));
          setOwnStoryGroup(visibleGroup);
        } catch {
          // The public feed is authoritative for visibility; don't present a possibly hidden story as live.
          setOwnStoryGroup(null);
          setOwnStoryCheckFailed(true);
        }
      } else {
        setOwnStoryGroup(null);
      }
      setPosts(Array.isArray(postData) ? postData : postData?.items || []);
      setDishes(Array.isArray(dishData) ? dishData : dishData?.dishes || []);
    } catch (error) {
      setOwnStoryGroup(null);
      setOwnStoryCheckFailed(true);
      setLoadError(errorText(error));
    } finally {
      setLoading(false);
    }
  }, [cookId]);

  const loadComments = useCallback(async ({ page = 1, append = false } = {}) => {
    setCommentsLoading(true); setCommentsError("");
    try {
      const data = unwrap(await cookApi.getSocialComments({ page, limit: 20, postId: selectedCommentPostId || undefined }));
      setComments((previous) => append ? [...previous, ...(data?.items || [])] : (data?.items || []));
      setCommentsPagination(data?.pagination || null); setCommentsCount(data?.commentCount || 0); setCommentsPage(page);
    } catch (error) { setCommentsError(errorText(error)); }
    finally { setCommentsLoading(false); }
  }, [selectedCommentPostId]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);
  useEffect(() => {
    const initial = window.setTimeout(() => setClockNow(Date.now()), 0);
    const timer = window.setInterval(() => setClockNow(Date.now()), 60_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (activeTab !== "Comments") return undefined;
    const timer = window.setTimeout(() => loadComments({ page: 1 }), 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, loadComments]);

  useEffect(() => {
    if (requestedTab !== "Comments" || !requestedPostId) return undefined;
    const timer = window.setTimeout(() => {
      setActiveTab("Comments");
      setSelectedCommentPostId(requestedPostId);
      setCommentsPage(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [requestedPostId, requestedTab]);

  const publishedPosts = useMemo(() => posts.filter((post) => post.status === "PUBLISHED"), [posts]);
  const draftPosts = useMemo(() => posts.filter((post) => post.status === "DRAFT"), [posts]);

  const openComposer = (kind, post = null) => {
    setNotice(null);
    setEditTarget(post);
    setModal(kind);
    setCaption(post?.caption || "");
    setDishId(post?.dishId || "");
    setPostType(post?.postType || "PHOTO");
    setMediaFiles([]);
  };
  const closeComposer = () => { if (!busy) { setModal(null); setEditTarget(null); setMediaFiles([]); } };
  const handleFiles = (event) => setMediaFiles(Array.from(event.target.files || []));
  const asFormData = (files, status) => {
    const form = new FormData();
    files.forEach((file) => form.append(postType === "VIDEO" ? "video" : modal === "story" ? "photo" : "photos", file));
    form.append("postType", postType);
    form.append("caption", caption.trim());
    if (dishId) form.append("dishId", dishId);
    form.append("status", status);
    return form;
  };

  const submitStory = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (mediaFiles.length !== 1) { setNotice({ type: "error", text: "Choose one image or video for your Story." }); return; }
    setBusy(true); setNotice(null);
    try {
      const file = mediaFiles[0];
      const isVideo = file.type.startsWith("video/");
      if (!isVideo && !file.type.startsWith("image/")) throw new Error("Choose an image or supported video.");
      const form = new FormData();
      form.append(isVideo ? "video" : "photo", file);
      if (caption.trim()) form.append("caption", caption.trim());
      if (dishId) form.append("dishId", dishId);
      await (isVideo ? cookApi.createSocialStoryVideo(form) : cookApi.createSocialStoryPhoto(form));
      setModal(null); setNotice({ type: "success", text: "Your Story is live for 24 hours." }); await loadData();
    } catch (error) { setNotice({ type: "error", text: errorText(error) }); }
    finally { setBusy(false); }
  };

  const submitPost = async (event, status = "PUBLISHED") => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setNotice(null);
    try {
      if (editTarget) {
        await cookApi.updateSocialPost(editTarget.id, { caption: caption.trim(), dishId: dishId || null, postType });
        if (mediaFiles.length) {
          const form = new FormData();
          mediaFiles.forEach((file) => form.append(postType === "VIDEO" ? "video" : "photos", file));
          await (postType === "VIDEO" ? cookApi.replaceSocialPostVideo(editTarget.id, form) : cookApi.replaceSocialPostPhotos(editTarget.id, form));
        }
      } else if (!mediaFiles.length && status === "DRAFT") {
        await cookApi.createSocialPostDraft({ postType, caption: caption.trim() || undefined, dishId: dishId || undefined });
      } else if (mediaFiles.length) {
        const form = asFormData(mediaFiles, status);
        await (postType === "VIDEO" ? cookApi.createSocialPostVideo(form) : cookApi.createSocialPostPhotos(form));
      } else {
        throw new Error("Add media before publishing. Save a draft to finish later.");
      }
      setModal(null); setEditTarget(null); setNotice({ type: "success", text: status === "DRAFT" && !editTarget ? "Draft saved." : "Post saved." }); await loadData();
    } catch (error) { setNotice({ type: "error", text: errorText(error) }); }
    finally { setBusy(false); }
  };

  const publishDraft = async (post) => {
    try { setBusy(true); await cookApi.updateSocialPost(post.id, { status: "PUBLISHED" }); setNotice({ type: "success", text: "Post published." }); await loadData(); }
    catch (error) { setNotice({ type: "error", text: errorText(error) }); }
    finally { setBusy(false); }
  };
  const deleteItem = async (kind, item) => {
    if (!window.confirm(`Delete this ${kind === "story" ? "Story" : "Post"}? This cannot be undone.`)) return;
    try {
      setBusy(true);
      if (kind === "story") await cookApi.deleteSocialStory(item.id); else await cookApi.deleteSocialPost(item.id);
      setNotice({ type: "success", text: `${kind === "story" ? "Story" : "Post"} deleted.` }); await loadData();
    } catch (error) { setNotice({ type: "error", text: errorText(error) }); }
    finally { setBusy(false); }
  };

  const submitCookReply = async (event) => {
    event.preventDefault();
    const text = replyText.trim();
    if (!replyTo || !text || text.length > 300 || replyBusy) return;
    setReplyBusy(true); setNotice(null);
    try {
      const payload = { text, parentId: replyTo.id };
      const fingerprint = JSON.stringify(payload);
      if (commentRequestRef.current?.fingerprint !== fingerprint) {
        commentRequestRef.current = { fingerprint, key: makeCommentRequestKey() };
      }
      const response = unwrap(await createPostComment(replyTo.postId, payload, commentRequestRef.current.key));
      setComments((previous) => updateThread(previous, replyTo.id, (item) => ({ ...item, replies: [...(item.replies || []), response] })));
      setCommentsCount((count) => count + 1);
      setPosts((previous) => previous.map((post) => post.id === replyTo.postId ? { ...post, _count: { ...post._count, comments: (post._count?.comments || 0) + 1 } } : post));
      setReplyText(""); setReplyTo(null); commentRequestRef.current = null; setNotice({ type: "success", text: "Reply added." });
    } catch (error) { setNotice({ type: "error", text: errorText(error) }); }
    finally { setReplyBusy(false); }
  };

  const deleteCookComment = async (comment) => {
    if (!comment.canDelete || !window.confirm("Delete this comment? It will remain as a deleted-comment placeholder in the thread.")) return;
    try {
      await deletePostComment(comment.id);
      setComments((previous) => updateThread(previous, comment.id, (item) => ({ ...item, text: null, deleted: true, author: null, canDelete: false })));
      setCommentsCount((count) => Math.max(0, count - 1));
      setPosts((previous) => previous.map((post) => post.id === comment.postId ? { ...post, _count: { ...post._count, comments: Math.max(0, (post._count?.comments || 0) - 1) } } : post));
      setNotice({ type: "success", text: "Comment deleted." });
    } catch (error) { setNotice({ type: "error", text: errorText(error) }); }
  };

  const displayedPosts = activeTab === "Drafts" ? draftPosts : publishedPosts;
  const visibleComments = comments.filter((comment) => !selectedCommentPostId || comment.postId === selectedCommentPostId);
  const ownActiveStories = clockNow == null || ownStoryCheckFailed ? [] : activeStoriesForCook(ownStoryGroup, cookId, clockNow);
  const ownActiveStory = ownActiveStories[0];
  const ownStoryChecking = loading || clockNow == null || ownStoryCheckFailed;

  useEffect(() => {
    if (!cookId || !ownActiveStory) return undefined;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const group = await findPublicStoryGroupForCook(cookId, (page) => listPublicStories({ page, limit: 50 }));
        if (cancelled) return;
        setOwnStoryGroup(group);
        setOwnStoryCheckFailed(false);
        setClockNow(Date.now());
      } catch {
        if (cancelled) return;
        setOwnStoryGroup(null);
        setOwnStoryCheckFailed(true);
      }
    }, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [cookId, ownActiveStory]);

  return (
    <main className="space-y-5 pb-12">
      <header className="flex items-center justify-between gap-4 rounded-2xl border border-[#2B1B12]/10 bg-white px-6 py-4 shadow-sm">
        <h1 className="sr-only">My Stories</h1>
        <button
          type="button"
          onClick={() => ownActiveStory ? navigate(ownStoryViewerPath(cookId, ownActiveStory.id), { state: { returnTo: "/cook/stories" } }) : openComposer("story")}
          disabled={ownStoryChecking}
          className="flex w-[72px] shrink-0 flex-col items-center gap-1 text-center disabled:cursor-wait disabled:opacity-60"
          aria-label={ownStoryChecking ? "Checking your Story" : ownActiveStory ? "View your active Story" : "Add to Your Story"}
          title={ownStoryCheckFailed ? "Could not check Story visibility. Use Refresh to try again." : undefined}
        >
          <span className={`relative flex h-12 w-12 items-center justify-center rounded-full p-[2px] ${ownActiveStory ? "bg-gradient-to-br from-[#F4A52A] via-[#D2552B] to-[#8D3820]" : "border-2 border-dashed border-[#D2552B]/50 bg-[#FFF7EE]"}`}>
            <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#FFF7EE] text-[#D2552B]">
              {user?.cookProfile?.profileImage ? <img src={user.cookProfile.profileImage} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} /> : <BookOpen size={18} />}
            </span>
            {!ownActiveStory && !ownStoryChecking && <span aria-hidden="true" className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#D2552B] text-white"><Plus size={12} strokeWidth={3} /></span>}
          </span>
          <span className="w-full truncate text-[11px] font-semibold text-[#2B1B12]">Your Story</span>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          <button type="button" onClick={() => openComposer("post")} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#BD4723] min-[480px]:px-4"><Plus size={17} /> Add post</button>
        </div>
      </header>

      {notice && <div role={notice.type === "error" ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}>{notice.text}</div>}
      {loadError && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span className="flex items-center gap-2"><AlertCircle size={17} />{loadError}</span><button onClick={loadData} className="font-bold underline">Try again</button></div>}

      <nav className="flex flex-wrap gap-2" aria-label="My Stories sections">
        {tabs.map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} aria-pressed={activeTab === tab} className={`rounded-xl px-4 py-2 text-sm font-semibold ${activeTab === tab ? "bg-[#D2552B] text-white" : "border border-[#2B1B12]/10 bg-white text-[#2B1B12] hover:bg-[#D2552B]/5"}`}>{tab}</button>)}
      </nav>

      {loading ? <div className="rounded-2xl border bg-white p-12 text-center text-[#2B1B12]/65"><LoaderCircle className="mx-auto mb-3 animate-spin" />Loading your content…</div> : activeTab === "Comments" ? (
        <section className="space-y-4" aria-label="Comments on your Posts">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2B1B12]/10 bg-white p-4"><div><h2 className="font-bold text-[#2B1B12]">Comments on your Posts</h2><p className="text-xs text-[#2B1B12]/55">{commentsCount} comments and replies</p></div><div className="flex gap-2"><button type="button" onClick={() => { setSelectedCommentPostId(null); setCommentsPage(1); }} className="text-sm font-semibold text-[#B84722]">All Posts</button><button type="button" onClick={() => loadComments({ page: 1 })} disabled={commentsLoading} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">Refresh</button></div></header>
          {commentsError && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span>{commentsError}</span><button type="button" onClick={() => loadComments({ page: commentsPage })} className="font-bold underline">Try again</button></div>}
          {commentsLoading && !comments.length ? <div className="rounded-xl border bg-white p-10 text-center text-sm text-[#2B1B12]/60"><LoaderCircle className="mx-auto mb-2 animate-spin" />Loading comments…</div>
            : visibleComments.length ? <div className="space-y-4">{visibleComments.map((comment) => <article key={comment.id} className="rounded-2xl border border-[#2B1B12]/10 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-3 border-b border-[#2B1B12]/10 pb-3"><div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F8F0E8]">{comment.post?.media?.[0]?.mediaType === "VIDEO" ? <video src={comment.post.media[0].mediaUrl} className="h-full w-full object-cover" /> : comment.post?.media?.[0] ? <img src={comment.post.media[0].mediaUrl} alt="Post thumbnail" className="h-full w-full object-cover" /> : <BookOpen size={20} />}</div><div className="min-w-0"><p className="text-xs font-bold text-[#B84722]">{readableType(comment.post?.postType)}</p><p className="line-clamp-2 text-sm text-[#2B1B12]">{comment.post?.caption || "Post without a caption"}</p></div></div>
              <CommentThread item={comment} onReply={setReplyTo} onDelete={deleteCookComment} busy={replyBusy} />
              {replyTo && (replyTo.id === comment.id || comment.replies?.some((reply) => reply.id === replyTo.id)) && <form onSubmit={submitCookReply} className="mt-4 border-t border-[#2B1B12]/10 pt-3"><p className="mb-2 text-xs text-[#2B1B12]/60">Replying to {replyTo.author?.displayName || "comment"} <button type="button" onClick={() => { setReplyTo(null); setReplyText(""); }} className="ml-2 font-semibold text-[#B84722]">Cancel</button></p><textarea value={replyText} onChange={(event) => setReplyText(event.target.value)} maxLength={300} rows={2} aria-label="Write a reply" className="w-full rounded-xl border border-[#2B1B12]/15 p-3 text-sm" /><div className="mt-2 flex items-center justify-between"><span className="text-xs text-[#2B1B12]/55">{replyText.length}/300</span><button type="submit" disabled={!replyText.trim() || replyBusy} className="inline-flex items-center gap-2 rounded-lg bg-[#D2552B] px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{replyBusy ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}Reply</button></div></form>}
            </article>)}</div> : !commentsError && <div className="rounded-2xl border border-dashed border-[#2B1B12]/20 bg-white p-10 text-center"><MessageSquare className="mx-auto mb-3 text-[#D2552B]" /><h3 className="font-bold text-[#2B1B12]">{selectedCommentPostId ? "No comments loaded for this Post" : "No comments yet"}</h3><p className="mt-1 text-sm text-[#2B1B12]/60">{selectedCommentPostId ? "Clear the Post filter or load more comments." : "Comments on your published Posts will appear here."}</p></div>}
          {commentsPagination?.page < commentsPagination?.totalPages && <button type="button" onClick={() => loadComments({ page: commentsPage + 1, append: true })} disabled={commentsLoading} className="mx-auto block rounded-xl border border-[#D2552B]/30 bg-white px-5 py-2.5 text-sm font-bold text-[#B84722] disabled:opacity-50">{commentsLoading ? "Loading…" : "Load more comments"}</button>}
        </section>
      ) : activeTab === "Active stories" ? (
        stories.length ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{stories.map((story) => <article key={story.id} className="overflow-hidden rounded-2xl border border-[#2B1B12]/10 bg-white shadow-sm"><div className="aspect-[4/3] bg-[#F8F0E8]">{story.mediaType === "VIDEO" ? <video src={story.mediaUrl} controls className="h-full w-full object-cover" /> : <img src={story.mediaUrl} alt={story.caption || "Your Story"} className="h-full w-full object-cover" />}</div><div className="space-y-2 p-4"><p className="line-clamp-2 text-sm text-[#2B1B12]">{story.caption || "No caption"}</p><div className="flex items-center justify-between text-xs text-[#2B1B12]/60"><span>Story</span><span className="inline-flex items-center gap-1"><Clock3 size={14} />{remainingText(story.expiresAt, clockNow)}</span></div><button disabled={busy} onClick={() => deleteItem("story", story)} className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 disabled:opacity-50"><Trash2 size={14} /> Delete</button></div></article>)}</section> : <EmptyState title="No active Stories" detail="Add a Story to share a moment from your kitchen. It stays active for 24 hours." />
      ) : displayedPosts.length ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{displayedPosts.map((post) => <article key={post.id} className="overflow-hidden rounded-2xl border border-[#2B1B12]/10 bg-white shadow-sm"><div className="aspect-[4/3] bg-[#F8F0E8]">{post.media?.[0]?.mediaType === "VIDEO" ? <video src={post.media[0].mediaUrl} controls className="h-full w-full object-cover" /> : post.media?.[0] ? <img src={post.media[0].mediaUrl} alt={post.caption || "Post photo"} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[#2B1B12]/35"><BookOpen size={38} /></div>}</div><div className="space-y-3 p-4"><div className="flex items-center justify-between gap-2"><span className="rounded-full bg-[#D2552B]/10 px-2.5 py-1 text-xs font-bold text-[#B84722]">{readableType(post.postType)}</span>{activeTab === "Drafts" && <span className="text-xs font-semibold text-amber-700">Draft</span>}</div><p className="line-clamp-3 min-h-12 text-sm text-[#2B1B12]">{post.caption || "No caption"}</p>{post.media?.length > 1 && <p className="text-xs text-[#2B1B12]/60">{post.media.length} photos</p>}{activeTab === "Posts" && <div className="flex items-center gap-4 text-xs font-semibold text-[#2B1B12]/65"><span aria-label={`${post._count?.likes || 0} likes`}>♥ {post._count?.likes || 0} likes</span><button type="button" onClick={() => { setSelectedCommentPostId(post.id); setActiveTab("Comments"); }} className="inline-flex items-center gap-1 hover:text-[#B84722]"><MessageCircle size={14} />{post._count?.comments || 0} comments · View</button></div>}<div className="flex flex-wrap gap-3 border-t border-[#2B1B12]/10 pt-3"><button onClick={() => openComposer("post", post)} className="inline-flex items-center gap-1 text-sm font-semibold text-[#B84722]"><Pencil size={15} /> Edit</button><button disabled={busy} onClick={() => deleteItem("post", post)} className="inline-flex items-center gap-1 text-sm font-semibold text-red-700 disabled:opacity-50"><Trash2 size={15} /> Delete</button>{activeTab === "Drafts" && post.media?.length > 0 && <button disabled={busy} onClick={() => publishDraft(post)} className="ml-auto text-sm font-bold text-[#B84722] disabled:opacity-50">Publish</button>}</div></div></article>)}</section> : <EmptyState title={activeTab === "Drafts" ? "No saved drafts" : "No Posts yet"} detail={activeTab === "Drafts" ? "Save an unfinished Post as a draft and return to it later." : "Create your first Post to share a recipe, photo, or kitchen story."} />}

      {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeComposer(); }}><section role="dialog" aria-modal="true" aria-labelledby="social-dialog-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-[#FFFCF8] p-5 shadow-2xl sm:p-6"><div className="mb-5 flex items-start justify-between"><div><h2 id="social-dialog-title" className="text-xl font-extrabold text-[#2B1B12]">{modal === "story" ? "Add a Story" : editTarget ? "Edit Post" : "Add a Post"}</h2><p className="mt-1 text-sm text-[#2B1B12]/60">{modal === "story" ? "Stories expire 24 hours after sharing." : "Share directly or save a draft to finish later."}</p></div><button type="button" onClick={closeComposer} aria-label="Close" disabled={busy} className="rounded-lg p-2 text-[#2B1B12]/60 hover:bg-black/5">×</button></div>
        <form onSubmit={modal === "story" ? submitStory : (event) => submitPost(event, "PUBLISHED")} className="space-y-4">
          {modal === "post" && <label className="block space-y-1 text-sm font-semibold text-[#2B1B12]"><span>Post type</span><select value={postType} onChange={(event) => { setPostType(event.target.value); setMediaFiles([]); }} className="w-full rounded-xl border border-[#2B1B12]/15 bg-white px-3 py-2.5">{postTypes.map((type) => <option value={type} key={type}>{readableType(type)}</option>)}</select></label>}
          {(!editTarget || mediaFiles.length) && <MediaInput type={modal === "story" ? (mediaFiles[0]?.type.startsWith("video/") ? "VIDEO" : "IMAGE") : postType === "VIDEO" ? "VIDEO" : "IMAGE"} allowStoryVideo={modal === "story"} multiple={modal === "post" && postType !== "VIDEO"} onChange={handleFiles} />}
          {mediaFiles.length > 0 && <p className="text-xs text-[#2B1B12]/60">{mediaFiles.map((file) => file.name).join(", ")}</p>}
          {editTarget && <MediaInput type={postType === "VIDEO" ? "VIDEO" : "IMAGE"} multiple={postType !== "VIDEO"} onChange={handleFiles} />}
          <label className="block space-y-1 text-sm font-semibold text-[#2B1B12]"><span>Caption (optional)</span><textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={2200} rows={3} className="w-full rounded-xl border border-[#2B1B12]/15 bg-white px-3 py-2.5 font-normal" /></label>
          <label className="block space-y-1 text-sm font-semibold text-[#2B1B12]"><span>Link to a dish (optional)</span><select value={dishId} onChange={(event) => setDishId(event.target.value)} className="w-full rounded-xl border border-[#2B1B12]/15 bg-white px-3 py-2.5 font-normal"><option value="">No dish linked</option>{dishes.map((dish) => <option key={dish.id} value={dish.id}>{dish.name}</option>)}</select></label>
          <div className="flex flex-wrap justify-end gap-2 border-t border-[#2B1B12]/10 pt-4"><button type="button" disabled={busy} onClick={closeComposer} className="rounded-xl border border-[#2B1B12]/15 bg-white px-4 py-2.5 text-sm font-semibold">Cancel</button>{modal === "post" && !editTarget && <button type="button" disabled={busy} onClick={(event) => submitPost(event, "DRAFT")} className="rounded-xl border border-[#D2552B]/30 px-4 py-2.5 text-sm font-bold text-[#B84722]">Save as draft</button>}<button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}{modal === "story" ? "Share Story" : editTarget ? "Save changes" : "Publish Post"}</button></div>
        </form>
      </section></div>}
    </main>
  );
};

const EmptyState = ({ title, detail }) => <div className="rounded-2xl border border-dashed border-[#2B1B12]/20 bg-white p-10 text-center"><BookOpen className="mx-auto mb-3 text-[#D2552B]" /><h2 className="font-bold text-[#2B1B12]">{title}</h2><p className="mt-1 text-sm text-[#2B1B12]/60">{detail}</p></div>;

export default CookStoriesPage;
