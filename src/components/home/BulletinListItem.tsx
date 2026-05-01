import { Megaphone, Pencil, Archive, ArchiveRestore, MessageSquare, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BulletinPost } from "./BulletinBoard";

const EMOJI_MAP: Record<string, string> = {
  like: "👍",
  love: "❤️",
  celebrate: "🎉",
  applaud: "👏",
  acknowledged: "✅",
};

const EMOJI_ORDER = ["like", "love", "celebrate", "applaud", "acknowledged"];

interface Props {
  post: BulletinPost;
  isNew: boolean;
  isMentioned?: boolean;
  canPost: boolean;
  onView: () => void;
  onEdit: () => void;
  onArchiveToggle: () => void;
}

export default function BulletinListItem({ post, isNew, isMentioned, canPost, onView, onEdit, onArchiveToggle }: Props) {
  const { data: counts } = useQuery({
    queryKey: ["bulletin-engagement-counts", post.id],
    queryFn: async () => {
      const [reactions, comments] = await Promise.all([
        supabase.from("bulletin_reactions").select("reaction_type").eq("bulletin_post_id", post.id),
        supabase.from("bulletin_comments").select("id", { count: "exact", head: true }).eq("bulletin_post_id", post.id),
      ]);
      // Group reactions by type
      const grouped: Record<string, number> = {};
      for (const r of reactions.data ?? []) {
        grouped[r.reaction_type] = (grouped[r.reaction_type] || 0) + 1;
      }
      return { reactions: grouped, comments: comments.count ?? 0 };
    },
    staleTime: 30000,
  });

  const reactionCounts = counts?.reactions ?? {};
  const commentCount = counts?.comments ?? 0;

  return (
    <div
      data-unread={isNew ? "true" : undefined}
      className={`relative w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors group ${
        isMentioned
          ? "bg-primary/5 border-l-2 border-l-primary"
          : isNew
          ? "bg-destructive/5 animate-in fade-in duration-500"
          : ""
      }`}
    >
      <button className="w-full text-left flex items-start gap-3" onClick={onView}>
        <Megaphone className="h-4 w-4 mt-0.5 text-primary/60 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground truncate">
              {post.title}
            </span>
            {post.is_pinned && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                PINNED
              </span>
            )}
            {isMentioned && (
              <Badge className="shrink-0 text-[10px] px-2 py-0 h-4 bg-primary hover:bg-primary text-primary-foreground border-0 font-semibold tracking-wide shadow-sm gap-0.5">
                <AtSign className="h-2.5 w-2.5" />
                Mentioned You
              </Badge>
            )}
            {isNew && !isMentioned && (
              <Badge className="shrink-0 text-[10px] px-2 py-0 h-4 bg-destructive hover:bg-destructive text-destructive-foreground border-0 font-extrabold tracking-wide shadow-sm animate-pulse">
                NEW
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {post.audience_label && (
              <span className="text-xs text-muted-foreground truncate">{post.audience_label}</span>
            )}
            <span className="text-[10px] text-muted-foreground/60">
              {format(new Date(post.created_at), "MMM d, yyyy")}
            </span>
            {EMOJI_ORDER.map((type) =>
              reactionCounts[type] ? (
                <span key={type} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  {EMOJI_MAP[type]} {reactionCounts[type]}
                </span>
              ) : null
            )}
            {commentCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <MessageSquare className="h-3 w-3" />
                {commentCount}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Admin actions */}
      {canPost && (
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity absolute right-4 top-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onArchiveToggle();
            }}
          >
            {post.status === "active" ? <Archive className="h-3 w-3" /> : <ArchiveRestore className="h-3 w-3" />}
          </Button>
        </div>
      )}
    </div>
  );
}
