import { Megaphone, Pencil, Archive, ArchiveRestore, MessageSquare, AtSign, Pin, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BulletinPost } from "./BulletinBoard";

const EMOJI_MAP: Record<string, string> = {
  like: "👍", love: "❤️", celebrate: "🎉", applaud: "👏", acknowledged: "✅",
};
const EMOJI_ORDER = ["like", "love", "celebrate", "applaud", "acknowledged"];

type CardType = "image" | "pdf" | "link" | "text";

export interface BulletinTileProps {
  post: BulletinPost;
  isNew: boolean;
  isMentioned?: boolean;
  canPost: boolean;
  onView: () => void;
  onEdit: () => void;
  onArchiveToggle: () => void;
}

function detectCardType(post: BulletinPost): { type: CardType; imageUrl: string | null } {
  const sorted = [...post.bulletin_attachments].sort((a, b) => a.sort_order - b.sort_order);
  const img = sorted.find((a) =>
    a.file_type.startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)$/i.test(a.file_name || "") ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)/i.test(a.file_url || "")
  );
  if (img) return { type: "image", imageUrl: img.file_url };
  if (sorted.some((a) => a.file_type === "application/pdf" || /\.pdf$/i.test(a.file_name || "")))
    return { type: "pdf", imageUrl: null };
  if (post.external_link) return { type: "link", imageUrl: null };
  return { type: "text", imageUrl: null };
}

function getTextPreview(body: string, maxLen = 90): string {
  const cleaned = body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");
  const plain = cleaned.replace(/[*_~`#>]/g, "").replace(/\n+/g, " ").trim();
  return plain.length <= maxLen ? plain : plain.slice(0, maxLen).trimEnd() + "…";
}

function useEngagement(postId: string) {
  return useQuery({
    queryKey: ["bulletin-engagement-counts", postId],
    queryFn: async () => {
      const [reactions, comments] = await Promise.all([
        supabase.from("bulletin_reactions").select("reaction_type").eq("bulletin_post_id", postId),
        supabase.from("bulletin_comments").select("id", { count: "exact", head: true }).eq("bulletin_post_id", postId),
      ]);
      const grouped: Record<string, number> = {};
      for (const r of reactions.data ?? []) grouped[r.reaction_type] = (grouped[r.reaction_type] || 0) + 1;
      return { reactions: grouped, comments: comments.count ?? 0 };
    },
    staleTime: 30000,
  });
}

/* ── Sub-components ── */

function TileBadges({ post, isMentioned, isNew }: { post: BulletinPost; isMentioned?: boolean; isNew: boolean }) {
  const isAnnouncement = !!post.mentions_everyone;
  const isImportant = !!post.is_pinned;
  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
      {isNew && (
        <span
          className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full leading-none shadow-sm bg-red-500 text-white animate-[pulse_2.5s_ease-in-out_infinite]"
        >
          NEW
        </span>
      )}
      {isImportant && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full leading-none shadow-sm bg-amber-500 text-white">
          <Pin className="h-2.5 w-2.5" /> Important
        </span>
      )}
      {isAnnouncement && (
        <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full leading-none shadow-sm bg-indigo-500 text-white">
          Announcement
        </span>
      )}
      {isMentioned && (
        <Badge className="text-[10px] px-2 py-0.5 h-auto bg-primary hover:bg-primary text-primary-foreground border-0 font-bold uppercase tracking-wider gap-0.5 rounded-full leading-none shadow-sm">
          <AtSign className="h-2.5 w-2.5" /> Mentioned
        </Badge>
      )}
    </div>
  );
}

function CardFooter({ post, reactionCounts, commentCount }: {
  post: BulletinPost;
  reactionCounts: Record<string, number>;
  commentCount: number;
}) {
  const authorName = post.profiles?.full_name ?? "Unknown";
  const totalReactions = Object.values(reactionCounts).reduce((s, n) => s + n, 0);

  return (
    <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] leading-none">
      {post.profiles?.profile_photo_url ? (
        <img src={post.profiles.profile_photo_url} alt="" className="h-4 w-4 rounded-full object-cover shrink-0" />
      ) : (
        <div className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 bg-primary/10 text-primary">
          {authorName.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="truncate max-w-[70px]">{authorName}</span>
      <span className="opacity-40">·</span>
      <span className="opacity-60">{format(new Date(post.created_at), "MMM d")}</span>
      {post.audience_label && (
        <>
          <span className="opacity-40">·</span>
          <span className="opacity-60 truncate max-w-[60px]">{post.audience_label}</span>
        </>
      )}
      {(totalReactions > 0 || commentCount > 0) && (
        <div className="ml-auto flex items-center gap-1">
          {EMOJI_ORDER.map((t) =>
            reactionCounts[t] ? (
              <span key={t} className="inline-flex items-center gap-px text-[10px]">
                {EMOJI_MAP[t]}<span className="text-[9px]">{reactionCounts[t]}</span>
              </span>
            ) : null
          )}
          {commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <MessageSquare className="h-2.5 w-2.5" />{commentCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function AdminOverlay({ canPost, post, onEdit, onArchiveToggle }: {
  canPost: boolean; post: BulletinPost; onEdit: () => void; onArchiveToggle: () => void;
}) {
  if (!canPost) return null;
  return (
    <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
      <Button variant="secondary" size="icon" className="h-5 w-5 bg-white/90 backdrop-blur-sm shadow-sm border border-border/50"
        onClick={(e) => { e.stopPropagation(); onEdit(); }}>
        <Pencil className="h-2.5 w-2.5" />
      </Button>
      <Button variant="secondary" size="icon" className="h-5 w-5 bg-white/90 backdrop-blur-sm shadow-sm border border-border/50"
        onClick={(e) => { e.stopPropagation(); onArchiveToggle(); }}>
        {post.status === "active" ? <Archive className="h-2.5 w-2.5" /> : <ArchiveRestore className="h-2.5 w-2.5" />}
      </Button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Main BulletinCard — Pinterest-style masonry card
   Cards size themselves naturally based on content.
   ════════════════════════════════════════════════════════════════ */
export default function BulletinCard({ post, isNew, isMentioned, canPost, onView, onEdit, onArchiveToggle }: BulletinTileProps) {
  const { data: counts } = useEngagement(post.id);
  const reactionCounts = counts?.reactions ?? {};
  const commentCount = counts?.comments ?? 0;
  const { type, imageUrl } = detectCardType(post);

  const mentionRing = isMentioned ? "ring-2 ring-primary/50 ring-offset-1" : "";
  const newGlow = isNew && !isMentioned ? "ring-2 ring-red-400/50 ring-offset-1 shadow-md shadow-red-500/10" : "";

  const base = `group relative rounded-xl bg-white overflow-hidden cursor-pointer
    border border-gray-300 shadow-sm
    transition-all duration-150 hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5
    ${mentionRing} ${newGlow}`;

  const preview = getTextPreview(post.content_body, type === "image" ? 60 : 90);

  /* ── Image card ── */
  if (type === "image" && imageUrl) {
    return (
      <div data-unread={isNew ? "true" : undefined} className={base} onClick={onView}>
        <img src={imageUrl} alt={post.title} className="w-full object-cover" style={{ maxHeight: 220 }} loading="lazy" />
        <div className="p-2.5 flex flex-col gap-1">
          <TileBadges post={post} isMentioned={isMentioned} isNew={isNew} />
          <h3 className="font-semibold text-[13px] text-foreground leading-tight line-clamp-2">{post.title}</h3>
          {preview && <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">{preview}</p>}
          <div className="pt-1">
            <CardFooter post={post} reactionCounts={reactionCounts} commentCount={commentCount} />
          </div>
        </div>
        <AdminOverlay canPost={canPost} post={post} onEdit={onEdit} onArchiveToggle={onArchiveToggle} />
      </div>
    );
  }

  /* ── Link card ── */
  if (type === "link") {
    return (
      <div data-unread={isNew ? "true" : undefined} className={base} onClick={onView}>
        <div className="p-2.5 flex flex-col gap-1.5">
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/8 flex items-center justify-center shrink-0 border border-primary/10">
              <ExternalLink className="h-3 w-3 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <TileBadges post={post} isMentioned={isMentioned} isNew={isNew} />
              <h3 className="font-semibold text-[13px] text-foreground leading-tight line-clamp-2 mt-px">{post.title}</h3>
            </div>
          </div>
          <p className="text-[10px] text-primary/60 truncate">{post.external_link_label || post.external_link}</p>
          {preview && <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">{preview}</p>}
          <div className="pt-1">
            <CardFooter post={post} reactionCounts={reactionCounts} commentCount={commentCount} />
          </div>
        </div>
        <AdminOverlay canPost={canPost} post={post} onEdit={onEdit} onArchiveToggle={onArchiveToggle} />
      </div>
    );
  }

  /* ── PDF card ── */
  if (type === "pdf") {
    return (
      <div data-unread={isNew ? "true" : undefined} className={base} onClick={onView}>
        <div className="p-2.5 flex flex-col gap-1.5">
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0 border border-red-100">
              <FileText className="h-3 w-3 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <TileBadges post={post} isMentioned={isMentioned} isNew={isNew} />
              <h3 className="font-semibold text-[13px] text-foreground leading-tight line-clamp-2 mt-px">{post.title}</h3>
            </div>
          </div>
          {preview && <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">{preview}</p>}
          <div className="pt-1">
            <CardFooter post={post} reactionCounts={reactionCounts} commentCount={commentCount} />
          </div>
        </div>
        <AdminOverlay canPost={canPost} post={post} onEdit={onEdit} onArchiveToggle={onArchiveToggle} />
      </div>
    );
  }

  /* ── Text card ── */
  return (
    <div data-unread={isNew ? "true" : undefined} className={base} onClick={onView}>
      <div className="p-2.5 flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0 border border-border/50">
            <Megaphone className="h-3 w-3 text-primary/60" />
          </div>
          <div className="flex-1 min-w-0">
            <TileBadges post={post} isMentioned={isMentioned} isNew={isNew} />
            <h3 className="font-semibold text-[13px] text-foreground leading-tight line-clamp-2 mt-px">{post.title}</h3>
          </div>
        </div>
        {preview && <p className="text-[11px] text-muted-foreground leading-snug line-clamp-3">{preview}</p>}
        <div className="pt-1">
          <CardFooter post={post} reactionCounts={reactionCounts} commentCount={commentCount} />
        </div>
      </div>
      <AdminOverlay canPost={canPost} post={post} onEdit={onEdit} onArchiveToggle={onArchiveToggle} />
    </div>
  );
}
