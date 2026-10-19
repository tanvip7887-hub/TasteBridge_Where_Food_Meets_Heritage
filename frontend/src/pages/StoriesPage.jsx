import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, BookOpen, ChevronLeft, ChevronRight, Flag, LoaderCircle, RefreshCw, X } from "lucide-react";
import { listPublicPosts, listPublicStories } from "../api/socialApi.js";
import { moveStoryPosition, normalizeStoryGroups } from "../utils/socialFeed.js";
import { PostCardInteractions } from "../components/social/PostInteractions.jsx";
import { ReportContentDialog } from "../components/social/ReportContentDialog.jsx";

const readData = (response) => response?.data?.data ?? response?.data ?? response;
const requestError = (error) => error?.message || "Stories and Posts could not be loaded. Please try again.";
const shortName = (cook) => cook?.businessName || "Home cook";
const locationText = (cook) => [cook?.locality, cook?.city].filter(Boolean).join(", ");
const durationMs = (story) => story.mediaType === "VIDEO"
  ? Math.min(60_000, Math.max(3_000, (Number(story.mediaDurationSeconds) || 15) * 1000))
  : 5_500;

const PostMedia = ({ media, caption }) => {
  const [failedIds, setFailedIds] = useState([]);
  if (!media?.length) return <div className="flex aspect-[4/3] items-center justify-center bg-orange-50 text-sm text-gray-500">Media unavailable</div>;
  const markFailed = (id) => setFailedIds((previous) => previous.includes(id) ? previous : [...previous, id]);
  if (media[0].mediaType === "VIDEO") {
    return failedIds.includes(media[0].id)
      ? <div className="flex aspect-[4/3] items-center justify-center bg-orange-50 text-sm text-gray-500">Video unavailable</div>
      : <video src={media[0].mediaUrl} controls playsInline preload="metadata" onError={() => markFailed(media[0].id)} className="max-h-[75vh] w-full bg-black object-contain" aria-label={caption || "Cook Post video"} />;
  }
  return <div className={`grid gap-1 bg-black ${media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
    {media.map((item, index) => failedIds.includes(item.id)
      ? <div key={item.id} className="flex aspect-square items-center justify-center bg-orange-50 text-center text-xs text-gray-500">Photo unavailable</div>
      : <img key={item.id} src={item.mediaUrl} alt={caption ? `${caption} (${index + 1})` : `Post photo ${index + 1}`} loading="lazy" onError={() => markFailed(item.id)} className="max-h-[75vh] min-h-40 w-full bg-orange-50 object-cover" />)}
  </div>;
};

export const StoriesPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedCookId = searchParams.get("cookId");
  const requestedStoryId = searchParams.get("storyId");
  const [storyResult, setStoryResult] = useState({ key: null, items: [], pagination: null, error: "" });
  const [storyRetry, setStoryRetry] = useState(0);
  const [postPage, setPostPage] = useState(1);
  const [postState, setPostState] = useState({ key: null, items: [], pagination: null, error: "" });
  const [postRetry, setPostRetry] = useState(0);
  const [viewer, setViewer] = useState(null);
  const [reportStoryId, setReportStoryId] = useState(null);
  const [clockNow, setClockNow] = useState(null);
  const storiesPending = storyResult.key !== storyRetry;
  const postsPending = postState.key !== `${postPage}:${postRetry}`;
  const storyGroups = useMemo(() => normalizeStoryGroups(storyResult.items, 0), [storyResult.items]);
  const stories = useMemo(() => storyGroups.map((group) => ({
    ...group,
    stories: group.stories.filter((story) => clockNow == null || new Date(story.expiresAt).getTime() > clockNow),
  })).filter((group) => group.stories.length), [storyGroups, clockNow]);
  const posts = postState.items;
  const storyPosition = viewer ? {
    groupIndex: storyGroups.findIndex((group) => group.cook.id === viewer.cookId),
    storyIndex: storyGroups.find((group) => group.cook.id === viewer.cookId)?.stories.findIndex((story) => story.id === viewer.storyId) ?? -1,
  } : null;
  const viewerGroup = storyPosition && storyPosition.groupIndex >= 0 ? storyGroups[storyPosition.groupIndex] : null;
  const currentStory = viewerGroup && storyPosition.storyIndex >= 0 ? viewerGroup.stories[storyPosition.storyIndex] : null;
  const storiesRef = useRef(storyGroups);
  const viewerRef = useRef(viewer);
  const openedRequestRef = useRef(null);
  const [storyStartedAt, setStoryStartedAt] = useState(null);

  useEffect(() => {
    storiesRef.current = storyGroups;
    viewerRef.current = viewer;
  }, [storyGroups, viewer]);

  useEffect(() => {
    if (!requestedCookId || storiesPending || storyResult.error) return undefined;
    const requestKey = `${requestedCookId}:${requestedStoryId || ""}`;
    if (openedRequestRef.current === requestKey) return undefined;
    openedRequestRef.current = requestKey;
    const group = storyGroups.find(({ cook }) => cook.id === requestedCookId);
    const target = group?.stories.find((story) =>
      (!requestedStoryId || story.id === requestedStoryId) && new Date(story.expiresAt).getTime() > Date.now());
    if (!target) return undefined;
    const timer = window.setTimeout(() => setViewer({ cookId: requestedCookId, storyId: target.id }), 0);
    return () => window.clearTimeout(timer);
  }, [requestedCookId, requestedStoryId, storiesPending, storyResult.error, storyGroups]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const items = [];
      let page = 1;
      let totalPages;
      let pagination = null;
      do {
        const response = await listPublicStories({ page, limit: 50, signal: controller.signal });
        if (controller.signal.aborted) return;
        const result = readData(response);
        items.push(...(result?.items || []));
        pagination = result?.pagination || pagination;
        totalPages = Number.isInteger(result?.pagination?.totalPages) ? result.pagination.totalPages : page;
        if (!requestedCookId || items.some((group) => group?.cook?.id === requestedCookId)) break;
        page += 1;
      } while (page <= totalPages);
      if (!controller.signal.aborted) setStoryResult({ key: storyRetry, items, pagination, error: "" });
    })()
      .catch((error) => {
        if (!controller.signal.aborted) setStoryResult({ key: storyRetry, items: [], pagination: null, error: requestError(error) });
      });
    return () => controller.abort();
  }, [storyRetry, requestedCookId]);

  useEffect(() => {
    const controller = new AbortController();
    const key = `${postPage}:${postRetry}`;
    listPublicPosts({ page: postPage, limit: 12, signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        const result = readData(response);
        setPostState((previous) => ({
          key,
          items: postPage === 1 ? (result?.items || []) : [...previous.items, ...(result?.items || [])],
          pagination: result?.pagination || null,
          error: "",
        }));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setPostState((previous) => ({ ...previous, key, error: requestError(error) }));
      });
    return () => controller.abort();
  }, [postPage, postRetry]);

  useEffect(() => {
    const initial = window.setTimeout(() => setClockNow(Date.now()), 0);
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  const closeViewer = useCallback(() => {
    if (location.state?.returnTo === "/cook/stories") {
      navigate(-1);
      return;
    }
    setViewer(null);
  }, [location.state, navigate]);
  const advance = useCallback((direction = 1) => {
    const activeViewer = viewerRef.current;
    if (!activeViewer) return;
    const groups = storiesRef.current;
    const groupIndex = groups.findIndex((group) => group.cook.id === activeViewer.cookId);
    const storyIndex = groupIndex >= 0 ? groups[groupIndex].stories.findIndex((story) => story.id === activeViewer.storyId) : -1;
    if (groupIndex < 0 || storyIndex < 0) { setViewer(null); return; }
    const next = moveStoryPosition(groups, { groupIndex, storyIndex }, direction, Date.now());
    setViewer(next ? { cookId: groups[next.groupIndex].cook.id, storyId: groups[next.groupIndex].stories[next.storyIndex].id } : null);
  }, []);

  useEffect(() => {
    if (!viewer) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeViewer();
      if (event.key === "ArrowRight") advance(1);
      if (event.key === "ArrowLeft") advance(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewer, closeViewer, advance]);

  useEffect(() => {
    if (!viewer || !currentStory) return undefined;
    const initial = window.setTimeout(() => setStoryStartedAt(Date.now()), 0);
    const expiredIn = new Date(currentStory.expiresAt).getTime() - Date.now();
    const timeout = window.setTimeout(() => advance(1), Math.max(0, Math.min(durationMs(currentStory), expiredIn)));
    return () => { window.clearTimeout(initial); window.clearTimeout(timeout); };
  }, [viewer, currentStory, advance]);

  const refresh = () => {
    setStoryRetry((value) => value + 1);
    setPostPage(1);
    setPostRetry((value) => value + 1);
  };
  const openStory = (groupIndex) => {
    const group = stories[groupIndex];
    const sourceGroup = group && storyGroups.find(({ cook }) => cook.id === group.cook.id);
    const firstStory = sourceGroup?.stories.find((story) => new Date(story.expiresAt).getTime() > Date.now());
    if (firstStory) setViewer({ cookId: sourceGroup.cook.id, storyId: firstStory.id });
  };
  const loadMore = () => {
    if (!postsPending && postState.pagination?.page < postState.pagination?.totalPages) setPostPage((page) => page + 1);
  };

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-wide text-[#D2552B]">TasteBridge community</p><h1 className="mt-1 text-2xl font-extrabold text-[#2B1B12] sm:text-3xl">Stories & Posts</h1><p className="mt-1 text-sm text-[#2B1B12]/65">Kitchen moments and recipes shared by home cooks.</p></div>
        <button type="button" onClick={refresh} disabled={storiesPending || postsPending} className="inline-flex items-center gap-2 rounded-xl border border-[#2B1B12]/15 bg-white px-3.5 py-2 text-sm font-semibold text-[#2B1B12] disabled:opacity-50"><RefreshCw size={16} className={storiesPending || postsPending ? "animate-spin" : ""} />Refresh</button>
      </header>

      <section aria-label="Active Stories" className="rounded-2xl border border-[#2B1B12]/10 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="mb-4 text-lg font-bold text-[#2B1B12]">Stories</h2>
        {storiesPending ? <div className="flex items-center gap-2 py-3 text-sm text-gray-500"><LoaderCircle size={17} className="animate-spin" />Loading Stories…</div>
          : storyResult.error ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><AlertCircle size={17} />{storyResult.error}<button type="button" onClick={() => setStoryRetry((value) => value + 1)} className="font-bold underline">Try again</button></div>
            : stories.length ? <div className="flex gap-4 overflow-x-auto pb-1">{stories.map((group, index) => <button key={group.cook.id} type="button" onClick={() => openStory(index)} className="flex w-20 shrink-0 flex-col items-center gap-2 text-center"><span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-gradient-to-br from-[#F4A52A] via-[#D2552B] to-[#8D3820] p-[3px]"><span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#FFF7EE]">{group.cook.profileImage ? <img src={group.cook.profileImage} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} /> : <BookOpen className="text-[#D2552B]" size={23} />}</span></span><span className="w-full truncate text-xs font-semibold text-[#2B1B12]">{shortName(group.cook)}</span></button>)}</div>
              : <p className="text-sm text-[#2B1B12]/60">No active Stories right now. Check back soon.</p>}
      </section>

      <section aria-label="Posts feed" className="space-y-4">
        <div className="flex items-end justify-between"><div><h2 className="text-xl font-extrabold text-[#2B1B12]">Posts</h2><p className="mt-1 text-sm text-[#2B1B12]/60">Latest from eligible home cooks.</p></div></div>
        {postsPending && posts.length === 0 ? <div className="rounded-2xl border bg-white p-10 text-center text-gray-500"><LoaderCircle className="mx-auto mb-2 animate-spin" />Loading Posts…</div>
          : postState.error && posts.length === 0 ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><AlertCircle className="mb-2" />{postState.error}<button type="button" onClick={() => setPostRetry((value) => value + 1)} className="ml-2 font-bold underline">Try again</button></div>
            : posts.length ? <div className="space-y-5">{posts.map((post) => <article key={post.id} className="overflow-hidden rounded-2xl border border-[#2B1B12]/10 bg-white shadow-sm">
                <header className="flex items-center gap-3 p-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-50 text-[#D2552B]">{post.cook?.profileImage ? <img src={post.cook.profileImage} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} /> : <BookOpen size={19} />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#2B1B12]">{shortName(post.cook)}</p><p className="truncate text-xs text-[#2B1B12]/55">{locationText(post.cook) || "Home cook"}</p></div><span className="rounded-full bg-[#D2552B]/10 px-2.5 py-1 text-xs font-semibold text-[#B84722]">{post.postType.replaceAll("_", " ")}</span></header>
                <PostMedia media={post.media} caption={post.caption} />
                {(post.caption || post.dish) && <div className="space-y-2 p-4">{post.caption && <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#2B1B12]">{post.caption}</p>}{post.dish && <Link to={`/dishes/${encodeURIComponent(post.dish.id)}`} className="inline-flex items-center gap-1 text-sm font-bold text-[#B84722]">View {post.dish.name}<ArrowRight size={15} /></Link>}</div>}
                <PostCardInteractions post={post} />
              </article>)}</div>
              : !postsPending && !postState.error && <div className="rounded-2xl border border-dashed border-[#2B1B12]/20 bg-white p-10 text-center"><BookOpen className="mx-auto mb-3 text-[#D2552B]" /><h3 className="font-bold text-[#2B1B12]">No Posts yet</h3><p className="mt-1 text-sm text-[#2B1B12]/60">New Posts from eligible Cooks will appear here.</p></div>}
        {postState.error && posts.length > 0 && <p role="alert" className="text-sm text-red-700">More Posts could not be loaded: {postState.error}</p>}
        {postState.pagination?.page < postState.pagination?.totalPages && <button type="button" onClick={loadMore} disabled={postsPending} className="mx-auto flex items-center gap-2 rounded-xl border border-[#D2552B]/30 bg-white px-5 py-2.5 text-sm font-bold text-[#B84722] disabled:opacity-50">{postsPending ? <LoaderCircle size={16} className="animate-spin" /> : <ChevronRight size={16} />}Load more</button>}
      </section>

      {viewer && currentStory && viewerGroup && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-2 sm:p-5" role="dialog" aria-modal="true" aria-label={`Story by ${shortName(viewerGroup.cook)}`}>
        <button type="button" onClick={closeViewer} aria-label="Close Story viewer" className="absolute right-4 top-4 z-20 rounded-full bg-black/50 p-2 text-white"><X size={23} /></button>
        <button type="button" onClick={() => advance(-1)} aria-label="Previous Story" className="absolute left-2 z-20 rounded-full bg-black/40 p-2 text-white sm:left-6"><ChevronLeft size={26} /></button>
        <div className="relative flex h-[min(92vh,850px)] w-full max-w-[460px] flex-col overflow-hidden rounded-2xl bg-[#1d1714] shadow-2xl" onClick={(event) => { if (event.target?.tagName !== "VIDEO") advance(1); }}>
          <div className="absolute inset-x-3 top-3 z-10 flex gap-1">{viewerGroup.stories.map((item, index) => {
            const progress = index < storyPosition.storyIndex ? 100 : index > storyPosition.storyIndex || !storyStartedAt ? 0 : Math.min(100, Math.max(0, ((clockNow || storyStartedAt) - storyStartedAt) / durationMs(item) * 100));
            return <span key={item.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/35"><span className="block h-full bg-white transition-[width] duration-1000" style={{ width: `${progress}%` }} /></span>;
          })}</div>
          <header className="absolute inset-x-3 top-7 z-10 flex items-center gap-2 text-white"><span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-[#D2552B]">{viewerGroup.cook.profileImage ? <img src={viewerGroup.cook.profileImage} alt="" className="h-full w-full object-cover" /> : <BookOpen size={17} />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{shortName(viewerGroup.cook)}</p><p className="text-[11px] text-white/75">Expires {new Date(currentStory.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p></div><button type="button" onClick={(event) => { event.stopPropagation(); setReportStoryId(currentStory.id); }} aria-label="Report Story" className="rounded-full bg-black/40 p-2 text-white"><Flag size={17} /></button></header>
          {currentStory.mediaType === "VIDEO" ? <video key={currentStory.id} src={currentStory.mediaUrl} autoPlay muted controls playsInline onEnded={() => advance(1)} onError={() => advance(1)} className="h-full w-full object-contain" /> : <img key={currentStory.id} src={currentStory.mediaUrl} alt={currentStory.caption || `Story by ${shortName(viewerGroup.cook)}`} onError={() => advance(1)} className="h-full w-full object-contain" />}
          {(currentStory.caption || currentStory.dish) && <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-5 pb-5 pt-16 text-sm text-white" onClick={(event) => event.stopPropagation()}>{currentStory.caption && <p>{currentStory.caption}</p>}{currentStory.dish && <Link to={`/dishes/${encodeURIComponent(currentStory.dish.id)}`} onClick={closeViewer} className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-2 font-semibold text-white">View {currentStory.dish.name}<ArrowRight size={15} /></Link>}</div>}
        </div>
        <button type="button" onClick={() => advance(1)} aria-label="Next Story" className="absolute right-2 z-20 rounded-full bg-black/40 p-2 text-white sm:right-6"><ChevronRight size={26} /></button>
      </div>}
      {reportStoryId && <ReportContentDialog targetType="STORY" targetId={reportStoryId} onClose={() => setReportStoryId(null)} />}
    </main>
  );
};

export default StoriesPage;
