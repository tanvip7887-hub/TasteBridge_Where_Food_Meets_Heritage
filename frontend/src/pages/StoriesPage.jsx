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
const publishedText = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently shared" : date.toLocaleString();
};

const StoriesSkeleton = () => <div className="flex gap-4 overflow-hidden py-1" aria-label="Loading Stories" aria-busy="true">
  {Array.from({ length: 5 }, (_, index) => <div key={index} className="flex w-20 shrink-0 flex-col items-center gap-2">
    <span className="h-[68px] w-[68px] animate-pulse rounded-full bg-[#2B1B12]/10" />
    <span className="h-3 w-14 animate-pulse rounded bg-[#2B1B12]/10" />
  </div>)}
</div>;

const PostSkeleton = () => <article className="flex flex-col overflow-hidden rounded-2xl border border-[#2B1B12]/10 bg-white shadow-sm sm:flex-row" aria-label="Loading Post" aria-busy="true">
  <div className="aspect-[4/3] animate-pulse bg-[#2B1B12]/10 sm:aspect-auto sm:min-h-[260px] sm:w-[40%] sm:max-w-[360px] sm:min-w-[240px]" />
  <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5"><div className="flex items-center gap-3"><span className="h-11 w-11 animate-pulse rounded-full bg-[#2B1B12]/10" /><span className="h-4 w-32 animate-pulse rounded bg-[#2B1B12]/10" /></div><span className="block h-4 w-24 animate-pulse rounded bg-[#2B1B12]/10" /><span className="block h-4 w-full animate-pulse rounded bg-[#2B1B12]/10" /><span className="block h-3 w-20 animate-pulse rounded bg-[#2B1B12]/10" /></div>
</article>;

const PostMedia = ({ media, caption }) => {
  const [failedIds, setFailedIds] = useState([]);
  const frame = "aspect-[4/3] w-full overflow-hidden bg-black sm:h-full sm:aspect-auto";
  if (!media?.length) return <div className={`${frame} flex min-h-48 items-center justify-center bg-orange-50 text-sm text-gray-500`}>Media unavailable</div>;
  const markFailed = (id) => setFailedIds((previous) => previous.includes(id) ? previous : [...previous, id]);
  if (media[0].mediaType === "VIDEO") {
    return failedIds.includes(media[0].id)
      ? <div className={`${frame} flex min-h-48 items-center justify-center bg-orange-50 text-sm text-gray-500`}>Video unavailable</div>
      : <div className={frame}><video src={media[0].mediaUrl} controls playsInline preload="metadata" onError={() => markFailed(media[0].id)} className="h-full w-full object-contain" aria-label={caption || "Cook Post video"} /></div>;
  }
  return <div className={`${frame} grid min-h-48 gap-1 ${media.length > 1 ? "grid-cols-2 auto-rows-fr" : "grid-cols-1"}`}>
    {media.map((item, index) => failedIds.includes(item.id)
      ? <div key={item.id} className="flex min-h-0 items-center justify-center bg-orange-50 text-center text-xs text-gray-500">Photo unavailable</div>
      : <img key={item.id} src={item.mediaUrl} alt={caption ? `${caption} (${index + 1})` : `Post photo ${index + 1}`} loading="lazy" onError={() => markFailed(item.id)} className="h-full min-h-0 w-full bg-orange-50 object-cover" />)}
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
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-[#D2552B]">TasteBridge community</p><h1 className="mt-1 text-2xl font-extrabold text-[#2B1B12] sm:text-3xl">Stories & Posts</h1><p className="mt-2 text-sm text-[#2B1B12]/65">Kitchen moments and recipes shared by home cooks.</p></div>
        <button type="button" onClick={refresh} disabled={storiesPending || postsPending} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#2B1B12]/15 bg-white px-4 py-2 text-sm font-semibold text-[#2B1B12] transition hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 disabled:opacity-50"><RefreshCw size={16} className={storiesPending || postsPending ? "animate-spin" : ""} />Refresh</button>
      </header>

      <section aria-label="Active Stories" className="space-y-4 rounded-2xl border border-[#2B1B12]/10 bg-white p-4 shadow-sm sm:p-5">
        <div><h2 className="text-lg font-bold text-[#2B1B12]">Stories</h2><p className="mt-1 text-sm text-[#2B1B12]/60">Recent moments from home-cook kitchens.</p></div>
        {storiesPending ? <StoriesSkeleton />
          : storyResult.error ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><AlertCircle size={17} />{storyResult.error}<button type="button" onClick={() => setStoryRetry((value) => value + 1)} className="min-h-11 rounded-lg px-2 font-bold underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Try again</button></div>
            : stories.length ? <div className="flex gap-4 overflow-x-auto pb-2" aria-label="Cook Stories">{stories.map((group, index) => <button key={group.cook.id} type="button" onClick={() => openStory(index)} aria-label={`View Story by ${shortName(group.cook)}`} className="flex min-h-24 w-20 shrink-0 flex-col items-center justify-center gap-2 rounded-xl px-1 text-center transition hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2"><span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-gradient-to-br from-[#F4A52A] via-[#D2552B] to-[#8D3820] p-[3px]"><span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#FFF7EE]">{group.cook.profileImage ? <img src={group.cook.profileImage} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} /> : <BookOpen className="text-[#D2552B]" size={23} />}</span></span><span className="w-full truncate text-xs font-semibold text-[#2B1B12]">{shortName(group.cook)}</span></button>)}</div>
              : null}
      </section>

      <section aria-label="Posts feed" className="space-y-5">
        <div><h2 className="text-xl font-extrabold text-[#2B1B12]">Posts</h2><p className="mt-1 text-sm text-[#2B1B12]/60">Latest from eligible home cooks.</p></div>
        {postsPending && posts.length === 0 ? <div className="flex flex-col gap-5"><PostSkeleton /><PostSkeleton /></div>
          : postState.error && posts.length === 0 ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><AlertCircle className="mb-2" />{postState.error}<button type="button" onClick={() => setPostRetry((value) => value + 1)} className="ml-2 min-h-11 rounded-lg px-2 font-bold underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Try again</button></div>
            : posts.length ? <div className="flex flex-col gap-5">{posts.map((post) => <article key={post.id} className="flex w-full flex-col items-stretch overflow-hidden rounded-2xl border border-[#2B1B12]/10 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:flex-row">
                <div className="w-full sm:w-[40%] sm:max-w-[360px] sm:min-w-[240px] sm:shrink-0"><PostMedia media={post.media} caption={post.caption} /></div>
                <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
                <header className="flex min-h-[76px] items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-50 text-[#D2552B]">{post.cook?.profileImage ? <img src={post.cook.profileImage} alt={`${shortName(post.cook)} profile`} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} /> : <BookOpen size={19} aria-hidden="true" />}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#2B1B12]">{shortName(post.cook)}</p><p className="truncate text-xs text-[#2B1B12]/55">{locationText(post.cook) || "Home cook"}</p></div>
                  <span className="shrink-0 rounded-full bg-[#D2552B]/10 px-2.5 py-1 text-xs font-semibold text-[#B84722]">{post.postType.replaceAll("_", " ")}</span>
                </header>
                {post.caption && <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#2B1B12]">{post.caption}</p>}
                {post.dish && <Link to={`/dishes/${encodeURIComponent(post.dish.id)}`} className="inline-flex min-h-11 items-center gap-1 self-start rounded-lg font-bold text-[#B84722] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">View {post.dish.name}<ArrowRight size={15} aria-hidden="true" /></Link>}
                {post.publishedAt && <time className="text-xs text-[#2B1B12]/55" dateTime={post.publishedAt}>{publishedText(post.publishedAt)}</time>}
                <div className="mt-auto -mx-4 sm:-mx-5"><PostCardInteractions post={post} /></div>
                </div>
              </article>)}</div>
              : !postsPending && !postState.error && <div className="rounded-2xl border border-dashed border-[#2B1B12]/20 bg-white p-10 text-center"><BookOpen className="mx-auto mb-3 text-[#D2552B]" /><h3 className="font-bold text-[#2B1B12]">No Posts yet</h3><p className="mt-1 text-sm text-[#2B1B12]/60">New Posts from eligible Cooks will appear here.</p></div>}
        {postState.error && posts.length > 0 && <p role="alert" className="text-sm text-red-700">More Posts could not be loaded: {postState.error}</p>}
        {postState.pagination?.page < postState.pagination?.totalPages && <button type="button" onClick={loadMore} disabled={postsPending} className="mx-auto flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D2552B]/30 bg-white px-5 py-2.5 text-sm font-bold text-[#B84722] transition hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 disabled:opacity-50">{postsPending ? <LoaderCircle size={16} className="animate-spin" /> : <ChevronRight size={16} />}Load more</button>}
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
