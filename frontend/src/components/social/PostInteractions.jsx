import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { AlertCircle, Flag, Heart, LoaderCircle, MessageCircle, X } from "lucide-react";
import {
  createPostComment, deletePostComment, getPostLikeState, likePost,
  listPostComments, unlikePost,
} from "../../api/socialApi.js";
import { OPEN_AUTH_MODAL_EVENT } from "../../utils/authModalEvents.js";
import { groupPostComments } from "../../utils/socialFeed.js";
import { ReportContentDialog } from "./ReportContentDialog.jsx";

const readData = (response) => response?.data?.data ?? response?.data ?? response;
const messageFor = (error, fallback) => error?.message || fallback;
const login = () => window.dispatchEvent(new Event(OPEN_AUTH_MODAL_EVENT));
const makeCommentRequestKey = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export const PostLikeButton = ({ postId, count = 0, onCountChange }) => {
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const [likeState, setLikeState] = useState({ userId: null, value: null, failed: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return undefined;
    const controller = new AbortController();
    getPostLikeState(postId, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          const value = readData(response);
          setLikeState({ userId: user.id, value, failed: false });
          onCountChange?.(value.likeCount);
        }
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setLikeState({ userId: user.id, value: null, failed: true });
          setError(messageFor(requestError, "Like status is unavailable."));
        }
      });
    return () => controller.abort();
  }, [postId, isAuthenticated, user?.id, onCountChange]);

  const currentLikeState = likeState.userId === user?.id ? likeState.value : null;

  const toggle = async () => {
    if (!isAuthenticated) { login(); return; }
    if (busy || !currentLikeState) return;
    setBusy(true);
    setError("");
    try {
      const response = currentLikeState.likedByMe ? await unlikePost(postId) : await likePost(postId);
      const next = readData(response);
      setLikeState({ userId: user.id, value: next, failed: false });
      onCountChange?.(next.likeCount);
    } catch (requestError) {
      setError(messageFor(requestError, "Your like could not be updated. Please try again."));
    } finally { setBusy(false); }
  };

  const retryLikeState = async () => {
    if (busy || !user?.id) return;
    setBusy(true); setError("");
    try {
      const value = readData(await getPostLikeState(postId));
      setLikeState({ userId: user.id, value, failed: false });
      onCountChange?.(value.likeCount);
    }
    catch (requestError) { setError(messageFor(requestError, "Like status is unavailable.")); }
    finally { setBusy(false); }
  };

  const liked = Boolean(currentLikeState?.likedByMe);
  const loadingState = isAuthenticated && !currentLikeState && !likeState.failed;
  return <span className="inline-flex flex-col items-start gap-1">
    <button type="button" onClick={toggle} disabled={busy || loadingState || (isAuthenticated && !currentLikeState)} aria-pressed={liked} aria-busy={busy || loadingState}
      aria-label={`${liked ? "Unlike" : "Like"} Post; ${currentLikeState?.likeCount ?? count} likes`}
      title={!isAuthenticated ? "Sign in to like this Post" : undefined}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-[#2B1B12]/75 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-300 disabled:opacity-60">
      {busy || loadingState ? <LoaderCircle size={18} className="animate-spin" /> : <Heart size={18} className={liked ? "fill-rose-500 text-rose-500" : ""} />}
      <span>{currentLikeState?.likeCount ?? count}</span>
    </button>
    {error && <span role="alert" className="max-w-56 text-xs text-red-700">{error}{isAuthenticated && !currentLikeState && <button type="button" onClick={retryLikeState} className="ml-1 font-bold underline">Retry</button>}</span>}
  </span>;
};

const CommentItem = ({ comment, onReply, onDelete, onReport, deletingId }) => (
  <div className="border-l-2 border-[#D2552B]/15 pl-3">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-bold text-[#2B1B12]">{comment.moderatedHidden ? "Unavailable comment" : comment.deleted ? "Deleted comment" : comment.author?.displayName || "TasteBridge user"}
          {!comment.deleted && comment.author?.role && <span className="ml-1.5 font-medium text-[#2B1B12]/50">· {comment.author.role === "COOK" ? "Cook" : "Customer"}</span>}
        </p>
        <p className={`mt-1 whitespace-pre-wrap break-words text-sm ${comment.deleted ? "italic text-[#2B1B12]/45" : "text-[#2B1B12]/85"}`}>{comment.moderatedHidden ? "This comment is unavailable." : comment.deleted ? "This comment was removed." : comment.text}</p>
      </div>
      {!comment.deleted && <div className="flex shrink-0 gap-2 text-xs font-semibold">
        <button type="button" onClick={() => onReply(comment)} className="text-[#B84722] hover:underline">Reply</button>
        <button type="button" onClick={() => onReport(comment)} className="inline-flex items-center gap-1 text-gray-600 hover:underline"><Flag size={13} />Report</button>
        {comment.canDelete && <button type="button" disabled={deletingId === comment.id} onClick={() => onDelete(comment)} className="text-red-700 hover:underline disabled:opacity-50">{deletingId === comment.id ? "Deleting…" : "Delete"}</button>}
      </div>}
    </div>
    {comment.replies?.length > 0 && <div className="mt-3 space-y-3 pl-3">{comment.replies.map((reply) => <CommentItem key={reply.id} comment={reply} onReply={onReply} onDelete={onDelete} onReport={onReport} deletingId={deletingId} />)}</div>}
  </div>
);

export const PostCommentsDialog = ({ post, initialCount = 0, onCountChange, onClose }) => {
  const { isAuthenticated } = useSelector((state) => state.auth);
  const [result, setResult] = useState({ items: [], pagination: null, commentCount: initialCount });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [mutationError, setMutationError] = useState("");
  const [reportTarget, setReportTarget] = useState(null);
  const commentRequestRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    listPostComments(post.id, { page: 1, limit: 20, signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted) { const data = readData(response); setResult(data); onCountChange?.(data.commentCount); setError(""); } })
      .catch((requestError) => { if (!controller.signal.aborted) setError(messageFor(requestError, "Comments could not be loaded.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [post.id, onCountChange]);

  const threads = useMemo(() => groupPostComments(result.items), [result.items]);
  const loadMore = async () => {
    if (loadingMore || !result.pagination || result.pagination.page >= result.pagination.totalPages) return;
    setLoadingMore(true); setError("");
    try {
      const data = readData(await listPostComments(post.id, { page: result.pagination.page + 1, limit: 20 }));
      setResult((previous) => ({ ...data, items: [...previous.items, ...data.items] }));
      onCountChange?.(data.commentCount);
    } catch (requestError) { setError(messageFor(requestError, "More comments could not be loaded.")); }
    finally { setLoadingMore(false); }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!isAuthenticated) { login(); return; }
    const cleanText = text.trim();
    if (!cleanText || cleanText.length > 300 || submitting) return;
    setSubmitting(true); setMutationError("");
    try {
      const payload = { text: cleanText, parentId: replyTo?.id || null };
      const fingerprint = JSON.stringify(payload);
      if (commentRequestRef.current?.fingerprint !== fingerprint) {
        commentRequestRef.current = { fingerprint, key: makeCommentRequestKey() };
      }
      const comment = readData(await createPostComment(post.id, payload, commentRequestRef.current.key));
      const count = result.commentCount + 1;
      setResult((previous) => ({ ...previous, items: [...previous.items, comment], commentCount: count }));
      onCountChange?.(count); setText(""); setReplyTo(null); commentRequestRef.current = null;
    } catch (requestError) { setMutationError(messageFor(requestError, "Your comment could not be added. Please try again.")); }
    finally { setSubmitting(false); }
  };

  const removeComment = async (comment) => {
    if (deletingId) return;
    setDeletingId(comment.id); setMutationError("");
    try {
      await deletePostComment(comment.id);
      const count = Math.max(0, result.commentCount - 1);
      setResult((previous) => ({ ...previous, commentCount: count, items: previous.items.map((item) => item.id === comment.id ? { ...item, text: null, deleted: true, author: null, canDelete: false } : item) }));
      onCountChange?.(count);
    } catch (requestError) { setMutationError(messageFor(requestError, "This comment could not be deleted.")); }
    finally { setDeletingId(null); }
  };

  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="post-comments-title">
    <section className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-[#2B1B12]/10 px-4 py-3 sm:px-5"><div><h2 id="post-comments-title" className="font-extrabold text-[#2B1B12]">Post comments</h2><p className="text-xs text-[#2B1B12]/55">{result.commentCount} comments</p></div><button type="button" onClick={onClose} aria-label="Close comments" className="rounded-full p-2 text-[#2B1B12]/65 hover:bg-orange-50"><X size={20} /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="mb-4 border-b border-[#2B1B12]/10 pb-4"><p className="text-xs font-bold uppercase tracking-wide text-[#B84722]">{post.cook?.businessName || "Home cook"} · {post.postType.replaceAll("_", " ")}</p>{post.caption && <p className="mt-2 whitespace-pre-wrap text-sm text-[#2B1B12]">{post.caption}</p>}</div>
        {loading ? <p className="flex items-center gap-2 py-5 text-sm text-[#2B1B12]/60"><LoaderCircle size={17} className="animate-spin" />Loading comments…</p>
          : error && !result.items.length ? <div role="alert" className="flex items-center gap-2 text-sm text-red-700"><AlertCircle size={17} />{error}<button type="button" onClick={() => { setError(""); setLoading(true); listPostComments(post.id, { page: 1, limit: 20 }).then((r) => { const data = readData(r); setResult(data); onCountChange?.(data.commentCount); }).catch((e) => setError(messageFor(e, "Comments could not be loaded."))).finally(() => setLoading(false)); }} className="font-bold underline">Try again</button></div>
              : threads.length ? <div className="space-y-4">{threads.map((comment) => <CommentItem key={comment.id} comment={comment} onReply={(item) => { if (isAuthenticated) setReplyTo(item); else login(); }} onDelete={removeComment} onReport={setReportTarget} deletingId={deletingId} />)}</div>
              : <p className="py-6 text-center text-sm text-[#2B1B12]/55">No comments yet. Start the conversation.</p>}
        {error && result.items.length > 0 && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {result.pagination?.page < result.pagination?.totalPages && <button type="button" onClick={loadMore} disabled={loadingMore} className="mt-4 rounded-lg border px-3 py-2 text-sm font-semibold text-[#B84722] disabled:opacity-50">{loadingMore ? "Loading…" : "Load more comments"}</button>}
      </div>
      <form onSubmit={submit} className="border-t border-[#2B1B12]/10 p-4 sm:p-5">
        {replyTo && <p className="mb-2 text-xs text-[#2B1B12]/65">Replying to {replyTo.author?.displayName || "comment"} <button type="button" onClick={() => setReplyTo(null)} className="ml-2 font-bold text-[#B84722]">Cancel reply</button></p>}
        {mutationError && <p role="alert" className="mb-2 text-sm text-red-700">{mutationError}</p>}
        <label htmlFor="post-comment-input" className="sr-only">Write a comment</label>
        <textarea id="post-comment-input" value={text} onChange={(event) => setText(event.target.value)} maxLength={300} rows={2} placeholder={isAuthenticated ? "Write a comment…" : "Sign in to join the conversation"} disabled={!isAuthenticated || submitting} className="w-full resize-y rounded-xl border border-[#2B1B12]/15 px-3 py-2 text-sm outline-none focus:border-[#D2552B] disabled:bg-gray-50" />
        <div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-[#2B1B12]/55">{text.length}/300</span>{isAuthenticated ? <button type="submit" disabled={!text.trim() || text.length > 300 || submitting} className="rounded-lg bg-[#D2552B] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{submitting ? "Sending…" : replyTo ? "Reply" : "Comment"}</button> : <button type="button" onClick={login} className="rounded-lg bg-[#D2552B] px-4 py-2 text-sm font-bold text-white">Sign in to comment</button>}</div>
      </form>
    </section>
    {reportTarget && <ReportContentDialog targetType="COMMENT" targetId={reportTarget.id} onClose={() => setReportTarget(null)} />}
  </div>;
};

export const PostDetailDialog = ({ post, likeCount, commentCount, onLikeCountChange, onClose, onCommentCountChange }) => {
  const [commentsOpen, setCommentsOpen] = useState(false);
  return <>
  <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/65 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Post details">
    <section className="relative grid max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl md:grid-cols-[1.1fr_0.9fr]">
      <button type="button" onClick={onClose} aria-label="Close Post" className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-2 shadow"><X size={20} /></button>
      <div className="flex min-h-64 items-center bg-black"><PostDetailMedia post={post} /></div>
      <div className="flex flex-col p-5"><p className="text-xs font-bold uppercase tracking-wide text-[#B84722]">{post.cook?.businessName || "Home cook"} · {post.postType.replaceAll("_", " ")}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#2B1B12]">{post.caption || ""}</p>{post.dish && <p className="mt-3 text-sm font-semibold text-[#B84722]">{post.dish.name}</p>}<div className="mt-5 flex gap-3"><PostLikeButton postId={post.id} count={likeCount} onCountChange={onLikeCountChange} /><button type="button" onClick={() => setCommentsOpen(true)} className="inline-flex items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-[#2B1B12]/75"><MessageCircle size={18} />{commentCount} comments</button></div><p className="mt-5 text-xs text-[#2B1B12]/55">Shared by {post.cook?.businessName || "a home cook"}{post.cook?.city ? ` · ${post.cook.city}` : ""}</p></div>
    </section>
  </div>
  {commentsOpen && <PostCommentsDialog post={post} initialCount={commentCount} onCountChange={onCommentCountChange} onClose={() => setCommentsOpen(false)} />}
  </>;
};

const PostDetailMedia = ({ post }) => !post.media?.length
  ? <div className="w-full p-10 text-center text-sm text-white/70">Media unavailable</div>
  : post.media[0].mediaType === "VIDEO"
    ? <video src={post.media[0].mediaUrl} controls playsInline preload="metadata" className="max-h-[80vh] w-full object-contain" aria-label={post.caption || "Cook Post video"} />
    : <div className={`grid w-full gap-1 ${post.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{post.media.map((media, index) => <img key={media.id} src={media.mediaUrl} alt={post.caption ? `${post.caption} (${index + 1})` : `Post photo ${index + 1}`} className="max-h-[80vh] w-full object-contain" />)}</div>;

export const PostCardInteractions = ({ post, commentCount, onCommentCountChange }) => {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [localLikeCount, setLocalLikeCount] = useState(post.likeCount || 0);
  const [localCommentCount, setLocalCommentCount] = useState(commentCount ?? post.commentCount ?? 0);
  const updateLikeCount = useCallback((count) => setLocalLikeCount(count), []);
  const updateCommentCount = useCallback((count) => { setLocalCommentCount(count); onCommentCountChange?.(count); }, [onCommentCountChange]);
  return <>
    <div className="flex items-center justify-between border-t border-[#2B1B12]/10 px-3 py-2">
      <PostLikeButton postId={post.id} count={localLikeCount} onCountChange={updateLikeCount} />
      <button type="button" onClick={() => setCommentsOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-[#2B1B12]/75 hover:bg-orange-50 hover:text-[#B84722]"><MessageCircle size={18} /><span>{localCommentCount}</span><span className="sr-only">Open comments</span></button>
      <button type="button" onClick={() => setDetailOpen(true)} className="text-xs font-semibold text-[#B84722] hover:underline">View Post</button>
      <button type="button" onClick={() => setReportOpen(true)} aria-label="Report Post" className="inline-flex items-center gap-1.5 rounded-full px-2 text-xs font-semibold text-gray-600 hover:bg-orange-50"><Flag size={15} />Report</button>
    </div>
    {commentsOpen && <PostCommentsDialog post={post} initialCount={localCommentCount} onCountChange={updateCommentCount} onClose={() => setCommentsOpen(false)} />}
    {detailOpen && <PostDetailDialog post={post} likeCount={localLikeCount} commentCount={localCommentCount} onLikeCountChange={updateLikeCount} onCommentCountChange={updateCommentCount} onClose={() => setDetailOpen(false)} />}
    {reportOpen && <ReportContentDialog targetType="POST" targetId={post.id} onClose={() => setReportOpen(false)} />}
  </>;
};
