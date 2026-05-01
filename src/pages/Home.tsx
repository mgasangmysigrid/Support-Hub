import { lazy, Suspense, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useHomeUnreads } from "@/hooks/useHomeUnreads";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const WelcomeHeader = lazy(() => import("@/components/home/WelcomeHeader"));
const UnreadActivityPanel = lazy(() => import("@/components/home/UnreadActivityPanel"));
const BulletinBoard = lazy(() => import("@/components/home/BulletinBoard"));

const TodayCelebrations = lazy(() => import("@/components/home/TodayCelebrations"));
const TrendingHashtags = lazy(() => import("@/components/home/TrendingHashtags"));
const FeaturedPhotosCarousel = lazy(() => import("@/components/home/FeaturedPhotosCarousel"));
const RecentUpdates = lazy(() => import("@/components/home/RecentUpdates"));
const KnowledgeSpotlight = lazy(() => import("@/components/home/KnowledgeSpotlight"));
const SuggestImprovement = lazy(() => import("@/components/home/SuggestImprovement"));

export default function Home() {
  const { unreadBulletins, unreadMentionPhotoIds, homeBadgeCount, bulletinMentions, bulletinMentionsByPost } = useHomeUnreads();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const visibleMentionCount = unreadMentionPhotoIds.size;

  // Deep link: detect bulletin=<postId> or section=bulletin&id=<postId>
  const deepLinkPostId = useMemo(() => {
    const bulletinParam = searchParams.get("bulletin");
    if (bulletinParam) return bulletinParam;
    if (searchParams.get("section") === "bulletin") return searchParams.get("id");
    return null;
  }, [searchParams]);

  const deepLinkCommentId = searchParams.get("comment");

  // Mark bulletin mention notification as read when deep link resolves
  useEffect(() => {
    if (!deepLinkPostId || !user) return;
    console.log(`[bulletin-deep-link] Resolving deep link for post ${deepLinkPostId}, comment ${deepLinkCommentId || "none"}`);

    // We mark notifications read AFTER user reaches the target — see BulletinDetailDialog

    // Clean URL params after a delay so the deep link components can process them
    const timer = setTimeout(() => {
      setSearchParams({}, { replace: true });
    }, 3000);
    return () => clearTimeout(timer);
  }, [deepLinkPostId, user]);

  // Auto-scroll to first section with unread items after initial render
  useEffect(() => {
    if (deepLinkPostId) return; // Don't auto-scroll when deep linking
    if (homeBadgeCount === 0) return;
    const timer = setTimeout(() => {
      const unreadItem = document.querySelector(
        '#section-bulletin [data-unread="true"], #section-featured-photos [data-unread="true"]'
      );
      if (unreadItem) {
        const section = unreadItem.closest('[id^="section-"]');
        if (section) {
          section.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [homeBadgeCount, deepLinkPostId]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <Suspense fallback={null}>
        <WelcomeHeader />

        {/* Unread Activity summary */}
        <UnreadActivityPanel
          unreadBulletins={unreadBulletins}
          unreadMentionCount={visibleMentionCount}
          bulletinMentionCount={bulletinMentions.length}
        />

        {/* MySigrid Updates — full width */}
        <BulletinBoard
          unreadBulletins={unreadBulletins}
          deepLinkPostId={deepLinkPostId}
          deepLinkCommentId={deepLinkCommentId}
          bulletinMentionsByPost={bulletinMentionsByPost}
        />


        <TodayCelebrations />
        <TrendingHashtags />
        <FeaturedPhotosCarousel unreadMentionPhotoIds={unreadMentionPhotoIds} />
        <RecentUpdates />
        <KnowledgeSpotlight />
        <SuggestImprovement />
      </Suspense>
    </div>
  );
}
