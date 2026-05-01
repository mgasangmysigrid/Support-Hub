import { useRef, useEffect, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Camera, ChevronLeft, ChevronRight, MessageCircle, Hash, X, Plus } from "lucide-react";
import PhotoLightbox, { type LightboxPhoto } from "@/components/profile/PhotoLightbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";

interface FeaturedPhotoCard {
  id: string;
  image_url: string;
  caption: string | null;
  user_name: string;
  user_id: string;
  profile_photo_url: string | null;
  created_at: string;
}

interface ReactionSummary {
  love: number;
  awesome: number;
  celebrate: number;
  total: number;
}

const MAX_PER_EMPLOYEE = 2;
const CAROUSEL_POOL = 24;

interface FeaturedPhotosCarouselProps {
  unreadMentionPhotoIds?: Set<string>;
}

export default function FeaturedPhotosCarousel({ unreadMentionPhotoIds = new Set<string>() }: FeaturedPhotosCarouselProps) {
  const navigate = useNavigate();
  const autoplayPlugin = useRef(
    Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true })
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: "start", slidesToScroll: 1, containScroll: "trimSnaps" },
    [autoplayPlugin.current]
  );

  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  const hashtagFilter = searchParams.get("hashtag") || null;

  const clearHashtagFilter = useCallback(() => {
    searchParams.delete("hashtag");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi, onSelect]);

  // When filtering by hashtag, fetch matching photo IDs first
  const { data: hashtagPhotoIds } = useQuery<string[] | null>({
    queryKey: ["hashtag-photo-ids", hashtagFilter],
    enabled: !!hashtagFilter,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("photo_hashtags")
        .select("photo_id")
        .eq("tag", hashtagFilter!.toLowerCase());
      if (error) throw error;
      return (data ?? []).map((r: any) => r.photo_id);
    },
  });

  const { data: photos = [], isLoading } = useQuery<FeaturedPhotoCard[]>({
    queryKey: ["home-featured-carousel", hashtagFilter, hashtagPhotoIds],
    queryFn: async () => {
      let query = supabase
        .from("user_photos")
        .select("id, image_url, caption, user_id, created_at, display_order")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (hashtagFilter && hashtagPhotoIds && hashtagPhotoIds.length > 0) {
        query = query.in("id", hashtagPhotoIds);
      } else if (hashtagFilter && hashtagPhotoIds?.length === 0) {
        return [];
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      if (!data?.length) return [];

      let filtered: typeof data;
      if (hashtagFilter) {
        filtered = data.slice(0, CAROUSEL_POOL);
      } else {
        const perUserCount: Record<string, number> = {};
        filtered = [];
        for (const p of data) {
          const count = perUserCount[p.user_id] || 0;
          if (count >= MAX_PER_EMPLOYEE) continue;
          perUserCount[p.user_id] = count + 1;
          filtered.push(p);
          if (filtered.length >= CAROUSEL_POOL) break;
        }
      }

      const userIds = [...new Set(filtered.map((p) => p.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, profile_photo_url, is_active")
        .in("id", userIds);

      // Only show photos from active employees
      const activeUserIds = new Set(
        (profiles ?? []).filter((p) => p.is_active).map((p) => p.id)
      );
      filtered = filtered.filter((p) => activeUserIds.has(p.user_id));

      const profileMap = (profiles ?? []).reduce<Record<string, { name: string; photo: string | null }>>((acc, p) => {
        acc[p.id] = { name: p.full_name ?? "Employee", photo: p.profile_photo_url };
        return acc;
      }, {});

      return filtered.map((p) => ({
        id: p.id,
        image_url: p.image_url,
        caption: p.caption,
        user_name: profileMap[p.user_id]?.name ?? "Employee",
        user_id: p.user_id,
        profile_photo_url: profileMap[p.user_id]?.photo ?? null,
        created_at: p.created_at,
      }));
    },
  });

  // Deep-link: scroll to and highlight specific photo
  useEffect(() => {
    const photoParam = searchParams.get("photo");
    if (!photoParam || !emblaApi || !photos.length) return;

    const index = photos.findIndex((p) => p.id === photoParam);
    if (index >= 0) {
      emblaApi.scrollTo(index);
      setHighlightId(photoParam);
      setTimeout(() => setHighlightId(null), 3500);
    } else {
      toast.info("This photo is no longer available");
    }
    searchParams.delete("photo");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, emblaApi, photos, setSearchParams]);

  const photoIds = photos.map((p) => p.id);
  const { data: reactionMap = {} } = useQuery<Record<string, ReactionSummary>>({
    queryKey: ["home-carousel-reactions", photoIds.join(",")],
    enabled: photoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("photo_reactions")
        .select("photo_id, reaction_type")
        .in("photo_id", photoIds);
      if (error) throw error;
      const map: Record<string, ReactionSummary> = {};
      for (const r of data ?? []) {
        if (!map[r.photo_id]) map[r.photo_id] = { love: 0, awesome: 0, celebrate: 0, total: 0 };
        map[r.photo_id].total++;
        if (r.reaction_type === "love") map[r.photo_id].love++;
        if (r.reaction_type === "awesome") map[r.photo_id].awesome++;
        if (r.reaction_type === "celebrate") map[r.photo_id].celebrate++;
      }
      return map;
    },
  });

  const { data: commentMap = {} } = useQuery<Record<string, number>>({
    queryKey: ["home-carousel-comments", photoIds.join(",")],
    enabled: photoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("photo_comments")
        .select("photo_id")
        .in("photo_id", photoIds);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const c of data ?? []) {
        map[c.photo_id] = (map[c.photo_id] || 0) + 1;
      }
      return map;
    },
  });

  // Count only mentions for photos that are actually visible in the carousel
  const visibleMentionCount = photos.filter((p) => unreadMentionPhotoIds.has(p.id)).length;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Camera className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Featured Photos</h2>
        </div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-[140px] shrink-0">
              <div className="aspect-square rounded-lg bg-muted animate-pulse" />
              <div className="mt-2 h-3 w-20 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (photos.length === 0 && !hashtagFilter) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Featured Photos</h2>
          </div>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => navigate("/profile?section=featured-photos")}>
            <Plus className="h-3.5 w-3.5" /> Add Photo
          </Button>
        </div>
        <div
          className="flex flex-col items-center justify-center py-10 cursor-pointer group"
          onClick={() => navigate("/profile?section=featured-photos")}
        >
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors mb-3">
            <Plus className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">No featured photos yet</p>
          <p className="text-xs text-muted-foreground mt-1">Be the first to share something about yourself</p>
        </div>
      </div>
    );
  }

  return (
    <div id="section-featured-photos" className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Featured Photos</h2>
          {visibleMentionCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground animate-pulse">
              {visibleMentionCount}
            </span>
          )}
          {hashtagFilter ? (
            <button
              onClick={clearHashtagFilter}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
            >
              <Hash className="h-3 w-3" />
              {hashtagFilter}
              <X className="h-3 w-3 ml-0.5" />
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">({photos.length})</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs mr-1" onClick={() => navigate("/profile?section=featured-photos")}>
            <Plus className="h-3.5 w-3.5" /> Add Photo
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full hover:bg-accent"
            onClick={() => emblaApi?.scrollPrev()} disabled={!canScrollPrev && photos.length <= 8}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full hover:bg-accent"
            onClick={() => emblaApi?.scrollNext()} disabled={!canScrollNext && photos.length <= 8}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {photos.length === 0 && hashtagFilter ? (
        <div className="text-center py-8 text-muted-foreground">
          <Hash className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No photos found with #{hashtagFilter}</p>
          <Button variant="link" size="sm" className="mt-1 text-xs" onClick={clearHashtagFilter}>
            Clear filter
          </Button>
        </div>
      ) : (
        <div ref={emblaRef} className="overflow-hidden">
          <div className="flex gap-3">
            {photos.map((photo, idx) => {
              const reactions = reactionMap[photo.id];
              const comments = commentMap[photo.id] || 0;
              const isHighlighted = highlightId === photo.id;
              const hasMention = unreadMentionPhotoIds.has(photo.id);

              return (
                <div
                  key={photo.id}
                  data-photo-id={photo.id}
                  data-unread={hasMention ? "true" : undefined}
                  className={`flex-[0_0_calc(12.5%-10px)] min-w-[120px] group cursor-pointer ${isHighlighted ? "photo-highlight" : ""}`}
                  onClick={() => setLightboxIndex(idx)}
                >
                  <div className={`relative aspect-square rounded-lg overflow-hidden border shadow-sm hover:shadow-md transition-shadow bg-muted ${hasMention ? "border-destructive/40 ring-1 ring-destructive/20" : "border-border"}`}>
                    <img
                      src={photo.image_url}
                      alt={photo.caption || `Photo by ${photo.user_name}`}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      loading="lazy"
                    />
                    {hasMention && (
                      <Badge className="absolute top-1 right-1 text-[9px] px-1.5 py-0 h-4 bg-destructive hover:bg-destructive text-destructive-foreground border-0 font-extrabold tracking-wide shadow-sm animate-pulse">
                        NEW
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium text-foreground truncate">{photo.user_name}</p>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
                      {reactions && reactions.love > 0 && <span>❤️ {reactions.love}</span>}
                      {reactions && reactions.awesome > 0 && <span>🔥 {reactions.awesome}</span>}
                      {reactions && reactions.celebrate > 0 && <span>🎉 {reactions.celebrate}</span>}
                      {comments > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <MessageCircle className="h-2.5 w-2.5" /> {comments}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <PhotoLightbox
        photos={photos.map((p) => ({
          ...p,
          user_name: p.user_name,
          profile_photo_url: p.profile_photo_url,
        }))}
        initialIndex={lightboxIndex >= 0 ? lightboxIndex : 0}
        open={lightboxIndex >= 0}
        onOpenChange={(open) => { if (!open) setLightboxIndex(-1); }}
      />
    </div>
  );
}
